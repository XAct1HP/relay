import "server-only";

import { logRelayAuditEvent } from "@/lib/relay-audit";
import { createAdminClient } from "@/lib/supabase-admin";
import type { AuditActorRole, SellerTier } from "@/types/trust";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

const CARRIER_ACCEPTANCE_TRACKING_STATUSES = new Set(["TRANSIT", "IN_TRANSIT"]);
const DELIVERY_TRACKING_STATUSES = new Set(["DELIVERED"]);
const ACTIVE_EXPOSURE_HOLD_STATUSES = ["active", "disputed"] as const;
const ACTIVE_LEDGER_STATUSES = ["pending", "posted", "completed"] as const;
const AVAILABLE_BALANCE_LEDGER_TYPES = [
  "order_available_credit",
  "withdrawal_requested",
  "withdrawal_failed",
  "dispute_debit",
  "admin_adjustment",
] as const;

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
    const carrierAmountCents = Math.floor(amountBasisCents / 2);
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
  sellerTier: SellerTier
) {
  if (sellerTier === "tier_1") {
    return 0;
  }

  if (!isReviewWindowActive(order, new Date())) {
    return 0;
  }

  // TODO: replace this flat exposure rule with risk-weighted exposure scoring.
  return resolveOrderSubtotalCents(order);
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

function sumAvailableLedgerRows(
  rows: Array<{
    type: RelayBalanceLedgerType;
    amount_cents: number;
    status: string;
  }>
) {
  return rows.reduce((sum, row) => {
    if (!ACTIVE_LEDGER_STATUSES.includes(row.status as (typeof ACTIVE_LEDGER_STATUSES)[number])) {
      return sum;
    }

    if (!AVAILABLE_BALANCE_LEDGER_TYPES.includes(row.type as (typeof AVAILABLE_BALANCE_LEDGER_TYPES)[number])) {
      return sum;
    }

    return sum + Number(row.amount_cents || 0);
  }, 0);
}

export async function calculateWithdrawableBalance(sellerId: string) {
  const adminClient = createAdminClient();
  const [ledgerResult, exposureResult] = await Promise.all([
    adminClient
      .from("relay_balance_ledger")
      .select("type, amount_cents, status")
      .eq("seller_id", sellerId)
      .in("type", Array.from(AVAILABLE_BALANCE_LEDGER_TYPES)),
    adminClient
      .from("exposure_holds")
      .select("amount_cents")
      .eq("seller_id", sellerId)
      .in("status", Array.from(ACTIVE_EXPOSURE_HOLD_STATUSES)),
  ]);

  if (ledgerResult.error) {
    throw new Error(
      ledgerResult.error.message || "Failed to load available relay balance ledger rows"
    );
  }

  if (exposureResult.error) {
    throw new Error(
      exposureResult.error.message || "Failed to load active exposure holds"
    );
  }

  const availableBalanceCents = sumAvailableLedgerRows(
    (ledgerResult.data || []) as Array<{
      type: RelayBalanceLedgerType;
      amount_cents: number;
      status: string;
    }>
  );
  const activeExposureCents = (exposureResult.data || []).reduce((sum, row) => {
    return sum + Number(row.amount_cents || 0);
  }, 0);

  return Math.max(0, availableBalanceCents - activeExposureCents);
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
  const exposureCents = calculateExposure(order, sellerTier);

  if (exposureCents <= 0) {
    return {
      created: false,
      reason: "no_exposure_required",
      amountCents: 0,
    };
  }

  const existingHold = await getOpenExposureHold(adminClient, order.id);
  if (existingHold) {
    return {
      created: false,
      reason: "existing_open_hold",
      amountCents: Number(existingHold.amount_cents || 0),
      hold: existingHold,
    };
  }

  const { data: hold, error } = await adminClient
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
      return {
        created: false,
        reason: "existing_open_hold",
        amountCents: Number(recoveredHold.amount_cents || 0),
        hold: recoveredHold,
      };
    }

    throw new Error(error.message || "Failed to create exposure hold");
  }

  const ledgerWrite = await insertLedgerEntryIdempotently(adminClient, {
    sellerId: order.seller_id,
    orderId: order.id,
    type: "exposure_hold_created",
    amountCents: exposureCents,
    idempotencyKey: `money:order:${order.id}:exposure_hold_created`,
    metadata: {
      source: "relay_balance_policy",
      exposure_hold_id: hold.id,
      hold_status: hold.status,
    },
  });

  await logMoneyMovement(adminClient, options, {
    orderId: order.id,
    sellerId: order.seller_id,
    eventType: "money.exposure_hold_created",
    metadata: {
      amountCents: exposureCents,
      exposureHoldId: hold.id,
      ledgerEntryId: ledgerWrite.entry.id,
    },
  });

  return {
    created: true,
    amountCents: exposureCents,
    hold,
    ledgerEntry: ledgerWrite.entry,
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
