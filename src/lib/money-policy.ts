import "server-only";

import Stripe from "stripe";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import { createAdminClient } from "@/lib/supabase-admin";
import type { AuditActorRole, SellerTier } from "@/types/trust";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

const CARRIER_ACCEPTANCE_TRACKING_STATUSES = new Set(["TRANSIT", "IN_TRANSIT"]);
const DELIVERY_TRACKING_STATUSES = new Set(["DELIVERED"]);
const ACTIVE_EXPOSURE_HOLD_STATUSES = ["active", "disputed"] as const;
const ACTIVE_LEDGER_STATUSES = ["pending", "posted", "completed"] as const;
export const WITHDRAWAL_TRANSFER_FEE_CENTS = 25;
const MANUAL_WITHDRAWAL_REVIEW_THRESHOLD_CENTS = 200_000;

type RelayBalanceLedgerType =
  | "order_pending_credit"
  | "order_available_credit"
  | "withdrawal_requested"
  | "withdrawal_completed"
  | "withdrawal_failed"
  | "exposure_hold_created"
  | "exposure_hold_released"
  | "dispute_freeze"
  | "dispute_debit"
  | "admin_adjustment";

type BalanceCreditStatus =
  | "not_started"
  | "pending"
  | "available"
  | "failed"
  | "reversed";

type ExposureHoldStatus = "active" | "released" | "consumed" | "disputed";
type FundsReleaseKey =
  | "buyer_confirmation_or_review_expiry"
  | "delivery"
  | "carrier_acceptance";

interface MoneyMutationOptions {
  adminClient?: SupabaseAdminClient;
  actorRole?: AuditActorRole;
  actorUserId?: string | null;
  now?: Date;
  forceReleaseKeys?: FundsReleaseKey[];
  exposureReleaseKey?: FundsReleaseKey;
  exposureTrigger?:
    | "buyer_confirmation"
    | "review_window_expiry"
    | "delivery"
    | "carrier_acceptance";
}

interface MoneyPolicyOrderLike {
  status?: string | null;
  tracking_status?: string | null;
  price?: number | string | null;
  seller_proceeds_cents?: number | null;
  relay_fee_cents?: number | null;
  stripe_fee_estimate_cents?: number | null;
  review_deadline?: string | null;
  review_window_ends_at?: string | null;
  delivered_at?: string | null;
  shipped_at?: string | null;
}

interface MoneyPolicyOrderContext extends MoneyPolicyOrderLike {
  id: string;
  seller_id: string;
  seller_tier_snapshot?: SellerTier | null;
  platform_fee?: number | null;
  stripe_fee?: number | null;
  seller_earnings?: number | null;
  balance_credit_status?: BalanceCreditStatus | null;
  funds_available_at?: string | null;
  seller_funds_frozen?: boolean | null;
  payout_status?: string | null;
  seller?: {
    id: string;
    seller_tier: SellerTier | null;
  } | null;
}

interface FundsEligibilityStage {
  releaseKey: FundsReleaseKey;
  trigger:
    | "buyer_confirmation"
    | "review_window_expiry"
    | "delivery"
    | "carrier_acceptance";
  amountCents: number;
  eligible: boolean;
  reason: string;
}

export interface FundsEligibilityResult {
  sellerTier: SellerTier;
  orderSubtotalCents: number;
  eligibleAmountCents: number;
  pendingAmountCents: number;
  reviewWindowExpired: boolean;
  reviewWindowActive: boolean;
  stages: FundsEligibilityStage[];
}

export interface RelayBalanceMutationResult {
  created: boolean;
  reason?: string;
}

export interface OrderPendingCreditResult extends RelayBalanceMutationResult {
  sellerProceedsCents: number;
  ledgerEntry?: any;
}

export interface OrderFundsReleaseResult extends RelayBalanceMutationResult {
  eligibleAmountCents: number;
  alreadyReleasedCents: number;
  releasedAmountCents: number;
  pendingAmountCents: number;
  ledgerEntries: any[];
}

export interface ExposureHoldResult extends RelayBalanceMutationResult {
  amountCents: number;
  hold?: any;
  ledgerEntry?: any;
}

export interface RelayBalanceSnapshot {
  sellerId: string;
  totalBalanceCents: number;
  pendingBalanceCents: number;
  availableBalanceCents: number;
  exposureCents: number;
  withdrawableBalanceCents: number;
  adminFrozen: boolean;
  frozenReason: string | null;
  frozenAt: string | null;
  frozenByAdminId: string | null;
  updatedAt: string | null;
}

export interface SellerWithdrawalRequestResult extends RelayBalanceMutationResult {
  withdrawalRequest: any;
  relayBalance: RelayBalanceSnapshot;
  transferFeeCents: number;
  netTransferAmountCents: number;
}

function getAdminClient(options?: MoneyMutationOptions) {
  return options?.adminClient || createAdminClient();
}

function getNow(options?: MoneyMutationOptions) {
  return options?.now || new Date();
}

function getActorRole(options?: MoneyMutationOptions): AuditActorRole {
  return options?.actorRole || "system";
}

function getActorUserId(options?: MoneyMutationOptions) {
  return options?.actorUserId || null;
}

function coerceDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTrackingStatus(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function toCents(value: number | string | null | undefined) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.round(numericValue * 100));
}

function isDeliveredOrder(order: MoneyPolicyOrderLike) {
  const trackingStatus = normalizeTrackingStatus(order.tracking_status);
  const status = String(order.status || "").trim().toLowerCase();

  return (
    Boolean(order.delivered_at) ||
    DELIVERY_TRACKING_STATUSES.has(trackingStatus) ||
    [
      "delivered",
      "review_window",
      "completed",
      "disputed",
      "refund_pending",
      "refunded",
      "return_pending",
      "return_shipped",
      "return_delivered",
    ].includes(status)
  );
}

function hasCarrierAcceptance(order: MoneyPolicyOrderLike) {
  const trackingStatus = normalizeTrackingStatus(order.tracking_status);
  const status = String(order.status || "").trim().toLowerCase();

  return (
    Boolean(order.shipped_at) ||
    CARRIER_ACCEPTANCE_TRACKING_STATUSES.has(trackingStatus) ||
    isDeliveredOrder(order) ||
    ["shipped", "completed", "disputed"].includes(status)
  );
}

function isReviewWindowExpired(order: MoneyPolicyOrderLike, now = new Date()) {
  const deadline = coerceDate(order.review_window_ends_at || order.review_deadline);
  return Boolean(deadline && deadline.getTime() <= now.getTime());
}

function isReviewWindowActive(order: MoneyPolicyOrderLike, now = new Date()) {
  const deadline = coerceDate(order.review_window_ends_at || order.review_deadline);
  const status = String(order.status || "").trim().toLowerCase();

  if (!deadline || !isDeliveredOrder(order)) {
    return false;
  }

  if (["completed", "refunded", "cancelled"].includes(status)) {
    return false;
  }

  return deadline.getTime() > now.getTime();
}

function resolveOrderSubtotalCents(order: MoneyPolicyOrderLike) {
  const derivedFromPrice = toCents(order.price);
  if (derivedFromPrice > 0) {
    return derivedFromPrice;
  }

  if (
    typeof order.seller_proceeds_cents === "number" &&
    typeof order.relay_fee_cents === "number" &&
    typeof order.stripe_fee_estimate_cents === "number"
  ) {
    return Math.max(
      0,
      order.seller_proceeds_cents +
        order.relay_fee_cents +
        order.stripe_fee_estimate_cents
    );
  }

  return 0;
}

function resolveSellerTier(order: MoneyPolicyOrderContext): SellerTier {
  return order.seller_tier_snapshot || order.seller?.seller_tier || "tier_1";
}

export function calculateRelayFee(orderSubtotalCents: number) {
  const normalizedSubtotalCents = Math.max(0, Math.round(orderSubtotalCents || 0));
  return Math.round((normalizedSubtotalCents * 100) / 10000);
}

export function calculateStripeFeeEstimateCents(orderSubtotalCents: number) {
  const normalizedSubtotalCents = Math.max(0, Math.round(orderSubtotalCents || 0));
  return Math.max(0, Math.round(normalizedSubtotalCents * 0.03 + 30));
}

export function calculateSellerProceeds(
  orderSubtotalCents: number,
  stripeFeeCents: number
) {
  const relayFeeCents = calculateRelayFee(orderSubtotalCents);
  return Math.max(
    0,
    Math.round(orderSubtotalCents || 0) -
      relayFeeCents -
      Math.max(0, Math.round(stripeFeeCents || 0))
  );
}

function buildFundsEligibilityStages(
  order: MoneyPolicyOrderLike,
  sellerTier: SellerTier,
  amountBasisCents: number,
  now = new Date()
): FundsEligibilityStage[] {
  const reviewWindowExpired = isReviewWindowExpired(order, now);
  const buyerConfirmed = String(order.status || "").trim().toLowerCase() === "completed";
  const delivered = isDeliveredOrder(order);
  const carrierAccepted = hasCarrierAcceptance(order);

  if (sellerTier === "tier_3") {
    // Keep release stages aligned with the payout engine's cumulative rounding
    // so odd-cent proceeds do not get stranded between carrier acceptance and delivery.
    const carrierAmountCents = Math.round((amountBasisCents * 5000) / 10000);
    const deliveryAmountCents = Math.max(0, amountBasisCents - carrierAmountCents);

    return [
      {
        releaseKey: "carrier_acceptance",
        trigger: "carrier_acceptance",
        amountCents: carrierAmountCents,
        eligible: carrierAccepted,
        reason: carrierAccepted
          ? "Carrier acceptance has been recorded for this order."
          : "Carrier acceptance has not been recorded yet.",
      },
      {
        releaseKey: "delivery",
        trigger: "delivery",
        amountCents: deliveryAmountCents,
        eligible: delivered,
        reason: delivered
          ? "Delivery has been recorded for this order."
          : "Delivery has not been recorded yet.",
      },
    ];
  }

  if (sellerTier === "tier_2") {
    return [
      {
        releaseKey: "delivery",
        trigger: "delivery",
        amountCents: amountBasisCents,
        eligible: delivered,
        reason: delivered
          ? "Delivery has been recorded for this order."
          : "Delivery has not been recorded yet.",
      },
    ];
  }

  return [
    {
      releaseKey: "buyer_confirmation_or_review_expiry",
      trigger: buyerConfirmed ? "buyer_confirmation" : "review_window_expiry",
      amountCents: amountBasisCents,
      eligible: buyerConfirmed || reviewWindowExpired,
      reason:
        buyerConfirmed || reviewWindowExpired
          ? "Buyer confirmation or review-window expiry has resolved this order."
          : "Tier 1 funds stay pending until buyer confirmation or review-window expiry.",
    },
  ];
}

export function determineFundsEligibility(
  order: MoneyPolicyOrderLike,
  sellerTier: SellerTier
): FundsEligibilityResult {
  const now = new Date();
  const orderSubtotalCents = resolveOrderSubtotalCents(order);
  const stages = buildFundsEligibilityStages(
    order,
    sellerTier,
    orderSubtotalCents,
    now
  );
  const eligibleAmountCents = stages.reduce((sum, stage) => {
    return stage.eligible ? sum + stage.amountCents : sum;
  }, 0);

  return {
    sellerTier,
    orderSubtotalCents,
    eligibleAmountCents,
    pendingAmountCents: Math.max(0, orderSubtotalCents - eligibleAmountCents),
    reviewWindowExpired: isReviewWindowExpired(order, now),
    reviewWindowActive: isReviewWindowActive(order, now),
    stages,
  };
}

export function calculateExposure(
  order: MoneyPolicyOrderLike,
  sellerTier: SellerTier,
  releasedAvailableAmountCents?: number
) {
  if (sellerTier === "tier_1") {
    return 0;
  }

  if (!isReviewWindowActive(order, new Date())) {
    return 0;
  }

  // TODO: replace this released-funds exposure rule with risk-weighted exposure scoring.
  return Math.max(0, Math.round(releasedAvailableAmountCents || 0));
}

async function loadOrderMoneyContext(
  adminClient: SupabaseAdminClient,
  orderId: string
) {
  const { data, error } = await adminClient
    .from("orders")
    .select(`
      id,
      seller_id,
      status,
      price,
      platform_fee,
      stripe_fee,
      seller_earnings,
      relay_fee_cents,
      stripe_fee_estimate_cents,
      seller_proceeds_cents,
      balance_credit_status,
      review_deadline,
      review_window_ends_at,
      funds_available_at,
      shipped_at,
      delivered_at,
      tracking_status,
      seller_funds_frozen,
      payout_status,
      seller_tier_snapshot,
      seller:profiles!orders_seller_id_fkey(
        id,
        seller_tier
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
    ...(data as unknown as MoneyPolicyOrderContext),
    seller: seller || null,
  };
}

async function updateOrderIfNeeded(
  adminClient: SupabaseAdminClient,
  orderId: string,
  payload: Record<string, unknown>
) {
  if (Object.keys(payload).length === 0) {
    return;
  }

  const { error } = await adminClient
    .from("orders")
    .update(payload)
    .eq("id", orderId);

  if (error) {
    throw new Error(error.message || "Failed to update order");
  }
}

async function ensureOrderMoneySnapshot(
  adminClient: SupabaseAdminClient,
  order: MoneyPolicyOrderContext
) {
  const sellerTier = resolveSellerTier(order);
  const orderSubtotalCents = resolveOrderSubtotalCents(order);
  const stripeFeeEstimateCents =
    typeof order.stripe_fee_estimate_cents === "number"
      ? Math.max(0, order.stripe_fee_estimate_cents)
      : order.stripe_fee !== null && order.stripe_fee !== undefined
        ? toCents(order.stripe_fee)
        : calculateStripeFeeEstimateCents(orderSubtotalCents);
  const relayFeeCents =
    typeof order.relay_fee_cents === "number"
      ? Math.max(0, order.relay_fee_cents)
      : order.platform_fee !== null && order.platform_fee !== undefined
        ? toCents(order.platform_fee)
        : calculateRelayFee(orderSubtotalCents);
  const sellerProceedsCents =
    typeof order.seller_proceeds_cents === "number"
      ? Math.max(0, order.seller_proceeds_cents)
      : order.seller_earnings !== null && order.seller_earnings !== undefined
        ? toCents(order.seller_earnings)
        : calculateSellerProceeds(orderSubtotalCents, stripeFeeEstimateCents);
  const reviewWindowEndsAt = order.review_window_ends_at || order.review_deadline || null;
  const predictedFundsAvailableAt =
    sellerTier === "tier_1"
      ? reviewWindowEndsAt
      : sellerTier === "tier_2"
        ? order.delivered_at || null
        : order.shipped_at || order.delivered_at || null;

  const updatePayload: Record<string, unknown> = {};
  if (order.relay_fee_cents !== relayFeeCents) {
    updatePayload.relay_fee_cents = relayFeeCents;
  }
  if (order.stripe_fee_estimate_cents !== stripeFeeEstimateCents) {
    updatePayload.stripe_fee_estimate_cents = stripeFeeEstimateCents;
  }
  if (order.seller_proceeds_cents !== sellerProceedsCents) {
    updatePayload.seller_proceeds_cents = sellerProceedsCents;
  }
  if (order.review_window_ends_at !== reviewWindowEndsAt) {
    updatePayload.review_window_ends_at = reviewWindowEndsAt;
  }
  if (!order.funds_available_at && predictedFundsAvailableAt) {
    updatePayload.funds_available_at = predictedFundsAvailableAt;
  }

  await updateOrderIfNeeded(adminClient, order.id, updatePayload);

  return {
    ...order,
    relay_fee_cents: relayFeeCents,
    stripe_fee_estimate_cents: stripeFeeEstimateCents,
    seller_proceeds_cents: sellerProceedsCents,
    review_window_ends_at: reviewWindowEndsAt,
    funds_available_at:
      (updatePayload.funds_available_at as string | undefined) ||
      order.funds_available_at ||
      predictedFundsAvailableAt ||
      null,
    seller_tier_snapshot: sellerTier,
  };
}

async function findLedgerEntryByIdempotencyKey(
  adminClient: SupabaseAdminClient,
  type: RelayBalanceLedgerType,
  idempotencyKey: string
) {
  const { data, error } = await adminClient
    .from("relay_balance_ledger")
    .select("*")
    .eq("type", type)
    .contains("metadata", { idempotency_key: idempotencyKey })
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load relay balance ledger entry");
  }

  return data || null;
}

async function insertLedgerEntryIdempotently(
  adminClient: SupabaseAdminClient,
  input: {
    sellerId: string;
    orderId?: string | null;
    type: RelayBalanceLedgerType;
    amountCents: number;
    status?: "pending" | "posted" | "completed" | "failed" | "canceled";
    metadata?: Record<string, unknown>;
    idempotencyKey: string;
  }
) {
  const existing = await findLedgerEntryByIdempotencyKey(
    adminClient,
    input.type,
    input.idempotencyKey
  );

  if (existing) {
    return {
      created: false,
      entry: existing,
    };
  }

  const metadata = {
    ...(input.metadata || {}),
    idempotency_key: input.idempotencyKey,
  };

  const { data, error } = await adminClient
    .from("relay_balance_ledger")
    .insert({
      seller_id: input.sellerId,
      order_id: input.orderId || null,
      type: input.type,
      amount_cents: input.amountCents,
      currency: "usd",
      status: input.status || "posted",
      metadata,
    })
    .select("*")
    .single();

  if (error) {
    const recovered = await findLedgerEntryByIdempotencyKey(
      adminClient,
      input.type,
      input.idempotencyKey
    );

    if (recovered) {
      return {
        created: false,
        entry: recovered,
      };
    }

    throw new Error(error.message || "Failed to insert relay balance ledger entry");
  }

  return {
    created: true,
    entry: data,
  };
}

async function logMoneyMovement(
  adminClient: SupabaseAdminClient,
  options: MoneyMutationOptions | undefined,
  input: {
    orderId?: string | null;
    sellerId: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  }
) {
  await logRelayAuditEvent(adminClient, {
    actorUserId: getActorUserId(options),
    actorRole: getActorRole(options),
    orderId: input.orderId || null,
    sellerId: input.sellerId,
    eventType: input.eventType,
    metadata: input.metadata || {},
  });
}

async function getOpenExposureHold(
  adminClient: SupabaseAdminClient,
  orderId: string
) {
  const { data, error } = await adminClient
    .from("exposure_holds")
    .select("*")
    .eq("order_id", orderId)
    .in("status", Array.from(ACTIVE_EXPOSURE_HOLD_STATUSES))
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load exposure hold");
  }

  return data || null;
}

async function getReleasedAvailableAmountCentsForOrder(
  adminClient: SupabaseAdminClient,
  orderId: string
) {
  const { data, error } = await adminClient
    .from("relay_balance_ledger")
    .select("amount_cents")
    .eq("order_id", orderId)
    .eq("type", "order_available_credit")
    .in("status", Array.from(ACTIVE_LEDGER_STATUSES));

  if (error) {
    throw new Error(error.message || "Failed to load released available credits");
  }

  return (data || []).reduce((sum: number, row: any) => {
    return sum + Math.max(0, Number(row.amount_cents || 0));
  }, 0);
}

function normalizeMoneyAmountCents(value: number) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function calculateNetWithdrawalAmountCents(
  amountCents: number,
  transferFeeCents = WITHDRAWAL_TRANSFER_FEE_CENTS
) {
  return Math.max(
    0,
    normalizeMoneyAmountCents(amountCents) -
      Math.max(0, normalizeMoneyAmountCents(transferFeeCents))
  );
}

function determineWithdrawalReviewRequired(amountCents: number) {
  // TODO: Replace this flat threshold with seller risk scoring / anomaly checks.
  return normalizeMoneyAmountCents(amountCents) >= MANUAL_WITHDRAWAL_REVIEW_THRESHOLD_CENTS;
}

async function recalculateRelayBalance(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const { error } = await adminClient.rpc("recalculate_relay_balance", {
    target_seller_id: sellerId,
  });

  if (error) {
    throw new Error(error.message || "Failed to recalculate relay balance");
  }
}

async function ensureRelayBalanceRow(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  await recalculateRelayBalance(adminClient, sellerId);

  const { data, error } = await adminClient
    .from("relay_balances")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load relay balance");
  }

  if (data) {
    return data;
  }

  const { data: insertedBalance, error: insertError } = await adminClient
    .from("relay_balances")
    .upsert(
      {
        seller_id: sellerId,
        total_balance_cents: 0,
        available_balance_cents: 0,
        pending_balance_cents: 0,
        exposure_cents: 0,
        withdrawable_balance_cents: 0,
        admin_frozen: false,
      },
      { onConflict: "seller_id" }
    )
    .select("*")
    .single();

  if (insertError || !insertedBalance) {
    throw new Error(insertError?.message || "Failed to initialize relay balance");
  }

  return insertedBalance;
}

export async function getRelayBalanceSnapshot(
  sellerId: string,
  options?: MoneyMutationOptions
): Promise<RelayBalanceSnapshot> {
  const adminClient = getAdminClient(options);
  const data = await ensureRelayBalanceRow(adminClient, sellerId);
  const adminFrozen = Boolean((data as any).admin_frozen);

  return {
    sellerId,
    totalBalanceCents: Number(data.total_balance_cents || 0),
    pendingBalanceCents: Number(data.pending_balance_cents || 0),
    availableBalanceCents: Number(data.available_balance_cents || 0),
    exposureCents: Number(data.exposure_cents || 0),
    withdrawableBalanceCents: adminFrozen
      ? 0
      : Number(data.withdrawable_balance_cents || 0),
    adminFrozen,
    frozenReason: (data as any).frozen_reason || null,
    frozenAt: (data as any).frozen_at || null,
    frozenByAdminId: (data as any).frozen_by_admin_id || null,
    updatedAt: data.updated_at || null,
  };
}

async function getSellerWithdrawalProfile(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, role, stripe_account_id, display_name, full_name, username, email")
    .eq("id", sellerId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Seller profile not found");
  }

  return data;
}

async function getWithdrawalRequestByIdempotencyKey(
  adminClient: SupabaseAdminClient,
  sellerId: string,
  idempotencyKey: string
) {
  const { data, error } = await adminClient
    .from("withdrawal_requests")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load withdrawal request");
  }

  return data || null;
}

async function loadWithdrawalRequest(
  adminClient: SupabaseAdminClient,
  withdrawalRequestId: string
) {
  const { data, error } = await adminClient
    .from("withdrawal_requests")
    .select(`
      *,
      seller:profiles!withdrawal_requests_seller_id_fkey(
        id,
        role,
        stripe_account_id,
        display_name,
        full_name,
        username,
        email
      )
    `)
    .eq("id", withdrawalRequestId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Withdrawal request not found");
  }

  const seller = Array.isArray((data as any).seller)
    ? (data as any).seller[0]
    : (data as any).seller;

  return {
    ...(data as any),
    seller: seller || null,
  };
}

async function restoreWithdrawalBalance(
  adminClient: SupabaseAdminClient,
  request: any,
  options: MoneyMutationOptions | undefined,
  input: {
    status: "failed" | "canceled";
    failureReason: string;
    eventType: string;
    reviewRequired?: boolean;
    reviewedAt?: string | null;
    reviewedByAdminId?: string | null;
    reviewNotes?: string | null;
    canceledAt?: string | null;
    canceledByAdminId?: string | null;
  }
) {
  const updatedPayload: Record<string, unknown> = {
    status: input.status,
    failure_reason: input.failureReason,
  };

  if (typeof input.reviewRequired === "boolean") {
    updatedPayload.review_required = input.reviewRequired;
  }
  if (input.reviewedAt !== undefined) {
    updatedPayload.reviewed_at = input.reviewedAt;
  }
  if (input.reviewedByAdminId !== undefined) {
    updatedPayload.reviewed_by_admin_id = input.reviewedByAdminId;
  }
  if (input.reviewNotes !== undefined) {
    updatedPayload.review_notes = input.reviewNotes;
  }
  if (input.canceledAt !== undefined) {
    updatedPayload.canceled_at = input.canceledAt;
  }
  if (input.canceledByAdminId !== undefined) {
    updatedPayload.canceled_by_admin_id = input.canceledByAdminId;
  }

  const { data: updatedRequest, error: updateError } = await adminClient
    .from("withdrawal_requests")
    .update(updatedPayload)
    .eq("id", request.id)
    .select("*")
    .single();

  if (updateError || !updatedRequest) {
    throw new Error(updateError?.message || "Failed to update withdrawal request");
  }

  const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
    sellerId: request.seller_id,
    type: "withdrawal_failed",
    amountCents: Math.abs(Number(request.amount_cents || 0)),
    status: input.status === "failed" ? "failed" : "canceled",
    idempotencyKey: `money:withdrawal:${request.id}:restore`,
    metadata: {
      source: "relay_balance_policy",
      withdrawal_request_id: request.id,
      restoration_status: input.status,
      reason: input.failureReason,
    },
  });

  await logMoneyMovement(adminClient, options, {
    sellerId: request.seller_id,
    eventType: input.eventType,
    metadata: {
      withdrawalRequestId: request.id,
      amountCents: Number(request.amount_cents || 0),
      ledgerEntryId: ledgerWrite.entry.id,
      reason: input.failureReason,
    },
  });

  return updatedRequest;
}

export async function calculateWithdrawableBalance(
  sellerId: string,
  options?: MoneyMutationOptions
) {
  const relayBalance = await getRelayBalanceSnapshot(sellerId, options);
  return relayBalance.adminFrozen ? 0 : relayBalance.withdrawableBalanceCents;
}

export async function setSellerRelayBalanceFrozen(
  sellerId: string,
  input: {
    frozen: boolean;
    reason: string;
  },
  options?: MoneyMutationOptions
) {
  const adminClient = getAdminClient(options);
  const normalizedReason = String(input.reason || "").trim();

  if (!normalizedReason) {
    throw new Error("A reason is required to freeze or unfreeze Relay Balance.");
  }

  await ensureRelayBalanceRow(adminClient, sellerId);

  const nowIso = getNow(options).toISOString();
  const updatePayload: Record<string, unknown> = {
    admin_frozen: input.frozen,
    frozen_reason: normalizedReason,
    frozen_at: input.frozen ? nowIso : null,
    frozen_by_admin_id: input.frozen ? getActorUserId(options) : null,
  };

  if (input.frozen) {
    updatePayload.withdrawable_balance_cents = 0;
  }

  const { data, error } = await adminClient
    .from("relay_balances")
    .update(updatePayload)
    .eq("seller_id", sellerId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to update Relay Balance freeze state");
  }

  await logMoneyMovement(adminClient, options, {
    sellerId,
    eventType: input.frozen ? "money.seller_balance_frozen" : "money.seller_balance_unfrozen",
    metadata: {
      reason: normalizedReason,
      relayBalanceId: data.id,
    },
  });

  return getRelayBalanceSnapshot(sellerId, {
    ...options,
    adminClient,
  });
}

export async function createAdminBalanceAdjustment(
  sellerId: string,
  input: {
    amountCents: number;
    reason: string;
    orderId?: string | null;
    idempotencyKey?: string | null;
  },
  options?: MoneyMutationOptions
) {
  const adminClient = getAdminClient(options);
  const normalizedReason = String(input.reason || "").trim();
  const normalizedAmountCents = Math.round(Number(input.amountCents || 0));

  if (!normalizedReason) {
    throw new Error("A reason is required for a manual balance adjustment.");
  }

  if (!Number.isFinite(normalizedAmountCents) || normalizedAmountCents === 0) {
    throw new Error("Manual balance adjustments must be a non-zero cent amount.");
  }

  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    `money:admin_adjustment:${sellerId}:${normalizedAmountCents}:${Date.now()}`;

  const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
    sellerId,
    orderId: input.orderId || null,
    type: "admin_adjustment",
    amountCents: normalizedAmountCents,
    status: "posted",
    idempotencyKey,
    metadata: {
      source: "admin_money_controls",
      reason: normalizedReason,
      actor_user_id: getActorUserId(options),
    },
  });

  if (ledgerWrite.created) {
    await logMoneyMovement(adminClient, options, {
      orderId: input.orderId || null,
      sellerId,
      eventType: "money.admin_adjustment_created",
      metadata: {
        amountCents: normalizedAmountCents,
        reason: normalizedReason,
        ledgerEntryId: ledgerWrite.entry.id,
        idempotencyKey,
      },
    });
  }

  return {
    created: ledgerWrite.created,
    ledgerEntry: ledgerWrite.entry,
    relayBalance: await getRelayBalanceSnapshot(sellerId, {
      ...options,
      adminClient,
    }),
  };
}

export async function createOrderPendingCredit(
  orderId: string,
  options?: MoneyMutationOptions
): Promise<OrderPendingCreditResult> {
  const adminClient = getAdminClient(options);
  const order = await ensureOrderMoneySnapshot(
    adminClient,
    await loadOrderMoneyContext(adminClient, orderId)
  );
  const sellerProceedsCents = Math.max(0, order.seller_proceeds_cents || 0);

  if (sellerProceedsCents <= 0) {
    return {
      created: false,
      reason: "no_seller_proceeds",
      sellerProceedsCents,
    };
  }

  const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
    sellerId: order.seller_id,
    orderId: order.id,
    type: "order_pending_credit",
    amountCents: sellerProceedsCents,
    idempotencyKey: `money:order:${order.id}:pending_credit`,
    metadata: {
      source: "relay_balance_policy",
      seller_tier: resolveSellerTier(order),
    },
  });

  if (ledgerWrite.created) {
    if (!["available", "reversed"].includes(order.balance_credit_status || "")) {
      await updateOrderIfNeeded(adminClient, order.id, {
        balance_credit_status: "pending",
      });
    }

    await logMoneyMovement(adminClient, options, {
      orderId: order.id,
      sellerId: order.seller_id,
      eventType: "money.order_pending_credit_created",
      metadata: {
        sellerProceedsCents,
        ledgerEntryId: ledgerWrite.entry.id,
      },
    });
  }

  return {
    created: ledgerWrite.created,
    sellerProceedsCents,
    ledgerEntry: ledgerWrite.entry,
  };
}

export async function releaseOrderFundsToAvailable(
  orderId: string,
  amountCents: number,
  options?: MoneyMutationOptions
): Promise<OrderFundsReleaseResult> {
  const adminClient = getAdminClient(options);
  const nowIso = getNow(options).toISOString();
  const order = await ensureOrderMoneySnapshot(
    adminClient,
    await loadOrderMoneyContext(adminClient, orderId)
  );
  const sellerTier = resolveSellerTier(order);
  const sellerProceedsCents = Math.max(0, order.seller_proceeds_cents || 0);

  await createOrderPendingCredit(orderId, {
    ...options,
    adminClient,
  });

  const stages = buildFundsEligibilityStages(
    order,
    sellerTier,
    sellerProceedsCents,
    getNow(options)
  );
  const eligibleStages = stages.filter((stage) => stage.eligible && stage.amountCents > 0);
  const eligibleAmountCents = eligibleStages.reduce((sum, stage) => {
    return sum + stage.amountCents;
  }, 0);

  const { data: existingRows, error: existingRowsError } = await adminClient
    .from("relay_balance_ledger")
    .select("id, amount_cents, metadata")
    .eq("order_id", order.id)
    .eq("type", "order_available_credit")
    .in("status", Array.from(ACTIVE_LEDGER_STATUSES));

  if (existingRowsError) {
    throw new Error(
      existingRowsError.message || "Failed to inspect existing order available credits"
    );
  }

  const existingReleaseKeys = new Set<string>();
  const alreadyReleasedCents = (existingRows || []).reduce((sum, row: any) => {
    const releaseKey =
      row?.metadata && typeof row.metadata.release_key === "string"
        ? row.metadata.release_key
        : null;
    if (releaseKey) {
      existingReleaseKeys.add(releaseKey);
    }
    return sum + Number(row.amount_cents || 0);
  }, 0);

  const unreleasedEligibleStages = eligibleStages.filter(
    (stage) => !existingReleaseKeys.has(stage.releaseKey)
  );
  const forcedReleaseKeys = new Set(options?.forceReleaseKeys || []);
  const unreleasedForcedStages = stages.filter(
    (stage) =>
      forcedReleaseKeys.has(stage.releaseKey) &&
      stage.amountCents > 0 &&
      !existingReleaseKeys.has(stage.releaseKey)
  );
  const stagesToRelease = [
    ...unreleasedEligibleStages,
    ...unreleasedForcedStages.filter(
      (forcedStage) =>
        !unreleasedEligibleStages.some(
          (eligibleStage) => eligibleStage.releaseKey === forcedStage.releaseKey
        )
    ),
  ];

  if (stagesToRelease.length === 0) {
    return {
      created: false,
      reason: "no_eligible_unreleased_funds",
      eligibleAmountCents,
      alreadyReleasedCents,
      releasedAmountCents: 0,
      pendingAmountCents: Math.max(0, sellerProceedsCents - alreadyReleasedCents),
      ledgerEntries: [],
    };
  }

  const normalizedRequestedAmountCents = Math.max(0, Math.round(amountCents || 0));
  let remainingReleaseBudget = normalizedRequestedAmountCents;
  const createdEntries: any[] = [];

  for (const stage of stagesToRelease) {
    if (remainingReleaseBudget < stage.amountCents) {
      break;
    }

    const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
      sellerId: order.seller_id,
      orderId: order.id,
      type: "order_available_credit",
      amountCents: stage.amountCents,
      idempotencyKey: `money:order:${order.id}:available:${stage.releaseKey}`,
      metadata: {
        source: "relay_balance_policy",
        release_key: stage.releaseKey,
        release_trigger: stage.trigger,
        forced_release: forcedReleaseKeys.has(stage.releaseKey),
        seller_tier: sellerTier,
      },
    });

    if (ledgerWrite.created) {
      createdEntries.push(ledgerWrite.entry);

      await logMoneyMovement(adminClient, options, {
        orderId: order.id,
        sellerId: order.seller_id,
        eventType: "money.order_available_credit_released",
        metadata: {
          amountCents: stage.amountCents,
          releaseKey: stage.releaseKey,
          trigger: stage.trigger,
          ledgerEntryId: ledgerWrite.entry.id,
        },
      });
    }

    remainingReleaseBudget -= stage.amountCents;
  }

  const releasedAmountCents = createdEntries.reduce((sum, entry) => {
    return sum + Number(entry.amount_cents || 0);
  }, 0);
  const updatedReleasedCents = alreadyReleasedCents + releasedAmountCents;
  const nextBalanceCreditStatus: BalanceCreditStatus =
    updatedReleasedCents >= sellerProceedsCents ? "available" : "pending";

  if (createdEntries.length > 0) {
    await updateOrderIfNeeded(adminClient, order.id, {
      balance_credit_status: nextBalanceCreditStatus,
      funds_available_at: order.funds_available_at || nowIso,
    });
  }

  return {
    created: createdEntries.length > 0,
    reason:
      createdEntries.length > 0
        ? undefined
        : normalizedRequestedAmountCents <= 0
          ? "no_release_amount_requested"
          : "partial_stage_release_not_supported",
    eligibleAmountCents,
    alreadyReleasedCents,
    releasedAmountCents,
    pendingAmountCents: Math.max(0, sellerProceedsCents - updatedReleasedCents),
    ledgerEntries: createdEntries,
  };
}

export async function createExposureHold(
  orderId: string,
  options?: MoneyMutationOptions
): Promise<ExposureHoldResult> {
  const adminClient = getAdminClient(options);
  const order = await ensureOrderMoneySnapshot(
    adminClient,
    await loadOrderMoneyContext(adminClient, orderId)
  );
  const sellerTier = resolveSellerTier(order);
  const releasedAvailableAmountCents = await getReleasedAvailableAmountCentsForOrder(
    adminClient,
    order.id
  );
  const exposureCents = calculateExposure(
    order,
    sellerTier,
    releasedAvailableAmountCents
  );
  const existingHold = await getOpenExposureHold(adminClient, order.id);

  if (exposureCents <= 0) {
    return {
      created: false,
      reason: "no_exposure_required",
      amountCents: 0,
      hold: existingHold || undefined,
    };
  }

  const existingAmountCents = Number(existingHold?.amount_cents || 0);
  const deltaExposureCents = Math.max(0, exposureCents - existingAmountCents);
  const exposureReleaseKey = options?.exposureReleaseKey || options?.exposureTrigger || "delivery";

  let hold = existingHold;

  if (!existingHold) {
    const { data: insertedHold, error } = await adminClient
      .from("exposure_holds")
      .insert({
        seller_id: order.seller_id,
        order_id: order.id,
        amount_cents: exposureCents,
        status: "active",
        reason: `review_window_exposure_${sellerTier}`,
      })
      .select("*")
      .single();

    if (error) {
      const recoveredHold = await getOpenExposureHold(adminClient, order.id);
      if (recoveredHold) {
        hold = recoveredHold;
      } else {
        throw new Error(error.message || "Failed to create exposure hold");
      }
    } else {
      hold = insertedHold;
    }
  } else if (existingAmountCents !== exposureCents || existingHold.status !== "active") {
    const { data: updatedHold, error } = await adminClient
      .from("exposure_holds")
      .update({
        amount_cents: exposureCents,
        status: "active",
        reason: `review_window_exposure_${sellerTier}`,
        released_at: null,
      })
      .eq("id", existingHold.id)
      .select("*")
      .single();

    if (error || !updatedHold) {
      throw new Error(error?.message || "Failed to update exposure hold");
    }

    hold = updatedHold;
  }

  let ledgerEntry: any = null;
  let created = false;

  if (deltaExposureCents > 0 && hold) {
    const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
      sellerId: order.seller_id,
      orderId: order.id,
      type: "exposure_hold_created",
      amountCents: deltaExposureCents,
      idempotencyKey: `money:order:${order.id}:exposure_hold_created:${exposureReleaseKey}`,
      metadata: {
        source: "relay_balance_policy",
        exposure_hold_id: hold.id,
        hold_status: hold.status,
        total_exposure_cents: exposureCents,
        release_key: exposureReleaseKey,
        release_trigger: options?.exposureTrigger || exposureReleaseKey,
      },
    });

    ledgerEntry = ledgerWrite.entry;
    created = ledgerWrite.created;

    if (ledgerWrite.created) {
      await logMoneyMovement(adminClient, options, {
        orderId: order.id,
        sellerId: order.seller_id,
        eventType: "money.exposure_hold_created",
        metadata: {
          amountCents: deltaExposureCents,
          totalExposureCents: exposureCents,
          exposureHoldId: hold.id,
          ledgerEntryId: ledgerWrite.entry.id,
          releaseKey: exposureReleaseKey,
        },
      });
    }
  }

  return {
    created,
    amountCents: exposureCents,
    hold,
    ledgerEntry,
  };
}

export async function releaseExposureHold(
  orderId: string,
  options?: MoneyMutationOptions
): Promise<ExposureHoldResult> {
  const adminClient = getAdminClient(options);
  const hold = await getOpenExposureHold(adminClient, orderId);

  if (!hold) {
    return {
      created: false,
      reason: "no_open_hold",
      amountCents: 0,
    };
  }

  const nowIso = getNow(options).toISOString();
  const { data: releasedHold, error } = await adminClient
    .from("exposure_holds")
    .update({
      status: "released",
      released_at: nowIso,
    })
    .eq("id", hold.id)
    .select("*")
    .single();

  if (error || !releasedHold) {
    throw new Error(error?.message || "Failed to release exposure hold");
  }

  const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
    sellerId: releasedHold.seller_id,
    orderId,
    type: "exposure_hold_released",
    amountCents: Number(releasedHold.amount_cents || 0),
    idempotencyKey: `money:order:${orderId}:exposure_hold_released`,
    metadata: {
      source: "relay_balance_policy",
      exposure_hold_id: releasedHold.id,
      previous_status: hold.status,
    },
  });

  await logMoneyMovement(adminClient, options, {
    orderId,
    sellerId: releasedHold.seller_id,
    eventType: "money.exposure_hold_released",
    metadata: {
      amountCents: Number(releasedHold.amount_cents || 0),
      exposureHoldId: releasedHold.id,
      ledgerEntryId: ledgerWrite.entry.id,
    },
  });

  return {
    created: true,
    amountCents: Number(releasedHold.amount_cents || 0),
    hold: releasedHold,
    ledgerEntry: ledgerWrite.entry,
  };
}

export async function freezeFundsForDispute(
  orderId: string,
  options?: MoneyMutationOptions
): Promise<ExposureHoldResult> {
  const adminClient = getAdminClient(options);
  const nowIso = getNow(options).toISOString();
  const order = await ensureOrderMoneySnapshot(
    adminClient,
    await loadOrderMoneyContext(adminClient, orderId)
  );
  const freezeAmountCents = resolveOrderSubtotalCents(order);

  if (freezeAmountCents <= 0) {
    return {
      created: false,
      reason: "no_freezable_amount",
      amountCents: 0,
    };
  }

  const existingHold = await getOpenExposureHold(adminClient, order.id);
  let hold = existingHold;

  if (!existingHold) {
    const { data: createdHold, error: createError } = await adminClient
      .from("exposure_holds")
      .insert({
        seller_id: order.seller_id,
        order_id: order.id,
        amount_cents: freezeAmountCents,
        status: "disputed",
        reason: "dispute_freeze",
      })
      .select("*")
      .single();

    if (createError || !createdHold) {
      throw new Error(createError?.message || "Failed to create dispute exposure hold");
    }

    hold = createdHold;
  } else if (
    existingHold.status !== "disputed" ||
    Number(existingHold.amount_cents || 0) !== freezeAmountCents
  ) {
    const { data: updatedHold, error: updateError } = await adminClient
      .from("exposure_holds")
      .update({
        status: "disputed",
        amount_cents: freezeAmountCents,
        reason: "dispute_freeze",
        released_at: null,
      })
      .eq("id", existingHold.id)
      .select("*")
      .single();

    if (updateError || !updatedHold) {
      throw new Error(updateError?.message || "Failed to update dispute exposure hold");
    }

    hold = updatedHold;
  }

  const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
    sellerId: order.seller_id,
    orderId: order.id,
    type: "dispute_freeze",
    amountCents: freezeAmountCents,
    idempotencyKey: `money:order:${order.id}:dispute_freeze`,
    metadata: {
      source: "relay_balance_policy",
      exposure_hold_id: hold?.id || null,
    },
  });

  await updateOrderIfNeeded(adminClient, order.id, {
    seller_funds_frozen: true,
    payout_status: "frozen",
    payout_frozen_at: nowIso,
    payout_frozen_reason: "Relay Balance dispute freeze",
  });

  if (ledgerWrite.created) {
    await logMoneyMovement(adminClient, options, {
      orderId: order.id,
      sellerId: order.seller_id,
      eventType: "money.dispute_funds_frozen",
      metadata: {
        amountCents: freezeAmountCents,
        exposureHoldId: hold?.id || null,
        ledgerEntryId: ledgerWrite.entry.id,
      },
    });
  }

  return {
    created: ledgerWrite.created,
    amountCents: freezeAmountCents,
    hold: hold || undefined,
    ledgerEntry: ledgerWrite.entry,
  };
}

export async function debitSellerForDispute(
  orderId: string,
  options?: MoneyMutationOptions
): Promise<OrderPendingCreditResult> {
  const adminClient = getAdminClient(options);
  const nowIso = getNow(options).toISOString();
  const order = await ensureOrderMoneySnapshot(
    adminClient,
    await loadOrderMoneyContext(adminClient, orderId)
  );
  const sellerProceedsCents = Math.max(0, order.seller_proceeds_cents || 0);

  if (sellerProceedsCents <= 0) {
    return {
      created: false,
      reason: "no_seller_proceeds",
      sellerProceedsCents: 0,
    };
  }

  const openHold = await getOpenExposureHold(adminClient, order.id);
  if (openHold) {
    const { error: holdError } = await adminClient
      .from("exposure_holds")
      .update({
        status: "consumed",
        released_at: nowIso,
      })
      .eq("id", openHold.id);

    if (holdError) {
      throw new Error(holdError.message || "Failed to consume dispute exposure hold");
    }
  }

  const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
    sellerId: order.seller_id,
    orderId: order.id,
    type: "dispute_debit",
    amountCents: -sellerProceedsCents,
    idempotencyKey: `money:order:${order.id}:dispute_debit`,
    metadata: {
      source: "relay_balance_policy",
      exposure_hold_id: openHold?.id || null,
    },
  });

  if (ledgerWrite.created) {
    await updateOrderIfNeeded(adminClient, order.id, {
      balance_credit_status: "reversed",
    });

    await logMoneyMovement(adminClient, options, {
      orderId: order.id,
      sellerId: order.seller_id,
      eventType: "money.dispute_seller_debited",
      metadata: {
        amountCents: sellerProceedsCents,
        ledgerEntryId: ledgerWrite.entry.id,
        exposureHoldId: openHold?.id || null,
      },
    });
  }

  return {
    created: ledgerWrite.created,
    sellerProceedsCents,
    ledgerEntry: ledgerWrite.entry,
  };
}

export async function createSellerWithdrawalRequest(
  sellerId: string,
  amountCents: number,
  options?: MoneyMutationOptions & {
    idempotencyKey?: string;
    reviewRequired?: boolean;
  }
): Promise<SellerWithdrawalRequestResult> {
  const adminClient = getAdminClient(options);
  const normalizedAmountCents = normalizeMoneyAmountCents(amountCents);
  const transferFeeCents = WITHDRAWAL_TRANSFER_FEE_CENTS;
  const netTransferAmountCents = calculateNetWithdrawalAmountCents(
    normalizedAmountCents,
    transferFeeCents
  );
  const idempotencyKey =
    options?.idempotencyKey?.trim() ||
    `withdrawal:${sellerId}:${normalizedAmountCents}:${Date.now()}`;

  if (normalizedAmountCents <= 0) {
    throw new Error("Withdrawal amount must be greater than zero.");
  }

  if (netTransferAmountCents <= 0) {
    throw new Error("Withdrawal amount must exceed the Stripe transfer fee.");
  }

  const [sellerProfile, existingRequest] = await Promise.all([
    getSellerWithdrawalProfile(adminClient, sellerId),
    getWithdrawalRequestByIdempotencyKey(adminClient, sellerId, idempotencyKey),
  ]);

  if (!sellerProfile.stripe_account_id) {
    throw new Error("Connect Stripe in Settings before requesting a withdrawal.");
  }

  if (existingRequest) {
    const relayBalance = await getRelayBalanceSnapshot(sellerId, {
      ...options,
      adminClient,
    });

    return {
      created: false,
      reason: "existing_withdrawal_request",
      withdrawalRequest: existingRequest,
      relayBalance,
      transferFeeCents,
      netTransferAmountCents: calculateNetWithdrawalAmountCents(
        Number(existingRequest.amount_cents || 0),
        Number(existingRequest.stripe_transfer_fee_cents || transferFeeCents)
      ),
    };
  }

  const relayBalance = await getRelayBalanceSnapshot(sellerId, {
    ...options,
    adminClient,
  });
  if (relayBalance.adminFrozen) {
    throw new Error(
      relayBalance.frozenReason
        ? `Withdrawals are temporarily frozen by Relay admin review: ${relayBalance.frozenReason}`
        : "Withdrawals are temporarily frozen by Relay admin review."
    );
  }
  const withdrawableBalanceCents = await calculateWithdrawableBalance(sellerId, {
    ...options,
    adminClient,
  });

  if (normalizedAmountCents > withdrawableBalanceCents) {
    throw new Error("Withdrawal amount exceeds withdrawable balance.");
  }

  const reviewRequired =
    typeof options?.reviewRequired === "boolean"
      ? options.reviewRequired
      : determineWithdrawalReviewRequired(normalizedAmountCents);

  const { data: insertedRequest, error: insertError } = await adminClient
    .from("withdrawal_requests")
    .insert({
      seller_id: sellerId,
      amount_cents: normalizedAmountCents,
      stripe_transfer_fee_cents: transferFeeCents,
      status: "pending",
      idempotency_key: idempotencyKey,
      review_required: reviewRequired,
    })
    .select("*")
    .single();

  if (insertError || !insertedRequest) {
    const recoveredRequest = await getWithdrawalRequestByIdempotencyKey(
      adminClient,
      sellerId,
      idempotencyKey
    );

    if (recoveredRequest) {
      return {
        created: false,
        reason: "existing_withdrawal_request",
        withdrawalRequest: recoveredRequest,
        relayBalance,
        transferFeeCents,
        netTransferAmountCents,
      };
    }

    throw new Error(insertError?.message || "Failed to create withdrawal request");
  }

  const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
    sellerId,
    type: "withdrawal_requested",
    amountCents: -normalizedAmountCents,
    status: reviewRequired ? "pending" : "posted",
    idempotencyKey: `money:withdrawal:${insertedRequest.id}:requested`,
    metadata: {
      source: "relay_balance_policy",
      withdrawal_request_id: insertedRequest.id,
      seller_stripe_account_id: sellerProfile.stripe_account_id,
      transfer_fee_cents: transferFeeCents,
      net_transfer_amount_cents: netTransferAmountCents,
      review_required: reviewRequired,
    },
  });

  await logMoneyMovement(adminClient, options, {
    sellerId,
    eventType: "money.withdrawal_requested",
    metadata: {
      withdrawalRequestId: insertedRequest.id,
      amountCents: normalizedAmountCents,
      transferFeeCents,
      netTransferAmountCents,
      reviewRequired,
      ledgerEntryId: ledgerWrite.entry.id,
    },
  });

  if (reviewRequired) {
    const refreshedBalance = await getRelayBalanceSnapshot(sellerId, {
      ...options,
      adminClient,
    });

    return {
      created: true,
      withdrawalRequest: insertedRequest,
      relayBalance: refreshedBalance,
      transferFeeCents,
      netTransferAmountCents,
    };
  }

  return processSellerWithdrawalRequest(insertedRequest.id, {
    ...options,
    adminClient,
  });
}

export async function processSellerWithdrawalRequest(
  withdrawalRequestId: string,
  options?: MoneyMutationOptions
): Promise<SellerWithdrawalRequestResult> {
  const adminClient = getAdminClient(options);
  const request = await loadWithdrawalRequest(adminClient, withdrawalRequestId);
  const transferFeeCents = Number(
    request.stripe_transfer_fee_cents || WITHDRAWAL_TRANSFER_FEE_CENTS
  );
  const normalizedAmountCents = Math.abs(Number(request.amount_cents || 0));
  const netTransferAmountCents = calculateNetWithdrawalAmountCents(
    normalizedAmountCents,
    transferFeeCents
  );

  if (!request.seller?.stripe_account_id) {
    const failedRequest = await restoreWithdrawalBalance(adminClient, request, options, {
      status: "failed",
      failureReason: "Seller does not have a connected Stripe account.",
      eventType: "money.withdrawal_failed",
    });

    return {
      created: false,
      reason: "missing_stripe_account",
      withdrawalRequest: failedRequest,
      relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
        ...options,
        adminClient,
      }),
      transferFeeCents,
      netTransferAmountCents,
    };
  }

  if (request.status === "completed") {
    return {
      created: false,
      reason: "withdrawal_already_completed",
      withdrawalRequest: request,
      relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
        ...options,
        adminClient,
      }),
      transferFeeCents,
      netTransferAmountCents,
    };
  }

  if (request.status === "canceled") {
    throw new Error("Canceled withdrawals cannot be processed.");
  }

  if (request.status === "failed") {
    throw new Error("Failed withdrawals must be recreated before processing again.");
  }

  if (request.review_required && !request.reviewed_at) {
    throw new Error("Withdrawal requires admin review before processing.");
  }

  if (netTransferAmountCents <= 0) {
    const failedRequest = await restoreWithdrawalBalance(adminClient, request, options, {
      status: "failed",
      failureReason: "Withdrawal amount must exceed the Stripe transfer fee.",
      eventType: "money.withdrawal_failed",
    });

    return {
      created: false,
      reason: "invalid_net_transfer_amount",
      withdrawalRequest: failedRequest,
      relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
        ...options,
        adminClient,
      }),
      transferFeeCents,
      netTransferAmountCents,
    };
  }

  if (request.status !== "processing") {
    const { error: processingError } = await adminClient
      .from("withdrawal_requests")
      .update({
        status: "processing",
      })
      .eq("id", request.id)
      .in("status", ["pending", "processing"]);

    if (processingError) {
      throw new Error(processingError.message || "Failed to mark withdrawal as processing");
    }
  }

  let transfer: Stripe.Response<Stripe.Transfer> | null = null;

  try {
    transfer = await stripe.transfers.create(
      {
        amount: netTransferAmountCents,
        currency: "usd",
        destination: request.seller.stripe_account_id,
        metadata: {
          withdrawal_request_id: request.id,
          seller_id: request.seller_id,
          gross_amount_cents: String(normalizedAmountCents),
          transfer_fee_cents: String(transferFeeCents),
        },
        transfer_group: `relay_withdrawal_${request.id}`,
      },
      {
        idempotencyKey: request.idempotency_key || `relay-withdrawal-${request.id}`,
      }
    );

    const completedAt = getNow(options).toISOString();
    const { data: updatedRequest, error: updateError } = await adminClient
      .from("withdrawal_requests")
      .update({
        status: "completed",
        stripe_transfer_id: transfer.id,
        completed_at: completedAt,
        failure_reason: null,
      })
      .eq("id", request.id)
      .select("*")
      .single();

    if (updateError || !updatedRequest) {
      throw new Error(updateError?.message || "Failed to finalize withdrawal request");
    }

    const completionLedger = await insertLedgerEntryIdempotently(adminClient, {
      sellerId: request.seller_id,
      type: "withdrawal_completed",
      amountCents: normalizedAmountCents,
      status: "completed",
      idempotencyKey: `money:withdrawal:${request.id}:completed`,
      metadata: {
        source: "relay_balance_policy",
        withdrawal_request_id: request.id,
        stripe_transfer_id: transfer.id,
        gross_amount_cents: normalizedAmountCents,
        transfer_fee_cents: transferFeeCents,
        net_transfer_amount_cents: netTransferAmountCents,
      },
    });

    await logMoneyMovement(adminClient, options, {
      sellerId: request.seller_id,
      eventType: "money.withdrawal_completed",
      metadata: {
        withdrawalRequestId: request.id,
        stripeTransferId: transfer.id,
        amountCents: normalizedAmountCents,
        transferFeeCents,
        netTransferAmountCents,
        ledgerEntryId: completionLedger.entry.id,
      },
    });

    return {
      created: true,
      withdrawalRequest: updatedRequest,
      relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
        ...options,
        adminClient,
      }),
      transferFeeCents,
      netTransferAmountCents,
    };
  } catch (error) {
    if (transfer) {
      return {
        created: false,
        reason: "stripe_transfer_created_pending_reconcile",
        withdrawalRequest: await loadWithdrawalRequest(adminClient, withdrawalRequestId),
        relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
          ...options,
          adminClient,
        }),
        transferFeeCents,
        netTransferAmountCents,
      };
    }

    const failureReason =
      error instanceof Error ? error.message : "Failed to create Stripe transfer";
    const failedRequest = await restoreWithdrawalBalance(adminClient, request, options, {
      status: "failed",
      failureReason,
      eventType: "money.withdrawal_failed",
    });

    return {
      created: false,
      reason: "stripe_transfer_failed",
      withdrawalRequest: failedRequest,
      relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
        ...options,
        adminClient,
      }),
      transferFeeCents,
      netTransferAmountCents,
    };
  }
}

export async function reviewSellerWithdrawalRequest(
  withdrawalRequestId: string,
  input: {
    reviewNotes?: string | null;
    processAfterReview?: boolean;
  },
  options?: MoneyMutationOptions
): Promise<SellerWithdrawalRequestResult> {
  const adminClient = getAdminClient(options);
  const request = await loadWithdrawalRequest(adminClient, withdrawalRequestId);
  const reviewedAt = getNow(options).toISOString();
  const reviewNotes =
    typeof input.reviewNotes === "string" && input.reviewNotes.trim().length > 0
      ? input.reviewNotes.trim()
      : request.review_notes || null;

  const { data: updatedRequest, error } = await adminClient
    .from("withdrawal_requests")
    .update({
      reviewed_at: reviewedAt,
      reviewed_by_admin_id: getActorUserId(options),
      review_notes: reviewNotes,
    })
    .eq("id", request.id)
    .select("*")
    .single();

  if (error || !updatedRequest) {
    throw new Error(error?.message || "Failed to mark withdrawal as reviewed");
  }

  await logMoneyMovement(adminClient, options, {
    sellerId: request.seller_id,
    eventType: "money.withdrawal_reviewed",
    metadata: {
      withdrawalRequestId: request.id,
      reviewNotes,
      processedAfterReview: input.processAfterReview !== false,
    },
  });

  if (updatedRequest.status === "pending" && input.processAfterReview !== false) {
    return processSellerWithdrawalRequest(withdrawalRequestId, {
      ...options,
      adminClient,
    });
  }

  return {
    created: true,
    withdrawalRequest: updatedRequest,
    relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
      ...options,
      adminClient,
    }),
    transferFeeCents: Number(
      updatedRequest.stripe_transfer_fee_cents || WITHDRAWAL_TRANSFER_FEE_CENTS
    ),
    netTransferAmountCents: calculateNetWithdrawalAmountCents(
      Number(updatedRequest.amount_cents || 0),
      Number(updatedRequest.stripe_transfer_fee_cents || WITHDRAWAL_TRANSFER_FEE_CENTS)
    ),
  };
}

export async function cancelSellerWithdrawalRequest(
  withdrawalRequestId: string,
  input: {
    reason?: string | null;
  },
  options?: MoneyMutationOptions
): Promise<SellerWithdrawalRequestResult> {
  const adminClient = getAdminClient(options);
  const request = await loadWithdrawalRequest(adminClient, withdrawalRequestId);

  if (request.status === "completed") {
    throw new Error("Completed withdrawals cannot be canceled.");
  }

  if (request.status === "processing") {
    throw new Error("Processing withdrawals cannot be canceled safely.");
  }

  if (request.status === "canceled") {
    return {
      created: false,
      reason: "withdrawal_already_canceled",
      withdrawalRequest: request,
      relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
        ...options,
        adminClient,
      }),
      transferFeeCents: Number(
        request.stripe_transfer_fee_cents || WITHDRAWAL_TRANSFER_FEE_CENTS
      ),
      netTransferAmountCents: calculateNetWithdrawalAmountCents(
        Number(request.amount_cents || 0),
        Number(request.stripe_transfer_fee_cents || WITHDRAWAL_TRANSFER_FEE_CENTS)
      ),
    };
  }

  const canceledAt = getNow(options).toISOString();
  const canceledRequest = await restoreWithdrawalBalance(adminClient, request, options, {
    status: "canceled",
    failureReason:
      typeof input.reason === "string" && input.reason.trim().length > 0
        ? input.reason.trim()
        : "Canceled by admin review.",
    eventType: "money.withdrawal_canceled",
    canceledAt,
    canceledByAdminId: getActorUserId(options),
  });

  return {
    created: true,
    withdrawalRequest: canceledRequest,
    relayBalance: await getRelayBalanceSnapshot(request.seller_id, {
      ...options,
      adminClient,
    }),
    transferFeeCents: Number(
      canceledRequest.stripe_transfer_fee_cents || WITHDRAWAL_TRANSFER_FEE_CENTS
    ),
    netTransferAmountCents: calculateNetWithdrawalAmountCents(
      Number(canceledRequest.amount_cents || 0),
      Number(
        canceledRequest.stripe_transfer_fee_cents || WITHDRAWAL_TRANSFER_FEE_CENTS
      )
    ),
  };
}
