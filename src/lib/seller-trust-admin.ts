import "server-only";

import {
  calculateSellerTrustScoreBreakdown,
  determineSellerTierEligibility,
  type SellerTierEligibilityResult,
} from "@/lib/seller-trust";
import { determineReservePolicyForTier } from "@/lib/seller-trust";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import { banSellerIdentity } from "@/lib/seller-identity";
import type { SellerTier, SellerTrustSnapshot } from "@/types/trust";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

export interface SellerTrustProfileRecord {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  username: string | null;
  role: string;
  seller_tier: SellerTier;
  recommended_seller_tier: SellerTier;
  trust_score: number;
  recommended_trust_score: number;
  completed_order_count: number;
  lifetime_gmv_cents: number;
  trailing_30d_order_count: number;
  trailing_30d_dispute_count: number;
  trailing_90d_order_count: number;
  trailing_90d_dispute_count: number;
  trailing_180d_order_count: number;
  trailing_180d_dispute_count: number;
  buyer_completion_completed_count: number;
  buyer_completion_eligible_order_count: number;
  buyer_completion_rate_bps: number;
  seller_approved_at: string | null;
  first_completed_order_at: string | null;
  authenticity_violation_count: number;
  last_authenticity_violation_at: string | null;
  tier_manually_overridden: boolean;
  tier_manually_overridden_by: string | null;
  tier_override_reason: string | null;
  tier_last_evaluated_at: string | null;
  tier_locked: boolean;
  tier_locked_at: string | null;
  is_founding_seller: boolean;
  tier_3_approved_at: string | null;
  tier_3_approved_by: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  created_at: string;
}

export interface SellerTrustEvaluationRunResult {
  sellerId: string;
  trustScore: number;
  recommendedTier: SellerTier;
  appliedTier: SellerTier;
  changed: boolean;
  banned: boolean;
  reasons: string[];
  adminApprovalRequired: boolean;
}

export interface SellerViolationInput {
  sellerId: string;
  actorUserId: string;
  violationType: "authenticity" | "tag_tampering" | "dispute_rate" | "manual_demotion" | "other";
  orderId?: string | null;
  severity?: "low" | "medium" | "high" | "critical";
  penaltyOutcome?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

function demoteTierOnce(tier: SellerTier): SellerTier {
  if (tier === "tier_3") {
    return "tier_2";
  }

  return "tier_1";
}

function toSnapshot(profile: SellerTrustProfileRecord): SellerTrustSnapshot {
  return {
    sellerTier: profile.seller_tier,
    recommendedSellerTier: profile.recommended_seller_tier,
    trustScore: profile.trust_score,
    recommendedTrustScore: profile.recommended_trust_score,
    completedOrderCount: profile.completed_order_count || 0,
    lifetimeGmvCents: profile.lifetime_gmv_cents || 0,
    trailing30dOrderCount: profile.trailing_30d_order_count || 0,
    trailing30dDisputeCount: profile.trailing_30d_dispute_count || 0,
    trailing90dOrderCount: profile.trailing_90d_order_count || 0,
    trailing90dDisputeCount: profile.trailing_90d_dispute_count || 0,
    trailing180dOrderCount: profile.trailing_180d_order_count || 0,
    trailing180dDisputeCount: profile.trailing_180d_dispute_count || 0,
    buyerCompletionCompletedCount: profile.buyer_completion_completed_count || 0,
    buyerCompletionEligibleOrderCount: profile.buyer_completion_eligible_order_count || 0,
    buyerCompletionRateBps: profile.buyer_completion_rate_bps || 0,
    authenticityViolationCount: profile.authenticity_violation_count || 0,
    tierManuallyOverridden: profile.tier_manually_overridden || false,
    tierLocked: profile.tier_locked || false,
    isFoundingSeller: profile.is_founding_seller || false,
    tier3ApprovedAt: profile.tier_3_approved_at,
    createdAt: profile.created_at,
    sellerApprovedAt: profile.seller_approved_at,
    firstCompletedOrderAt: profile.first_completed_order_at,
    lastAuthenticityViolationAt: profile.last_authenticity_violation_at,
  };
}

async function refreshSellerMetrics(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const { data: orders, error: ordersError } = await adminClient
    .from("orders")
    .select("id, status, price, created_at")
    .eq("seller_id", sellerId);

  if (ordersError) {
    throw new Error(ordersError.message || "Failed to load seller orders");
  }

  const now = Date.now();
  const dayMs = 1000 * 60 * 60 * 24;
  const ordersList = (orders || []) as Array<{
    id: string;
    status: string;
    price: number;
    created_at: string;
  }>;

  const completedOrders = ordersList.filter((order) => order.status === "completed");
  const eligibleBuyerCompletionStatuses = new Set([
    "completed",
    "disputed",
    "refunded",
    "return_pending",
    "return_shipped",
    "return_delivered",
  ]);

  const eligibleCompletionOrders = ordersList.filter((order) =>
    eligibleBuyerCompletionStatuses.has(order.status)
  );

  const withinDays = (iso: string, days: number) =>
    now - new Date(iso).getTime() <= dayMs * days;

  const trailing30Orders = eligibleCompletionOrders.filter((order) => withinDays(order.created_at, 30));
  const trailing90Orders = eligibleCompletionOrders.filter((order) => withinDays(order.created_at, 90));
  const trailing180Orders = eligibleCompletionOrders.filter((order) => withinDays(order.created_at, 180));

  const trailing30Disputes = ordersList.filter(
    (order) => order.status === "disputed" && withinDays(order.created_at, 30)
  );
  const trailing90Disputes = ordersList.filter(
    (order) => order.status === "disputed" && withinDays(order.created_at, 90)
  );
  const trailing180Disputes = ordersList.filter(
    (order) => order.status === "disputed" && withinDays(order.created_at, 180)
  );

  const lifetimeGmvCents = completedOrders.reduce(
    (sum, order) => sum + Math.round((Number(order.price) || 0) * 100),
    0
  );
  const buyerCompletionEligibleOrderCount = eligibleCompletionOrders.length;
  const buyerCompletionCompletedCount = completedOrders.length;
  const buyerCompletionRateBps =
    buyerCompletionEligibleOrderCount > 0
      ? Math.max(
          0,
          Math.min(
            10000,
            Math.round(
              (buyerCompletionCompletedCount * 10000) / buyerCompletionEligibleOrderCount
            )
          )
        )
      : 10000;

  const firstCompletedOrderAt =
    completedOrders
      .map((order) => order.created_at)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || null;

  const metrics = {
    completed_order_count: completedOrders.length,
    lifetime_gmv_cents: lifetimeGmvCents,
    buyer_completion_completed_count: buyerCompletionCompletedCount,
    buyer_completion_eligible_order_count: buyerCompletionEligibleOrderCount,
    buyer_completion_rate_bps: buyerCompletionRateBps,
    trailing_30d_order_count: trailing30Orders.length,
    trailing_30d_dispute_count: trailing30Disputes.length,
    trailing_90d_order_count: trailing90Orders.length,
    trailing_90d_dispute_count: trailing90Disputes.length,
    trailing_180d_order_count: trailing180Orders.length,
    trailing_180d_dispute_count: trailing180Disputes.length,
    first_completed_order_at: firstCompletedOrderAt,
  };

  const { error: updateError } = await adminClient
    .from("profiles")
    .update(metrics)
    .eq("id", sellerId);

  if (updateError) {
    throw new Error(updateError.message || "Failed to refresh seller metrics");
  }

  return metrics;
}

async function getSellerProfile(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", sellerId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Seller not found");
  }

  return data as SellerTrustProfileRecord;
}

async function appendTierHistory(
  adminClient: SupabaseAdminClient,
  input: {
    sellerId: string;
    previousTier: SellerTier | null;
    newTier: SellerTier;
    recommendedTier: SellerTier;
    trustScore: number;
    changeSource:
      | "automated_evaluation"
      | "manual_override"
      | "manual_unlock"
      | "admin_approval"
      | "authenticity_violation"
      | "tag_tampering_violation"
      | "dispute_rate_demotion";
    actorUserId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await adminClient.from("seller_tier_history").insert({
    seller_id: input.sellerId,
    previous_tier: input.previousTier,
    new_tier: input.newTier,
    recommended_tier: input.recommendedTier,
    trust_score: input.trustScore,
    change_source: input.changeSource,
    actor_user_id: input.actorUserId || null,
    reason: input.reason || null,
    metadata: input.metadata || {},
  });

  if (error) {
    console.error("Failed to append seller tier history:", error);
  }
}

export async function evaluateSellerTrustById(
  adminClient: SupabaseAdminClient,
  sellerId: string,
  options?: {
    actorUserId?: string | null;
    actorRole?: "system" | "admin";
    source?: "automated" | "manual";
  }
): Promise<SellerTrustEvaluationRunResult> {
  await refreshSellerMetrics(adminClient, sellerId);
  const profile = await getSellerProfile(adminClient, sellerId);
  const snapshot = toSnapshot(profile);
  const {
    trustScore,
    breakdown,
    eligibleTier,
    reasons,
    hardThresholds,
    adminApprovalRequired,
  }: SellerTierEligibilityResult = determineSellerTierEligibility(snapshot);

  let appliedTier: SellerTier = eligibleTier;
  const changeReasons = [...reasons];
  let changeSource:
    | "automated_evaluation"
    | "authenticity_violation"
    | "tag_tampering_violation"
    | "dispute_rate_demotion" = "automated_evaluation";

  if (profile.authenticity_violation_count >= 1) {
    appliedTier = "tier_1";
    changeReasons.push("authenticity violation resets seller to Tier 1");
    changeSource = "authenticity_violation";
  }

  const { data: tagTamperingViolations } = await adminClient
    .from("seller_violations")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("violation_type", "tag_tampering")
    .limit(1);

  if ((tagTamperingViolations || []).length > 0 && appliedTier !== "tier_1") {
    appliedTier = demoteTierOnce(appliedTier);
    changeReasons.push("tag tampering violation triggered seller demotion");
    changeSource = "tag_tampering_violation";
  }

  if (
    eligibleTier !== "tier_3" &&
    profile.seller_tier !== "tier_1" &&
    profile.seller_tier !== appliedTier &&
    (profile.trailing_30d_dispute_count > 0 || profile.trailing_180d_dispute_count > 0)
  ) {
    changeSource = "dispute_rate_demotion";
  }

  if (adminApprovalRequired) {
    appliedTier = hardThresholds.tier_2.satisfied ? "tier_2" : "tier_1";
    changeReasons.push("Tier 3 requires admin approval");
  }

  const isBanned = profile.authenticity_violation_count >= 2;
  const actorRole = options?.actorRole || "system";
  const actorUserId = options?.actorUserId || null;

  const updatePayload: Record<string, unknown> = {
    trust_score: trustScore,
    recommended_trust_score: trustScore,
    recommended_seller_tier: eligibleTier,
    tier_last_evaluated_at: new Date().toISOString(),
  };

  if (!profile.tier_locked && !profile.tier_manually_overridden) {
    updatePayload.seller_tier = appliedTier;
  }

  if (isBanned) {
    updatePayload.is_banned = true;
    updatePayload.ban_reason = "Second authenticity violation";
  }

  const { error: profileUpdateError } = await adminClient
    .from("profiles")
    .update(updatePayload)
    .eq("id", sellerId);

  if (profileUpdateError) {
    throw new Error(profileUpdateError.message || "Failed to update seller trust profile");
  }

  const actualAppliedTier =
    profile.tier_locked || profile.tier_manually_overridden ? profile.seller_tier : appliedTier;
  const changed = actualAppliedTier !== profile.seller_tier;

  const reservePolicy = determineReservePolicyForTier(actualAppliedTier);
  await adminClient
    .from("seller_reserve_accounts")
    .upsert(
      {
        seller_id: sellerId,
        minimum_balance_cents: reservePolicy.minimumReserveBalanceCents,
        reserve_percentage_bps: reservePolicy.reservePercentageBps,
        hold_duration_days: reservePolicy.holdDurationDays,
      },
      { onConflict: "seller_id" }
    );

  const { error: evaluationInsertError } = await adminClient
    .from("seller_trust_evaluations")
    .insert({
      seller_id: sellerId,
      trust_score: trustScore,
      recommended_tier: eligibleTier,
      applied_tier: actualAppliedTier,
      was_tier_changed: changed,
      manual_override_applied: profile.tier_manually_overridden,
      admin_approval_required: adminApprovalRequired,
      breakdown,
      reasons: changeReasons,
      hard_thresholds: hardThresholds,
      metadata: {
        source: options?.source || "automated",
        tier_locked: profile.tier_locked,
        is_founding_seller: profile.is_founding_seller,
      },
      evaluated_by_user_id: actorUserId,
    });

  if (evaluationInsertError) {
    console.error("Failed to insert seller trust evaluation:", evaluationInsertError);
  }

  if (changed) {
    await appendTierHistory(adminClient, {
      sellerId,
      previousTier: profile.seller_tier,
      newTier: actualAppliedTier,
      recommendedTier: eligibleTier,
      trustScore,
      changeSource,
      actorUserId,
      reason: changeReasons.join("; "),
      metadata: {
        adminApprovalRequired,
      },
    });

    await logRelayAuditEvent(adminClient, {
      actorUserId,
      actorRole,
      eventType: "seller_tier.changed",
      sellerId,
      metadata: {
        previousTier: profile.seller_tier,
        newTier: actualAppliedTier,
        recommendedTier: eligibleTier,
        trustScore,
        source: changeSource,
        reasons: changeReasons,
      },
    });
  }

  if (isBanned && !profile.is_banned) {
    await banSellerIdentity(sellerId, {
      adminClient,
      actorUserId,
      actorRole,
      reason: "Second authenticity violation",
    });

    await logRelayAuditEvent(adminClient, {
      actorUserId,
      actorRole,
      eventType: "seller.banned",
      sellerId,
      metadata: {
        reason: "Second authenticity violation",
      },
    });
  }

  return {
    sellerId,
    trustScore,
    recommendedTier: eligibleTier,
    appliedTier: actualAppliedTier,
    changed,
    banned: isBanned,
    reasons: changeReasons,
    adminApprovalRequired,
  };
}

export async function evaluateAllSellerTrust(
  adminClient: SupabaseAdminClient,
  options?: {
    actorUserId?: string | null;
    actorRole?: "system" | "admin";
    source?: "automated" | "manual";
  }
) {
  const { data: sellers, error } = await adminClient
    .from("profiles")
    .select("id")
    .eq("role", "seller")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load sellers");
  }

  const results: SellerTrustEvaluationRunResult[] = [];
  for (const seller of sellers || []) {
    results.push(await evaluateSellerTrustById(adminClient, seller.id as string, options));
  }

  return results;
}

export async function recordSellerViolation(
  adminClient: SupabaseAdminClient,
  input: SellerViolationInput
) {
  const profile = await getSellerProfile(adminClient, input.sellerId);
  const nowIso = new Date().toISOString();

  const { data: violation, error } = await adminClient
    .from("seller_violations")
    .insert({
      seller_id: input.sellerId,
      order_id: input.orderId || null,
      violation_type: input.violationType,
      severity: input.severity || "high",
      penalty_outcome: input.penaltyOutcome || null,
      notes: input.notes || null,
      actor_user_id: input.actorUserId,
      metadata: input.metadata || {},
    })
    .select("*")
    .single();

  if (error || !violation) {
    throw new Error(error?.message || "Failed to record seller violation");
  }

  const profileUpdate: Record<string, unknown> = {};
  if (input.violationType === "authenticity") {
    profileUpdate.authenticity_violation_count = (profile.authenticity_violation_count || 0) + 1;
    profileUpdate.last_authenticity_violation_at = nowIso;
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error: updateError } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", input.sellerId);

    if (updateError) {
      throw new Error(updateError.message || "Failed to update seller violation counters");
    }
  }

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId,
    actorRole: "admin",
    eventType: "seller.violation_recorded",
    sellerId: input.sellerId,
    orderId: input.orderId || null,
    metadata: {
      violationType: input.violationType,
      severity: input.severity || "high",
      penaltyOutcome: input.penaltyOutcome || null,
      notes: input.notes || null,
    },
  });

  return violation;
}
