import "server-only";

import Stripe from "stripe";
import { logRelayAuditEvent } from "./relay-audit";
import {
  createExposureHold,
  createOrderPendingCredit,
  calculateStripeFeeEstimateCents,
  debitSellerForDispute,
  freezeFundsForDispute,
  releaseOrderFundsToAvailable,
  releaseExposureHold,
} from "./money-policy";
import { determinePayoutPolicyForTier } from "./seller-trust";
import { evaluateSellerTrustById, recordSellerViolation } from "./seller-trust-admin";
import {
  buildOrderPayoutIdempotencyKey,
  calculatePayoutAllocation,
  getPayoutStepDefinitions,
  getStepWithCumulativeBps,
  inferPayoutStatus,
  resolveTargetRankForTrigger,
  type OrderPayoutPolicySnapshot,
  type OrderPayoutStepKey,
  type OrderPayoutTrigger,
} from "./payout-calculations";
import type { SellerTier } from "../types";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin").createAdminClient>;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

type ActorRole = "system" | "admin" | "seller" | "buyer";

interface PayoutStepRow {
  id: string;
  payout_step: OrderPayoutStepKey;
  status: "pending" | "paid" | "frozen" | "failed" | "cancelled";
  gross_amount_cents: number;
  reserve_withheld_cents: number;
  minimum_balance_top_up_cents: number;
  net_paid_cents: number;
  stripe_transfer_id: string | null;
  idempotency_key: string;
}

interface ReserveEntryRow {
  id: string;
  seller_id: string;
  order_id: string | null;
  order_payout_id: string | null;
  amount_cents: number;
  entry_type: "hold" | "release" | "consume" | "adjustment" | "minimum_balance_seed";
  status: "pending" | "held" | "released" | "consumed";
  is_frozen: boolean;
}

interface OrderPayoutContext {
  id: string;
  seller_id: string;
  buyer_id: string;
  status: string;
  seller_earnings: number | null;
  seller_proceeds_cents: number | null;
  stripe_transfer_id: string | null;
  stripe_payment_intent_id: string | null;
  seller_funds_frozen: boolean | null;
  seller_tier_snapshot: SellerTier | null;
  payout_schedule: OrderPayoutPolicySnapshot["payoutSchedule"] | null;
  reserve_percentage_bps_snapshot: number | null;
  reserve_hold_duration_days_snapshot: number | null;
  minimum_reserve_balance_cents_snapshot: number | null;
  payout_status: string | null;
  seller_amount_paid_cents: number | null;
  seller_amount_held_in_reserve_cents: number | null;
  seller_amount_frozen_cents: number | null;
  seller_amount_refunded_cents: number | null;
  relay_tag_id: string | null;
  seller: {
    id: string;
    seller_tier: SellerTier | null;
    stripe_account_id: string | null;
  } | null;
}

export interface OrderPayoutSnapshotResult extends OrderPayoutPolicySnapshot {
  sellerTierSnapshot: SellerTier;
}

export function buildOrderPayoutSnapshotForTier(
  sellerTier: SellerTier
): OrderPayoutSnapshotResult {
  const payoutPolicy = determinePayoutPolicyForTier(sellerTier);

  return {
    sellerTierSnapshot: sellerTier,
    payoutSchedule: payoutPolicy.schedule,
    reservePercentageBps: 0,
    reserveHoldDurationDays: null,
    minimumReserveBalanceCents: 0,
  };
}

function toCents(value: number | string | null | undefined) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

async function ensureReserveAccount(
  adminClient: SupabaseAdminClient,
  sellerId: string,
  snapshot: OrderPayoutSnapshotResult
) {
  const { data } = await adminClient
    .from("seller_reserve_accounts")
    .upsert(
      {
        seller_id: sellerId,
        minimum_balance_cents: snapshot.minimumReserveBalanceCents,
        reserve_percentage_bps: snapshot.reservePercentageBps,
        hold_duration_days: snapshot.reserveHoldDurationDays,
      },
      { onConflict: "seller_id" }
    )
    .select("*")
    .single();

  return data as {
    id: string;
    seller_id: string;
    balance_cents: number;
    minimum_balance_cents: number;
    reserve_percentage_bps: number;
    hold_duration_days: number | null;
  };
}

async function getOrderPayoutContext(
  adminClient: SupabaseAdminClient,
  orderId: string
) {
  const { data, error } = await adminClient
    .from("orders")
    .select(`
      id,
      seller_id,
      buyer_id,
      status,
      seller_earnings,
      seller_proceeds_cents,
      stripe_transfer_id,
      stripe_payment_intent_id,
      seller_funds_frozen,
      seller_tier_snapshot,
      payout_schedule,
      reserve_percentage_bps_snapshot,
      reserve_hold_duration_days_snapshot,
      minimum_reserve_balance_cents_snapshot,
      payout_status,
      seller_amount_paid_cents,
      seller_amount_held_in_reserve_cents,
      seller_amount_frozen_cents,
      seller_amount_refunded_cents,
      relay_tag_id,
      seller:profiles!orders_seller_id_fkey(
        id,
        seller_tier,
        stripe_account_id
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Order not found");
  }

  const seller = Array.isArray((data as any).seller)
    ? (data as any).seller[0]
    : (data as any).seller;

  return {
    ...(data as unknown as OrderPayoutContext),
    seller: seller || null,
  };
}

async function ensureOrderPayoutSnapshot(
  adminClient: SupabaseAdminClient,
  order: OrderPayoutContext
) {
  const snapshot =
    order.seller_tier_snapshot &&
    order.payout_schedule &&
    order.reserve_percentage_bps_snapshot !== null &&
    order.minimum_reserve_balance_cents_snapshot !== null
      ? {
          sellerTierSnapshot: order.seller_tier_snapshot,
          payoutSchedule: order.payout_schedule,
          reservePercentageBps: order.reserve_percentage_bps_snapshot,
          reserveHoldDurationDays: order.reserve_hold_duration_days_snapshot,
          minimumReserveBalanceCents:
            order.minimum_reserve_balance_cents_snapshot,
        }
      : buildOrderPayoutSnapshotForTier(order.seller?.seller_tier || "tier_1");

  const shouldPersist =
    !order.seller_tier_snapshot ||
    !order.payout_schedule ||
    order.reserve_percentage_bps_snapshot === null ||
    order.minimum_reserve_balance_cents_snapshot === null;

  if (shouldPersist) {
    await adminClient
      .from("orders")
      .update({
        seller_tier_snapshot: snapshot.sellerTierSnapshot,
        payout_schedule: snapshot.payoutSchedule,
        reserve_percentage_bps_snapshot: snapshot.reservePercentageBps,
        reserve_hold_duration_days_snapshot: snapshot.reserveHoldDurationDays,
        minimum_reserve_balance_cents_snapshot:
          snapshot.minimumReserveBalanceCents,
      })
      .eq("id", order.id);
  }

  return snapshot;
}

async function getExistingPayoutRows(
  adminClient: SupabaseAdminClient,
  orderId: string
) {
  const { data, error } = await adminClient
    .from("order_payouts")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load order payout rows");
  }

  return (data || []) as PayoutStepRow[];
}

function getForcedReleaseKeysForTrigger(
  snapshot: OrderPayoutSnapshotResult,
  trigger: OrderPayoutTrigger
): Array<"buyer_confirmation_or_review_expiry" | "delivery" | "carrier_acceptance"> {
  if (trigger === "buyer_confirmation") {
    return ["buyer_confirmation_or_review_expiry"];
  }

  if (trigger !== "manual_override") {
    return [];
  }

  if (snapshot.payoutSchedule === "carrier_acceptance_and_delivery_split") {
    return ["carrier_acceptance", "delivery"];
  }

  if (snapshot.payoutSchedule === "delivery") {
    return ["delivery"];
  }

  return ["buyer_confirmation_or_review_expiry"];
}

async function syncExposureHoldForTrigger(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerTier: SellerTier;
    trigger: OrderPayoutTrigger;
    actorUserId?: string | null;
    actorRole: ActorRole;
    forceRelease?: boolean;
  }
) {
  if (
    input.trigger === "delivery" &&
    (input.sellerTier === "tier_2" || input.sellerTier === "tier_3")
  ) {
    return createExposureHold(input.orderId, {
      adminClient,
      actorUserId: input.actorUserId || null,
      actorRole: input.actorRole,
    });
  }

  if (
    input.forceRelease ||
    input.trigger === "buyer_confirmation" ||
    input.trigger === "review_window_expiry"
  ) {
    return releaseExposureHold(input.orderId, {
      adminClient,
      actorUserId: input.actorUserId || null,
      actorRole: input.actorRole,
    });
  }

  return null;
}

async function syncOrderPayoutSummary(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerEarningsCents: number;
    orderStatus: string;
    sellerFundsFrozen: boolean;
  }
) {
  const [payoutRowsResult, reserveRowsResult] = await Promise.all([
    adminClient
      .from("order_payouts")
      .select("status, net_paid_cents, failure_reason")
      .eq("order_id", input.orderId),
    adminClient
      .from("seller_reserve_entries")
      .select("amount_cents, status, is_frozen")
      .eq("order_id", input.orderId),
  ]);

  const payoutRows = (payoutRowsResult.data || []) as Array<{
    status: string;
    net_paid_cents: number;
    failure_reason?: string | null;
  }>;
  const reserveRows = (reserveRowsResult.data || []) as Array<{
    amount_cents: number;
    status: string;
    is_frozen: boolean;
  }>;

  const totalPaidCents = payoutRows.reduce(
    (sum, row) => sum + (row.status === "paid" ? row.net_paid_cents || 0 : 0),
    0
  );
  const heldReserveCents = reserveRows.reduce((sum, row) => {
    if (row.status !== "held") return sum;
    return sum + (row.amount_cents || 0);
  }, 0);
  const frozenReserveCents = reserveRows.reduce((sum, row) => {
    return row.is_frozen ? sum + (row.amount_cents || 0) : sum;
  }, 0);

  const payoutStatus = inferPayoutStatus({
    totalPaidCents,
    totalExpectedPaidCents: input.sellerEarningsCents,
    isFrozen:
      input.sellerFundsFrozen ||
      input.orderStatus === "disputed" ||
      payoutRows.some((row) => row.status === "frozen"),
    isRefunded: input.orderStatus === "refunded",
    hasFailures: payoutRows.some((row) => row.status === "failed"),
  });

  await adminClient
    .from("orders")
    .update({
      payout_status: payoutStatus,
      seller_amount_paid_cents: totalPaidCents,
      seller_amount_held_in_reserve_cents: heldReserveCents,
      seller_amount_frozen_cents:
        payoutStatus === "frozen" ? Math.max(0, input.sellerEarningsCents) : 0,
      payout_last_processed_at: new Date().toISOString(),
    })
    .eq("id", input.orderId);
}

async function ensureReserveEntriesForPayout(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerId: string;
    orderPayoutId: string;
    reserveWithheldCents: number;
    minimumBalanceTopUpCents: number;
    reservePercentageBps: number;
    reserveHoldDurationDays: number | null;
    actorUserId?: string | null;
    actorRole: ActorRole;
  }
) {
  const { data: existingRows, error: existingRowsError } = await adminClient
    .from("seller_reserve_entries")
    .select("id")
    .eq("order_payout_id", input.orderPayoutId);

  if (existingRowsError) {
    throw new Error(existingRowsError.message || "Failed to inspect reserve entries");
  }

  if ((existingRows || []).length > 0) {
    return;
  }

  const now = new Date();
  const releaseEligibleAt =
    input.reserveHoldDurationDays === null
      ? null
      : new Date(
          now.getTime() + input.reserveHoldDurationDays * 24 * 60 * 60 * 1000
        ).toISOString();
  const rows: Array<Record<string, unknown>> = [];

  if (input.reserveWithheldCents > 0) {
    rows.push({
      seller_id: input.sellerId,
      order_id: input.orderId,
      order_payout_id: input.orderPayoutId,
      entry_type: "hold",
      amount_cents: input.reserveWithheldCents,
      reserve_percentage_bps: input.reservePercentageBps,
      hold_duration_days: input.reserveHoldDurationDays,
      release_eligible_at: releaseEligibleAt,
      status: "held",
      metadata: {
        source: "order_payout",
      },
    });
  }

  if (input.minimumBalanceTopUpCents > 0) {
    rows.push({
      seller_id: input.sellerId,
      order_id: input.orderId,
      order_payout_id: input.orderPayoutId,
      entry_type: "minimum_balance_seed",
      amount_cents: input.minimumBalanceTopUpCents,
      reserve_percentage_bps: 0,
      hold_duration_days: null,
      release_eligible_at: null,
      status: "held",
      metadata: {
        source: "minimum_balance_rebuild",
      },
    });
  }

  if (rows.length === 0) {
    return;
  }

  const { error: reserveInsertError } = await adminClient
    .from("seller_reserve_entries")
    .insert(rows);

  if (reserveInsertError) {
    throw new Error(reserveInsertError.message || "Failed to insert reserve entries");
  }

  const totalReserveIncrease = rows.reduce(
    (sum, row) => sum + Number(row.amount_cents || 0),
    0
  );

  if (totalReserveIncrease > 0) {
    const { data: reserveAccount } = await adminClient
      .from("seller_reserve_accounts")
      .select("balance_cents")
      .eq("seller_id", input.sellerId)
      .single();

    await adminClient
      .from("seller_reserve_accounts")
      .update({
        balance_cents: (reserveAccount?.balance_cents || 0) + totalReserveIncrease,
      })
      .eq("seller_id", input.sellerId);
  }

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
    orderId: input.orderId,
    sellerId: input.sellerId,
    eventType: "order.reserve_held",
    metadata: {
      reserveWithheldCents: input.reserveWithheldCents,
      minimumBalanceTopUpCents: input.minimumBalanceTopUpCents,
      orderPayoutId: input.orderPayoutId,
    },
  });
}

export async function processOrderPayoutTrigger(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    trigger: OrderPayoutTrigger;
    actorUserId?: string | null;
    actorRole: ActorRole;
    allowFrozenProcessing?: boolean;
    overrideReason?: string | null;
  }
) {
  const order = await getOrderPayoutContext(adminClient, input.orderId);
  const snapshot = await ensureOrderPayoutSnapshot(adminClient, order);
  const sellerTier = snapshot.sellerTierSnapshot || order.seller?.seller_tier || "tier_1";
  const existingRows = await getExistingPayoutRows(adminClient, order.id);
  const steps = getPayoutStepDefinitions(snapshot.payoutSchedule);
  const targetRank = resolveTargetRankForTrigger(snapshot.payoutSchedule, input.trigger);

  if (
    (order.seller_funds_frozen || order.payout_status === "frozen" || order.status === "disputed") &&
    !input.allowFrozenProcessing
  ) {
    return { processedSteps: [], snapshot, blocked: "Order payout is frozen" };
  }

  const processedSteps: PayoutStepRow[] = [];
  const sellerEarningsCents =
    Math.max(0, order.seller_proceeds_cents || 0) || toCents(order.seller_earnings);

  await createOrderPendingCredit(order.id, {
    adminClient,
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
  });

  if (targetRank !== null) {
    for (const step of steps.filter((candidate) => candidate.rank <= targetRank)) {
    const existing = existingRows.find((row) => row.payout_step === step.key);
    if (existing?.status === "paid") {
      continue;
    }
    if (existing?.status === "frozen" && !input.allowFrozenProcessing) {
      continue;
    }

    const cumulativeGrossReleasedCents = existingRows
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + (row.gross_amount_cents || 0), 0);
    const cumulativeReserveWithheldCents = existingRows
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + (row.reserve_withheld_cents || 0), 0);
    const stepWithCumulativeBps = getStepWithCumulativeBps(steps, step.key);
    if (!stepWithCumulativeBps) {
      continue;
    }

    const allocation = calculatePayoutAllocation({
      sellerEarningsCents,
      reservePercentageBps: 0,
      currentReserveBalanceCents: 0,
      minimumReserveBalanceCents: 0,
      cumulativeGrossReleasedCents,
      cumulativeReserveWithheldCents,
      step: stepWithCumulativeBps,
    });

    if (allocation.netPaidCents <= 0) {
      continue;
    }

    const idempotencyKey =
      existing?.idempotency_key ||
      buildOrderPayoutIdempotencyKey(order.id, step.key);
    const reserveReleaseEligibleAt = null;

    const payoutPayload = {
      order_id: order.id,
      seller_id: order.seller_id,
      payout_step: step.key,
      status: "pending",
      gross_amount_cents: allocation.grossAmountCents,
      reserve_withheld_cents: 0,
      minimum_balance_top_up_cents: 0,
      net_paid_cents: allocation.netPaidCents,
      reserve_release_eligible_at: reserveReleaseEligibleAt,
      trigger_source: input.trigger,
      idempotency_key: idempotencyKey,
      metadata: {
        overrideReason: input.overrideReason || null,
        releaseDestination: "relay_balance",
      },
    };

    const { data: payoutRow, error: payoutRowError } = await adminClient
      .from("order_payouts")
      .upsert(payoutPayload, { onConflict: "order_id,payout_step" })
      .select("*")
      .single();

    if (payoutRowError || !payoutRow) {
      throw new Error(payoutRowError?.message || "Failed to stage payout row");
    }

    const releaseResult = await releaseOrderFundsToAvailable(order.id, allocation.netPaidCents, {
      adminClient,
      actorUserId: input.actorUserId || null,
      actorRole: input.actorRole,
      forceReleaseKeys: getForcedReleaseKeysForTrigger(snapshot, input.trigger),
    });

    const payoutStatusForRow =
      releaseResult.releasedAmountCents >= allocation.netPaidCents
        ? "paid"
        : "pending";

    const { data: finalizedPayoutRow } = await adminClient
      .from("order_payouts")
      .update({
        status: payoutStatusForRow,
        stripe_transfer_id: null,
        failure_reason: null,
        paid_at:
          payoutStatusForRow === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", payoutRow.id)
      .select("*")
      .single();

    await adminClient
      .from("orders")
      .update({
        payout_last_trigger: input.trigger,
        payout_last_error: null,
      })
      .eq("id", order.id);

    await logRelayAuditEvent(adminClient, {
      actorUserId: input.actorUserId || null,
      actorRole: input.actorRole,
      orderId: order.id,
      sellerId: order.seller_id,
      eventType: "order.balance_release_recorded",
      metadata: {
        payoutStep: step.key,
        trigger: input.trigger,
        grossAmountCents: allocation.grossAmountCents,
        reserveWithheldCents: 0,
        minimumBalanceTopUpCents: 0,
        netPaidCents: allocation.netPaidCents,
        stripeTransferId: null,
        relayBalanceReleasedCents: releaseResult.releasedAmountCents,
      },
    });

    if (finalizedPayoutRow) {
      processedSteps.push(finalizedPayoutRow as PayoutStepRow);
      existingRows.push(finalizedPayoutRow as PayoutStepRow);
    }
  }
  }

  await syncExposureHoldForTrigger(adminClient, {
    orderId: order.id,
    sellerTier,
    trigger: input.trigger,
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
    forceRelease: Boolean(input.allowFrozenProcessing),
  });

  await syncOrderPayoutSummary(adminClient, {
    orderId: order.id,
    sellerEarningsCents,
    orderStatus: order.status,
    sellerFundsFrozen: Boolean(order.seller_funds_frozen),
  });

  return {
    processedSteps,
    snapshot,
  };
}

export async function freezeOrderPayoutsForDispute(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerId: string;
    actorUserId?: string | null;
    actorRole: ActorRole;
    reason: string;
  }
) {
  const order = await getOrderPayoutContext(adminClient, input.orderId);
  const sellerEarningsCents = toCents(order.seller_earnings);
  const nowIso = new Date().toISOString();

  await freezeFundsForDispute(input.orderId, {
    adminClient,
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
  });

  await Promise.all([
    adminClient
      .from("orders")
      .update({
        payout_status: "frozen",
        payout_frozen_at: nowIso,
        payout_frozen_reason: input.reason,
        seller_amount_frozen_cents: Math.max(0, sellerEarningsCents),
      })
      .eq("id", input.orderId),
    adminClient
      .from("order_payouts")
      .update({
        status: "frozen",
        frozen_at: nowIso,
      })
      .eq("order_id", input.orderId)
      .eq("status", "pending"),
    adminClient
      .from("seller_reserve_entries")
      .update({
        is_frozen: true,
        frozen_at: nowIso,
        freeze_reason: input.reason,
      })
      .eq("order_id", input.orderId)
      .eq("status", "held"),
  ]);

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
    orderId: input.orderId,
    sellerId: input.sellerId,
    eventType: "order.payout_frozen",
    metadata: {
      reason: input.reason,
    },
  });
}

export async function unfreezeOrderPayouts(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerId: string;
    actorUserId?: string | null;
    actorRole: ActorRole;
    reason: string;
  }
) {
  const order = await getOrderPayoutContext(adminClient, input.orderId);

  await Promise.all([
    adminClient
      .from("orders")
      .update({
        payout_frozen_at: null,
        payout_frozen_reason: null,
        seller_amount_frozen_cents: 0,
      })
      .eq("id", input.orderId),
    adminClient
      .from("order_payouts")
      .update({
        status: "pending",
        frozen_at: null,
      })
      .eq("order_id", input.orderId)
      .eq("status", "frozen"),
    adminClient
      .from("seller_reserve_entries")
      .update({
        is_frozen: false,
        frozen_at: null,
        freeze_reason: null,
      })
      .eq("order_id", input.orderId),
    adminClient
      .from("exposure_holds")
      .update({
        status: "active",
      })
      .eq("order_id", input.orderId)
      .eq("status", "disputed"),
  ]);

  await syncOrderPayoutSummary(adminClient, {
    orderId: input.orderId,
    sellerEarningsCents: toCents(order.seller_earnings),
    orderStatus: order.status,
    sellerFundsFrozen: false,
  });

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
    orderId: input.orderId,
    sellerId: input.sellerId,
    eventType: "order.payout_unfrozen",
    metadata: {
      reason: input.reason,
    },
  });
}

export async function releaseEligibleReserveEntries(
  adminClient: SupabaseAdminClient,
  input?: {
    sellerId?: string;
    actorUserId?: string | null;
    actorRole?: ActorRole;
    nowIso?: string;
  }
) {
  const nowIso = input?.nowIso || new Date().toISOString();
  let query = adminClient
    .from("seller_reserve_entries")
    .select("*")
    .eq("status", "held")
    .eq("is_frozen", false)
    .not("release_eligible_at", "is", null)
    .lte("release_eligible_at", nowIso);

  if (input?.sellerId) {
    query = query.eq("seller_id", input.sellerId);
  }

  const { data: rows, error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to load releasable reserve entries");
  }

  let releasedEntryCount = 0;
  let releasedAmountCents = 0;

  const groupedBySeller = new Map<string, ReserveEntryRow[]>();
  for (const row of (rows || []) as ReserveEntryRow[]) {
    const bucket = groupedBySeller.get(row.seller_id) || [];
    bucket.push(row);
    groupedBySeller.set(row.seller_id, bucket);
  }

  for (const [sellerId, sellerRows] of Array.from(groupedBySeller.entries())) {
    const { data: reserveAccount } = await adminClient
      .from("seller_reserve_accounts")
      .select("balance_cents")
      .eq("seller_id", sellerId)
      .single();

    const totalRelease = sellerRows.reduce(
      (sum: number, row: ReserveEntryRow) => sum + (row.amount_cents || 0),
      0
    );
    releasedEntryCount += sellerRows.length;
    releasedAmountCents += totalRelease;

    await adminClient
      .from("seller_reserve_accounts")
      .update({
        balance_cents: Math.max(0, (reserveAccount?.balance_cents || 0) - totalRelease),
      })
      .eq("seller_id", sellerId);

    await adminClient
      .from("seller_reserve_entries")
      .update({
        status: "released",
        released_at: nowIso,
      })
      .in(
        "id",
        sellerRows.map((row) => row.id)
      );

    for (const row of sellerRows) {
      await logRelayAuditEvent(adminClient, {
        actorUserId: input?.actorUserId || null,
        actorRole: input?.actorRole || "system",
        orderId: row.order_id,
        sellerId,
        eventType: "order.reserve_released",
        metadata: {
          reserveEntryId: row.id,
          amountCents: row.amount_cents,
        },
      });
    }
  }

  return {
    releasedEntryCount,
    releasedAmountCents,
    sellerCount: groupedBySeller.size,
  };
}

async function consumeReserveBalance(
  adminClient: SupabaseAdminClient,
  input: {
    sellerId: string;
    orderId: string;
    targetConsumeCents: number;
    actorUserId?: string | null;
    actorRole: ActorRole;
  }
) {
  if (input.targetConsumeCents <= 0) {
    return 0;
  }

  const { data: reserveAccount } = await adminClient
    .from("seller_reserve_accounts")
    .select("balance_cents")
    .eq("seller_id", input.sellerId)
    .single();

  let remaining = Math.min(input.targetConsumeCents, reserveAccount?.balance_cents || 0);
  if (remaining <= 0) {
    return 0;
  }

  const { data: heldRows, error: heldRowsError } = await adminClient
    .from("seller_reserve_entries")
    .select("*")
    .eq("seller_id", input.sellerId)
    .eq("status", "held")
    .order("order_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (heldRowsError) {
    throw new Error(heldRowsError.message || "Failed to load held reserve rows");
  }

  const prioritizedRows = ((heldRows || []) as ReserveEntryRow[]).sort((left, right) => {
    if (left.order_id === input.orderId && right.order_id !== input.orderId) return -1;
    if (left.order_id !== input.orderId && right.order_id === input.orderId) return 1;
    return 0;
  });

  let consumed = 0;
  for (const row of prioritizedRows) {
    if (remaining <= 0) break;

    if (row.amount_cents <= remaining) {
      await adminClient
        .from("seller_reserve_entries")
        .update({
          status: "consumed",
          consumed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      remaining -= row.amount_cents;
      consumed += row.amount_cents;
    } else {
      const leftover = row.amount_cents - remaining;
      await adminClient
        .from("seller_reserve_entries")
        .update({
          amount_cents: leftover,
        })
        .eq("id", row.id);

      await adminClient
        .from("seller_reserve_entries")
        .insert({
          seller_id: row.seller_id,
          order_id: input.orderId,
          order_payout_id: row.order_payout_id,
          entry_type: "consume",
          amount_cents: remaining,
          reserve_percentage_bps: 0,
          hold_duration_days: null,
          status: "consumed",
          consumed_at: new Date().toISOString(),
          metadata: {
            source_entry_id: row.id,
          },
        });
      consumed += remaining;
      remaining = 0;
    }
  }

  if (consumed > 0) {
    await adminClient
      .from("seller_reserve_accounts")
      .update({
        balance_cents: Math.max(0, (reserveAccount?.balance_cents || 0) - consumed),
      })
      .eq("seller_id", input.sellerId);
  }

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
    orderId: input.orderId,
    sellerId: input.sellerId,
    eventType: "order.reserve_consumed",
    metadata: {
      amountCents: consumed,
    },
  });

  return consumed;
}

export async function consumeSellerReserveForOrder(
  adminClient: SupabaseAdminClient,
  input: {
    sellerId: string;
    orderId: string;
    targetConsumeCents: number;
    actorUserId?: string | null;
    actorRole: ActorRole;
  }
) {
  return consumeReserveBalance(adminClient, input);
}

export async function finalizeBuyerRefundAndSellerLoss(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    actorUserId?: string | null;
    actorRole: ActorRole;
  }
) {
  const order = await getOrderPayoutContext(adminClient, input.orderId);
  if (!order.stripe_payment_intent_id) {
    throw new Error("No payment intent found for this order");
  }

  const sellerProceedsCents =
    Math.max(0, Number(order.seller_proceeds_cents || 0)) ||
    toCents(order.seller_earnings);

  if (sellerProceedsCents > 0) {
    await releaseOrderFundsToAvailable(order.id, sellerProceedsCents, {
      adminClient,
      actorUserId: input.actorUserId || null,
      actorRole: input.actorRole,
      forceReleaseKeys: [
        "buyer_confirmation_or_review_expiry",
        "delivery",
        "carrier_acceptance",
      ],
    });
  }

  await stripe.refunds.create(
    {
      payment_intent: order.stripe_payment_intent_id,
    },
    {
      idempotencyKey: `order-refund-${order.id}`,
    }
  );

  const debitResult = await debitSellerForDispute(order.id, {
    adminClient,
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
  });
  const debitedAmountCents = debitResult.created
    ? debitResult.sellerProceedsCents
    : debitResult.sellerProceedsCents || 0;

  await adminClient
    .from("orders")
    .update({
      status: "refunded",
      payout_status: "refunded",
      seller_amount_refunded_cents: Math.max(
        order.seller_amount_refunded_cents || 0,
        debitResult.sellerProceedsCents ||
          order.seller_amount_paid_cents ||
          0
      ),
      payout_last_trigger: "manual_override",
      seller_funds_frozen: true,
    })
    .eq("id", order.id);

  await syncOrderPayoutSummary(adminClient, {
    orderId: order.id,
    sellerEarningsCents: toCents(order.seller_earnings),
    orderStatus: "refunded",
    sellerFundsFrozen: false,
  });

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole,
    orderId: order.id,
    sellerId: order.seller_id,
    eventType: "order.buyer_refunded",
    metadata: {
      debitedAmountCents,
    },
  });

  return {
    consumedReserveCents: 0,
    debitedAmountCents,
  };
}

export async function applySellerDisputeLossPenalties(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerId: string;
    category?: string | null;
    actorUserId: string;
    notes?: string | null;
  }
) {
  if (input.category === "authenticity") {
    await recordSellerViolation(adminClient, {
      sellerId: input.sellerId,
      orderId: input.orderId,
      violationType: "authenticity",
      severity: "critical",
      penaltyOutcome: "seller_dispute_loss",
      notes: input.notes || "Buyer won an authenticity dispute.",
      actorUserId: input.actorUserId,
      metadata: {
        orderId: input.orderId,
      },
    });

    await evaluateSellerTrustById(adminClient, input.sellerId, {
      actorUserId: input.actorUserId,
      actorRole: "admin",
      source: "manual",
    });
    return;
  }

  if (input.category === "tampered_tag") {
    await recordSellerViolation(adminClient, {
      sellerId: input.sellerId,
      orderId: input.orderId,
      violationType: "tag_tampering",
      severity: "high",
      penaltyOutcome: "seller_dispute_loss",
      notes: input.notes || "Buyer won a tampered tag dispute.",
      actorUserId: input.actorUserId,
      metadata: {
        orderId: input.orderId,
      },
    });

    await evaluateSellerTrustById(adminClient, input.sellerId, {
      actorUserId: input.actorUserId,
      actorRole: "admin",
      source: "manual",
    });
    return;
  }

  if (input.category === "wrong_item") {
    await recordSellerViolation(adminClient, {
      sellerId: input.sellerId,
      orderId: input.orderId,
      violationType: "other",
      severity: "high",
      penaltyOutcome: "seller_dispute_loss",
      notes: input.notes || "Buyer won a wrong item dispute.",
      actorUserId: input.actorUserId,
      metadata: {
        orderId: input.orderId,
        disputeCategory: "wrong_item",
      },
    });
  }
}

export function estimateRefundAmountCents(input: {
  orderPrice?: number | string | null;
  shippingCost?: number | string | null;
  stripeAmountTotal?: number | string | null;
}) {
  const stripeTotalCents = toCents(input.stripeAmountTotal);
  if (stripeTotalCents > 0) {
    return stripeTotalCents;
  }

  return toCents(input.orderPrice) + toCents(input.shippingCost);
}

export function estimateSellerProceedsCents(input: {
  sellerProceedsCents?: number | null;
  sellerEarnings?: number | string | null;
  orderPrice?: number | string | null;
  stripeFeeEstimateCents?: number | null;
}) {
  if (typeof input.sellerProceedsCents === "number") {
    return Math.max(0, input.sellerProceedsCents);
  }

  const sellerEarningsCents = toCents(input.sellerEarnings);
  if (sellerEarningsCents > 0) {
    return sellerEarningsCents;
  }

  const subtotalCents = toCents(input.orderPrice);
  const stripeFeeEstimateCents =
    typeof input.stripeFeeEstimateCents === "number"
      ? Math.max(0, input.stripeFeeEstimateCents)
      : calculateStripeFeeEstimateCents(subtotalCents);

  return Math.max(0, subtotalCents - Math.round(subtotalCents * 0.01) - stripeFeeEstimateCents);
}
