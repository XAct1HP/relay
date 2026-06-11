import "server-only";

import {
  evaluateBuyerCompletionEligibility,
  loadBuyerOrderReviewContext,
  markOrderTagCompleted,
} from "@/lib/buyer-order-review";
import { getOrderFulfillmentGateStatus } from "@/lib/order-auth";
import { releaseEligibleReserveEntries, processOrderPayoutTrigger } from "@/lib/payouts";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import { evaluateAllSellerTrust } from "@/lib/seller-trust-admin";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

const CARRIER_ACCEPTANCE_STATUSES = new Set(["TRANSIT", "IN_TRANSIT"]);
const DELIVERY_STATUSES = new Set(["DELIVERED"]);
const MONTHLY_REPLENISHMENT_POLICY = "monthly_replenishment";
const REVIEW_WINDOW_MS = 48 * 60 * 60 * 1000;

function normalizeTrackingStatus(status: string | null | undefined) {
  return String(status || "").trim().toUpperCase();
}

function roundUpToNearest(value: number, increment: number) {
  if (value <= 0) {
    return 0;
  }

  return Math.ceil(value / increment) * increment;
}

function calculateTier3TagReplenishmentQuantity(input: {
  trailing30dCompletedOrders: number;
  availableAssignedInventory: number;
}) {
  if (input.trailing30dCompletedOrders <= 0) {
    return 0;
  }

  // Keep roughly 20% headroom over trailing usage, then only ask for the shortfall.
  const targetInventory = Math.max(
    25,
    roundUpToNearest(Math.ceil(input.trailing30dCompletedOrders * 1.2), 25)
  );

  return Math.max(0, targetInventory - input.availableAssignedInventory);
}

async function updateRelayTagShipmentState(
  adminClient: SupabaseAdminClient,
  input: {
    relayTagId: string | null;
    status: "shipped";
    at: string;
  }
) {
  if (!input.relayTagId) {
    return;
  }

  await adminClient
    .from("relay_tags")
    .update({
      status: input.status,
      shipped_at: input.at,
    })
    .eq("id", input.relayTagId)
    .not("status", "eq", "completed")
    .not("status", "eq", "buyer_scanned");
}

export async function handleShippoTrackingWebhookEvent(
  adminClient: SupabaseAdminClient,
  input: {
    trackingNumber: string;
    trackingStatus: string;
    rawEvent?: Record<string, unknown>;
  }
) {
  const nowIso = new Date().toISOString();
  const normalizedStatus = normalizeTrackingStatus(input.trackingStatus);
  const { data: order, error } = await adminClient
    .from("orders")
    .select(`
      id,
      seller_id,
      status,
      tracking_status,
      shipped_at,
      delivered_at,
      review_deadline,
      seller_funds_frozen,
      payout_status,
      seller_tier_snapshot,
      relay_tag_id
    `)
    .eq("tracking_number", input.trackingNumber)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load order for tracking update");
  }

  if (!order) {
    return {
      handled: false,
      reason: "order_not_found",
      trackingNumber: input.trackingNumber,
      trackingStatus: normalizedStatus,
    };
  }

  if (order.tracking_status !== normalizedStatus) {
    await adminClient
      .from("orders")
      .update({
        tracking_status: normalizedStatus,
      })
      .eq("id", order.id);
  }

  if (CARRIER_ACCEPTANCE_STATUSES.has(normalizedStatus)) {
    const transitionedToShipped = order.status === "label_created";
    if (transitionedToShipped) {
      await adminClient
        .from("orders")
        .update({
          status: "shipped",
          shipped_at: order.shipped_at || nowIso,
        })
        .eq("id", order.id)
        .eq("status", "label_created");

      await updateRelayTagShipmentState(adminClient, {
        relayTagId: order.relay_tag_id || null,
        status: "shipped",
        at: order.shipped_at || nowIso,
      });
    }

    let payoutResult:
      | {
          processedSteps: Array<{ id: string }>;
          blocked?: string;
        }
      | undefined;
    let gateBlockedReason: string | null = null;

    if ((order.seller_tier_snapshot || "tier_1") === "tier_3") {
      const gateStatus = await getOrderFulfillmentGateStatus(adminClient, order.id);
      if (gateStatus.labelReady && !order.seller_funds_frozen && order.payout_status !== "frozen") {
        payoutResult = await processOrderPayoutTrigger(adminClient, {
          orderId: order.id,
          trigger: "carrier_acceptance",
          actorRole: "system",
        });
      } else {
        gateBlockedReason =
          gateStatus.labelBlockedReasons[0] ||
          (order.seller_funds_frozen || order.payout_status === "frozen"
            ? "Payout is frozen for this order."
            : "Order is not eligible for carrier-acceptance payout.");
      }
    }

    await logRelayAuditEvent(adminClient, {
      actorRole: "system",
      orderId: order.id,
      sellerId: order.seller_id,
      eventType: "shippo.carrier_acceptance_recorded",
      metadata: {
        trackingNumber: input.trackingNumber,
        trackingStatus: normalizedStatus,
        transitionedToShipped,
        tierSnapshot: order.seller_tier_snapshot || "tier_1",
        payoutStepsProcessed: payoutResult?.processedSteps.length || 0,
        payoutBlockedReason: payoutResult?.blocked || gateBlockedReason,
        rawEvent: input.rawEvent || null,
      },
    });

    return {
      handled: true,
      orderId: order.id,
      event: "carrier_acceptance",
      transitionedToShipped,
      payoutStepsProcessed: payoutResult?.processedSteps.length || 0,
      payoutBlockedReason: payoutResult?.blocked || gateBlockedReason,
    };
  }

  if (DELIVERY_STATUSES.has(normalizedStatus)) {
    const nextReviewDeadline =
      order.review_deadline || new Date(Date.now() + REVIEW_WINDOW_MS).toISOString();
    const transitionedToDelivered =
      order.status === "shipped" || order.status === "label_created";

    if (transitionedToDelivered || !order.review_deadline || !order.delivered_at) {
      await adminClient
        .from("orders")
        .update({
          status: transitionedToDelivered ? "delivered" : order.status,
          delivered_at: order.delivered_at || nowIso,
          review_deadline: nextReviewDeadline,
        })
        .eq("id", order.id);
    }

    let payoutResult:
      | {
          processedSteps: Array<{ id: string }>;
          blocked?: string;
        }
      | undefined;
    let gateBlockedReason: string | null = null;
    const tierSnapshot = order.seller_tier_snapshot || "tier_1";

    if (tierSnapshot === "tier_2" || tierSnapshot === "tier_3") {
      const gateStatus = await getOrderFulfillmentGateStatus(adminClient, order.id);
      if (gateStatus.labelReady && !order.seller_funds_frozen && order.payout_status !== "frozen") {
        payoutResult = await processOrderPayoutTrigger(adminClient, {
          orderId: order.id,
          trigger: "delivery",
          actorRole: "system",
        });
      } else {
        gateBlockedReason =
          gateStatus.labelBlockedReasons[0] ||
          (order.seller_funds_frozen || order.payout_status === "frozen"
            ? "Payout is frozen for this order."
            : "Order is not eligible for delivery payout.");
      }
    }

    await logRelayAuditEvent(adminClient, {
      actorRole: "system",
      orderId: order.id,
      sellerId: order.seller_id,
      eventType: "shippo.delivery_recorded",
      metadata: {
        trackingNumber: input.trackingNumber,
        trackingStatus: normalizedStatus,
        transitionedToDelivered,
        deliveredAt: order.delivered_at || nowIso,
        reviewDeadline: nextReviewDeadline,
        tierSnapshot,
        payoutStepsProcessed: payoutResult?.processedSteps.length || 0,
        payoutBlockedReason: payoutResult?.blocked || gateBlockedReason,
        rawEvent: input.rawEvent || null,
      },
    });

    return {
      handled: true,
      orderId: order.id,
      event: "delivery",
      transitionedToDelivered,
      payoutStepsProcessed: payoutResult?.processedSteps.length || 0,
      payoutBlockedReason: payoutResult?.blocked || gateBlockedReason,
    };
  }

  return {
    handled: true,
    orderId: order.id,
    event: "tracking_update_only",
  };
}

export async function runAutoCompleteReviewWindowJob(
  adminClient: SupabaseAdminClient,
  nowIso = new Date().toISOString()
) {
  const { data: candidateOrders, error: queryError } = await adminClient
    .from("orders")
    .select("id")
    .in("status", ["delivered", "review_window"])
    .not("review_deadline", "is", null)
    .lt("review_deadline", nowIso);

  if (queryError) {
    throw new Error(queryError.message || "Failed to query orders for auto-complete");
  }

  const results: { orderId: string; status: string; error?: string }[] = [];

  for (const candidate of candidateOrders || []) {
    try {
      const reviewContext = await loadBuyerOrderReviewContext(adminClient, candidate.id);
      const eligibility = evaluateBuyerCompletionEligibility(reviewContext);

      if (!eligibility.canAutoComplete) {
        results.push({
          orderId: candidate.id,
          status: "blocked",
          error: eligibility.autoCompleteBlockedReasons.join(" "),
        });
        continue;
      }

      const payoutResult = await processOrderPayoutTrigger(adminClient, {
        orderId: candidate.id,
        trigger: "review_window_expiry",
        actorRole: "system",
      });

      const { data: order, error: orderError } = await adminClient
        .from("orders")
        .select("id, seller_id, relay_tag_id")
        .eq("id", candidate.id)
        .single();

      if (orderError || !order) {
        results.push({
          orderId: candidate.id,
          status: "error",
          error: orderError?.message || "Order not found",
        });
        continue;
      }

      const { error: updateError } = await adminClient
        .from("orders")
        .update({
          status: "completed",
          seller_funds_frozen: false,
        })
        .eq("id", order.id)
        .in("status", ["delivered", "review_window"]);

      if (updateError) {
        results.push({
          orderId: order.id,
          status: "error",
          error: updateError.message || "DB update failed",
        });
        continue;
      }

      await markOrderTagCompleted(adminClient, {
        relayTagId: order.relay_tag_id,
        orderId: order.id,
      });

      await logRelayAuditEvent(adminClient, {
        actorRole: "system",
        orderId: order.id,
        sellerId: order.seller_id,
        eventType: "order.auto_completed_after_review_window",
        metadata: {
          reviewDeadlinePassed: true,
          payoutStepsProcessed: payoutResult.processedSteps.length,
          payoutBlockedReason: payoutResult.blocked || null,
        },
      });

      results.push({ orderId: order.id, status: "completed" });
    } catch (error) {
      results.push({
        orderId: candidate.id,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    processed: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status !== "completed").length,
    results,
  };
}

export async function runReserveReleaseJob(
  adminClient: SupabaseAdminClient,
  nowIso = new Date().toISOString()
) {
  return releaseEligibleReserveEntries(adminClient, {
    actorRole: "system",
    nowIso,
  });
}

export async function runDailySellerTrustEvaluationJob(
  adminClient: SupabaseAdminClient
) {
  const results = await evaluateAllSellerTrust(adminClient, {
    actorRole: "system",
    source: "automated",
  });

  return {
    processed: results.length,
    changed: results.filter((result) => result.changed).length,
    banned: results.filter((result) => result.banned).length,
    results,
  };
}

export async function runMonthlyTier3TagReplenishmentJob(
  adminClient: SupabaseAdminClient,
  runDate = new Date()
) {
  const monthStart = new Date(Date.UTC(runDate.getUTCFullYear(), runDate.getUTCMonth(), 1));
  const monthStartIso = monthStart.toISOString();
  const trailing30dIso = new Date(runDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sellers, error: sellersError } = await adminClient
    .from("profiles")
    .select("id, seller_tier, is_banned")
    .eq("role", "seller")
    .eq("seller_tier", "tier_3");

  if (sellersError) {
    throw new Error(sellersError.message || "Failed to load Tier 3 sellers");
  }

  const eligibleSellerIds = (sellers || [])
    .filter((seller) => !seller.is_banned)
    .map((seller) => seller.id as string);

  if (eligibleSellerIds.length === 0) {
    return {
      processed: 0,
      created: 0,
      skipped: 0,
      requests: [],
    };
  }

  const [ordersResult, tagsResult, existingRequestsResult] = await Promise.all([
    adminClient
      .from("orders")
      .select("seller_id, status, created_at")
      .in("seller_id", eligibleSellerIds)
      .eq("status", "completed")
      .gte("created_at", trailing30dIso),
    adminClient
      .from("relay_tags")
      .select("assigned_seller_id, status")
      .in("assigned_seller_id", eligibleSellerIds),
    adminClient
      .from("seller_tag_requests")
      .select("id, seller_id, status, metadata, created_at")
      .in("seller_id", eligibleSellerIds)
      .eq("policy_type", MONTHLY_REPLENISHMENT_POLICY)
      .gte("created_at", monthStartIso),
  ]);

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message || "Failed to load trailing completed orders");
  }
  if (tagsResult.error) {
    throw new Error(tagsResult.error.message || "Failed to load seller tag inventory");
  }
  if (existingRequestsResult.error) {
    throw new Error(existingRequestsResult.error.message || "Failed to load existing replenishment requests");
  }

  const completedCountBySeller = new Map<string, number>();
  for (const order of ordersResult.data || []) {
    completedCountBySeller.set(
      order.seller_id,
      (completedCountBySeller.get(order.seller_id) || 0) + 1
    );
  }

  const availableInventoryBySeller = new Map<string, number>();
  for (const tag of tagsResult.data || []) {
    if (tag.status !== "assigned_to_seller") {
      continue;
    }

    availableInventoryBySeller.set(
      tag.assigned_seller_id,
      (availableInventoryBySeller.get(tag.assigned_seller_id) || 0) + 1
    );
  }

  const existingRequestBySeller = new Set<string>();
  for (const request of existingRequestsResult.data || []) {
    existingRequestBySeller.add(request.seller_id);
  }

  const requests: any[] = [];
  let skipped = 0;

  for (const sellerId of eligibleSellerIds) {
    if (existingRequestBySeller.has(sellerId)) {
      skipped += 1;
      continue;
    }

    const trailing30dCompletedOrders = completedCountBySeller.get(sellerId) || 0;
    const availableAssignedInventory = availableInventoryBySeller.get(sellerId) || 0;
    const requestedQuantity = calculateTier3TagReplenishmentQuantity({
      trailing30dCompletedOrders,
      availableAssignedInventory,
    });

    if (requestedQuantity <= 0) {
      skipped += 1;
      continue;
    }

    const requestReason = `Monthly Tier 3 replenishment recommendation based on ${trailing30dCompletedOrders} completed orders in the last 30 days and ${availableAssignedInventory} tags currently assigned.`;
    const { data: createdRequest, error: createError } = await adminClient
      .from("seller_tag_requests")
      .insert({
        seller_id: sellerId,
        requested_quantity: requestedQuantity,
        seller_tier_snapshot: "tier_3",
        policy_type: MONTHLY_REPLENISHMENT_POLICY,
        request_reason: requestReason,
        status: "pending",
        metadata: {
          source: "monthly_replenishment_job",
          periodStart: monthStartIso,
          trailing30dCompletedOrders,
          availableAssignedInventory,
          targetInventory: availableAssignedInventory + requestedQuantity,
        },
      })
      .select("*")
      .single();

    if (createError || !createdRequest) {
      throw new Error(createError?.message || "Failed to create replenishment request");
    }

    await logRelayAuditEvent(adminClient, {
      actorRole: "system",
      sellerId,
      eventType: "relay_tag.monthly_replenishment_requested",
      metadata: {
        requestId: createdRequest.id,
        requestedQuantity,
        trailing30dCompletedOrders,
        availableAssignedInventory,
        periodStart: monthStartIso,
      },
    });

    requests.push(createdRequest);
  }

  return {
    processed: eligibleSellerIds.length,
    created: requests.length,
    skipped,
    requests,
  };
}
