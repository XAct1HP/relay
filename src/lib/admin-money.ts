import "server-only";

import Stripe from "stripe";
import { getRelayBalanceSnapshot } from "@/lib/money-policy";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

const ACTIVE_LEDGER_STATUSES = new Set(["pending", "posted", "completed"]);
const STALE_PROCESSING_WITHDRAWAL_MS = 30 * 60 * 1000;
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    })
  : null;

type AdminMoneyWarningSeverity = "critical" | "warning" | "info";

interface AdminMoneyWarning {
  code: string;
  severity: AdminMoneyWarningSeverity;
  title: string;
  detail: string;
  amountCents?: number;
  count?: number;
  sampleIds?: string[];
}

function sumStripeBalanceAmountCents(
  balances:
    | Array<{
        amount: number;
        currency: string;
      }>
    | null
    | undefined,
  currency = "usd"
) {
  const normalizedCurrency = currency.trim().toLowerCase();

  return (balances || []).reduce((sum, entry) => {
    if (String(entry.currency || "").trim().toLowerCase() !== normalizedCurrency) {
      return sum;
    }

    const amount = Number(entry.amount || 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}

async function getStripePlatformBalanceSnapshot() {
  if (!stripe) {
    return {
      availableBalanceCents: 0,
      pendingBalanceCents: 0,
      totalBalanceCents: 0,
      currency: "usd",
      availableRaw: [] as Array<{ amount: number; currency: string }>,
      pendingRaw: [] as Array<{ amount: number; currency: string }>,
      error: "STRIPE_SECRET_KEY is not configured.",
    };
  }

  try {
    const balance = await stripe.balance.retrieve();
    const availableBalanceCents = sumStripeBalanceAmountCents(balance.available, "usd");
    const pendingBalanceCents = sumStripeBalanceAmountCents(balance.pending, "usd");

    return {
      availableBalanceCents,
      pendingBalanceCents,
      totalBalanceCents: availableBalanceCents + pendingBalanceCents,
      currency: "usd",
      availableRaw: balance.available || [],
      pendingRaw: balance.pending || [],
      error: null,
    };
  } catch (error) {
    return {
      availableBalanceCents: 0,
      pendingBalanceCents: 0,
      totalBalanceCents: 0,
      currency: "usd",
      availableRaw: [] as Array<{ amount: number; currency: string }>,
      pendingRaw: [] as Array<{ amount: number; currency: string }>,
      error: error instanceof Error ? error.message : "Failed to retrieve Stripe platform balance.",
    };
  }
}

function normalizeRelationRecord<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return (value[0] || null) as T | null;
  }

  return (value || null) as T | null;
}

function toCents(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.round(numeric * 100));
}

function formatSellerLabel(profile: any) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    profile?.email ||
    "Unknown seller"
  );
}

function sumLedgerAmountByType(rows: any[], type: string) {
  return rows.reduce((sum, row) => {
    if (row.type !== type || !ACTIVE_LEDGER_STATUSES.has(String(row.status || ""))) {
      return sum;
    }

    return sum + Number(row.amount_cents || 0);
  }, 0);
}

export async function getAdminMoneyOverview(adminClient: SupabaseAdminClient) {
  const [
    balancesResult,
    withdrawalsResult,
    allWithdrawalsResult,
    frozenOrdersResult,
    ledgerResult,
    settlementOrdersResult,
    riskOrdersResult,
    platformBalance,
  ] = await Promise.all([
    adminClient
      .from("relay_balances")
      .select(`
        *,
        seller:profiles!relay_balances_seller_id_fkey(
          id,
          display_name,
          full_name,
          username,
          email,
          seller_tier
        )
      `)
      .order("available_balance_cents", { ascending: false }),
    adminClient
      .from("withdrawal_requests")
      .select(`
        *,
        seller:profiles!withdrawal_requests_seller_id_fkey(
          id,
          display_name,
          full_name,
          username,
          email,
          stripe_account_id
        )
      `)
      .order("created_at", { ascending: false })
      .limit(12),
    adminClient
      .from("withdrawal_requests")
      .select(`
        id,
        seller_id,
        amount_cents,
        stripe_transfer_id,
        status,
        review_required,
        reviewed_at,
        failure_reason,
        created_at,
        completed_at
      `)
      .order("created_at", { ascending: false }),
    adminClient
      .from("orders")
      .select(`
        id,
        seller_id,
        status,
        payout_status,
        seller_funds_frozen,
        seller_proceeds_cents,
        updated_at,
        listing:listings(
          brand,
          model
        ),
        seller:profiles!orders_seller_id_fkey(
          id,
          display_name,
          full_name,
          username,
          email
        )
      `)
      .or("seller_funds_frozen.eq.true,payout_status.eq.frozen,status.eq.disputed")
      .order("updated_at", { ascending: false })
      .limit(20),
    adminClient
      .from("relay_balance_ledger")
      .select(`
        id,
        order_id,
        type,
        amount_cents,
        status,
        metadata,
        created_at
      `),
    adminClient
      .from("orders")
      .select(`
        id,
        stripe_funds_available_on,
        stripe_settlement_status,
        payment_funding_source,
        updated_at
      `)
      .eq("payment_funding_source", "card"),
    adminClient
      .from("orders")
      .select(`
        id,
        status,
        balance_credit_status,
        payout_status,
        seller_funds_frozen,
        seller_proceeds_cents
      `)
      .in("status", ["refunded", "refund_pending", "disputed"]),
    getStripePlatformBalanceSnapshot(),
  ]);

  if (balancesResult.error) {
    throw new Error(balancesResult.error.message || "Failed to load Relay balances");
  }

  if (withdrawalsResult.error) {
    throw new Error(withdrawalsResult.error.message || "Failed to load withdrawals");
  }

  if (frozenOrdersResult.error) {
    throw new Error(frozenOrdersResult.error.message || "Failed to load frozen funds");
  }
  if (allWithdrawalsResult.error) {
    throw new Error(allWithdrawalsResult.error.message || "Failed to load full withdrawal history");
  }
  if (ledgerResult.error) {
    throw new Error(ledgerResult.error.message || "Failed to load Relay Balance ledger");
  }
  if (settlementOrdersResult.error) {
    throw new Error(settlementOrdersResult.error.message || "Failed to load settlement monitoring orders");
  }
  if (riskOrdersResult.error) {
    throw new Error(riskOrdersResult.error.message || "Failed to load refund and dispute monitoring orders");
  }

  const sellers = (balancesResult.data || []).map((row: any) => ({
    ...row,
    seller: normalizeRelationRecord(row.seller),
  }));
  const withdrawals = (withdrawalsResult.data || []).map((row: any) => ({
    ...row,
    seller: normalizeRelationRecord(row.seller),
  }));
  const frozenOrders = (frozenOrdersResult.data || []).map((row: any) => ({
    ...row,
    seller: normalizeRelationRecord(row.seller),
    listing: normalizeRelationRecord(row.listing),
  }));
  const allWithdrawals = allWithdrawalsResult.data || [];
  const ledgerRows = ledgerResult.data || [];
  const settlementOrders = settlementOrdersResult.data || [];
  const riskOrders = riskOrdersResult.data || [];
  const totalPendingSellerBalancesCents = sellers.reduce(
    (sum, row) => sum + Number(row.pending_balance_cents || 0),
    0
  );
  const totalAvailableSellerBalancesCents = sellers.reduce(
    (sum, row) => sum + Number(row.available_balance_cents || 0),
    0
  );
  const totalWithdrawableBalancesCents = sellers.reduce(
    (sum, row) => sum + (row.admin_frozen ? 0 : Number(row.available_balance_cents || 0)),
    0
  );
  const totalRelayBalanceSnapshotCents = sellers.reduce(
    (sum, row) => sum + Number(row.total_balance_cents || 0),
    0
  );
  const totalSellerLedgerLiabilityCents = ledgerRows.reduce((sum, row: any) => {
    if (!ACTIVE_LEDGER_STATUSES.has(String(row.status || ""))) {
      return sum;
    }

    return sum + Number(row.amount_cents || 0);
  }, 0);
  const ledgerSnapshotDeltaCents =
    totalSellerLedgerLiabilityCents - totalRelayBalanceSnapshotCents;
  const totalDisputedOrFrozenFundsCents = frozenOrders.reduce(
    (sum, row) => sum + Number(row.seller_proceeds_cents || 0),
    0
  );
  const pendingOrProcessingLockedWithdrawalCents = allWithdrawals.reduce((sum, row: any) => {
    if (!["pending", "processing"].includes(String(row.status || ""))) {
      return sum;
    }

    return sum + Number(row.amount_cents || 0);
  }, 0);
  const restoredWithdrawalRequestIds = new Set(
    ledgerRows
      .filter((row: any) => row.type === "withdrawal_failed")
      .map((row: any) => String(row.metadata?.withdrawal_request_id || "").trim())
      .filter(Boolean)
  );
  const failedTransferRestoreGapRows = allWithdrawals.filter((row: any) => {
    const status = String(row.status || "");
    if (status !== "failed" && status !== "canceled") {
      return false;
    }

    return !restoredWithdrawalRequestIds.has(String(row.id));
  });
  const failedTransferRestoreGapAmountCents = failedTransferRestoreGapRows.reduce(
    (sum: number, row: any) => sum + Number(row.amount_cents || 0),
    0
  );
  const staleProcessingWithdrawals = allWithdrawals.filter((row: any) => {
    if (String(row.status || "") !== "processing") {
      return false;
    }

    const createdAt = new Date(row.created_at).getTime();
    return Number.isFinite(createdAt) && Date.now() - createdAt >= STALE_PROCESSING_WITHDRAWAL_MS;
  });
  const settlementMissingRows = settlementOrders.filter((row: any) => {
    if (row.payment_funding_source !== "card") {
      return false;
    }

    return (
      !row.stripe_funds_available_on ||
      row.stripe_settlement_status === "pending_settlement_unknown"
    );
  });
  const settlementMissingOrderIds = Array.from(
    new Set(settlementMissingRows.map((row: any) => String(row.id)))
  );

  const orderLedgerSummary = new Map<
    string,
    {
      pendingCreditCents: number;
      availableCreditCents: number;
      disputeDebitCents: number;
    }
  >();

  for (const row of ledgerRows as any[]) {
    if (!row.order_id) {
      continue;
    }

    const bucket =
      orderLedgerSummary.get(String(row.order_id)) || {
        pendingCreditCents: 0,
        availableCreditCents: 0,
        disputeDebitCents: 0,
      };

    if (row.type === "order_pending_credit") {
      bucket.pendingCreditCents += Number(row.amount_cents || 0);
    }
    if (row.type === "order_available_credit") {
      bucket.availableCreditCents += Number(row.amount_cents || 0);
    }
    if (row.type === "dispute_debit") {
      bucket.disputeDebitCents += Math.abs(Number(row.amount_cents || 0));
    }

    orderLedgerSummary.set(String(row.order_id), bucket);
  }

  const imbalanceRiskOrders = riskOrders.filter((order: any) => {
    const summary = orderLedgerSummary.get(String(order.id)) || {
      pendingCreditCents: 0,
      availableCreditCents: 0,
      disputeDebitCents: 0,
    };
    const activeSellerCreditCents = Math.max(
      0,
      summary.pendingCreditCents + summary.availableCreditCents - summary.disputeDebitCents
    );

    if (order.status === "refunded" || order.status === "refund_pending") {
      return activeSellerCreditCents > 0;
    }

    if (order.status === "disputed") {
      return activeSellerCreditCents > 0 && !order.seller_funds_frozen;
    }

    return false;
  });

  const stripeVsLedgerLiabilityDeltaCents =
    platformBalance.totalBalanceCents - totalSellerLedgerLiabilityCents;
  const stripeAvailableCoverageDeltaCents =
    platformBalance.availableBalanceCents - totalWithdrawableBalancesCents;

  const warnings: AdminMoneyWarning[] = [];
  const pushWarning = (warning: AdminMoneyWarning) => {
    warnings.push(warning);
  };

  if (platformBalance.error) {
    pushWarning({
      code: "stripe_platform_balance_unavailable",
      severity: "critical",
      title: "Stripe platform balance could not be loaded",
      detail: platformBalance.error,
    });
  }

  if (!platformBalance.error && totalWithdrawableBalancesCents > platformBalance.availableBalanceCents) {
    pushWarning({
      code: "withdrawable_exceeds_platform_available",
      severity: "critical",
      title: "Seller available withdrawals exceed Stripe platform available balance",
      detail:
        "Relay sellers can currently withdraw more than the Stripe platform has available in USD. Pause withdrawals before launch and reconcile settlement timing.",
      amountCents: totalWithdrawableBalancesCents - platformBalance.availableBalanceCents,
    });
  }

  if (!platformBalance.error && totalSellerLedgerLiabilityCents > platformBalance.totalBalanceCents) {
    pushWarning({
      code: "ledger_liability_exceeds_platform_balance",
      severity: "critical",
      title: "Relay ledger liabilities exceed Stripe platform balance",
      detail:
        "Seller-owned funds recorded in Relay are higher than the pooled real-money balance in Stripe. This indicates a launch-blocking accounting mismatch.",
      amountCents: totalSellerLedgerLiabilityCents - platformBalance.totalBalanceCents,
    });
  }

  if (ledgerSnapshotDeltaCents !== 0) {
    pushWarning({
      code: "ledger_snapshot_mismatch",
      severity: "warning",
      title: "Relay balance snapshots do not match ledger rollup",
      detail:
        "The summed seller balance snapshots differ from the rolled-up Relay ledger. Review balance recalculation and recent ledger writes before launch.",
      amountCents: Math.abs(ledgerSnapshotDeltaCents),
    });
  }

  if (failedTransferRestoreGapRows.length > 0) {
    pushWarning({
      code: "failed_transfer_locked_balance_gap",
      severity: "critical",
      title: "Failed or canceled transfers may still have locked seller balances",
      detail:
        "One or more failed or canceled withdrawal requests do not have a matching balance-restore ledger entry. Sellers may still have funds locked unexpectedly.",
      count: failedTransferRestoreGapRows.length,
      amountCents: failedTransferRestoreGapAmountCents,
      sampleIds: failedTransferRestoreGapRows.slice(0, 5).map((row: any) => row.id),
    });
  }

  if (staleProcessingWithdrawals.length > 0) {
    pushWarning({
      code: "stale_processing_withdrawals",
      severity: "warning",
      title: "Withdrawal transfers are stuck in processing",
      detail:
        "Some withdrawals have remained in processing long enough to warrant manual review. Confirm whether a Stripe transfer succeeded and whether Relay finalized the request locally.",
      count: staleProcessingWithdrawals.length,
      amountCents: staleProcessingWithdrawals.reduce(
        (sum: number, row: any) => sum + Number(row.amount_cents || 0),
        0
      ),
      sampleIds: staleProcessingWithdrawals.slice(0, 5).map((row: any) => row.id),
    });
  }

  if (imbalanceRiskOrders.length > 0) {
    pushWarning({
      code: "refund_dispute_balance_imbalance",
      severity: "warning",
      title: "Refunded or disputed orders still show seller credit exposure",
      detail:
        "Some refunded or disputed orders still appear to carry positive seller credit. Review refund, dispute debit, and freeze flows before launch.",
      count: imbalanceRiskOrders.length,
      sampleIds: imbalanceRiskOrders.slice(0, 5).map((row: any) => row.id),
    });
  }

  if (settlementMissingOrderIds.length > 0) {
    pushWarning({
      code: "missing_settlement_available_on",
      severity: "warning",
      title: "Card settlement records are missing available_on metadata",
      detail:
        "One or more card-funded orders still do not have Stripe settlement availability metadata. These should be backfilled by webhook or reconciliation before launch.",
      count: settlementMissingOrderIds.length,
      sampleIds: settlementMissingOrderIds.slice(0, 5),
    });
  }

  return {
    metrics: {
      totalPendingSellerBalancesCents,
      totalAvailableSellerBalancesCents,
      totalWithdrawableBalancesCents,
      totalActiveExposureHoldsCents: sellers.reduce(
        (sum, row) => sum + Number(row.exposure_cents || 0),
        0
      ),
      totalDisputedOrFrozenFundsCents,
      frozenSellerCount: sellers.filter((row) => row.admin_frozen).length,
      pendingWithdrawalCount: withdrawals.filter((row) => row.status === "pending").length,
    },
    accounting: {
      totalSellerPendingBalanceCents: totalPendingSellerBalancesCents,
      totalSellerAvailableBalanceCents: totalAvailableSellerBalancesCents,
      totalSellerLedgerLiabilityCents,
      totalRelayBalanceSnapshotCents,
      ledgerSnapshotDeltaCents,
      totalLockedWithdrawalBalanceCents: pendingOrProcessingLockedWithdrawalCents,
      stripePlatformAvailableBalanceCents: platformBalance.availableBalanceCents,
      stripePlatformPendingBalanceCents: platformBalance.pendingBalanceCents,
      stripePlatformTotalBalanceCents: platformBalance.totalBalanceCents,
      stripeVsLedgerLiabilityDeltaCents,
      stripeAvailableCoverageDeltaCents,
      failedTransferRestoreGapCount: failedTransferRestoreGapRows.length,
      failedTransferRestoreGapAmountCents,
      staleProcessingWithdrawalCount: staleProcessingWithdrawals.length,
      staleProcessingWithdrawalAmountCents: staleProcessingWithdrawals.reduce(
        (sum: number, row: any) => sum + Number(row.amount_cents || 0),
        0
      ),
      refundsOrDisputesImbalanceCount: imbalanceRiskOrders.length,
      missingSettlementAvailableOnCount: settlementMissingOrderIds.length,
      stripeBalanceError: platformBalance.error,
    },
    warnings,
    sellers: sellers.map((row: any) => ({
      id: row.seller_id,
      label: formatSellerLabel(row.seller),
      seller: row.seller,
      sellerTier: row.seller?.seller_tier || "tier_1",
      totalBalanceCents: Number(row.total_balance_cents || 0),
      pendingBalanceCents: Number(row.pending_balance_cents || 0),
      availableBalanceCents: Number(row.available_balance_cents || 0),
      exposureCents: Number(row.exposure_cents || 0),
      withdrawableBalanceCents: row.admin_frozen ? 0 : Number(row.available_balance_cents || 0),
      adminFrozen: Boolean(row.admin_frozen),
      frozenReason: row.frozen_reason || null,
      updatedAt: row.updated_at || null,
    })),
    withdrawals,
    frozenOrders,
  };
}

export async function getAdminSellerMoneyDetail(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const [profileResult, exposureHoldsResult, ledgerResult, withdrawalsResult, disputedOrdersResult, auditLogResult] =
    await Promise.all([
      adminClient
        .from("profiles")
        .select(`
          id,
          email,
          display_name,
          full_name,
          username,
          stripe_account_id,
          seller_tier
        `)
        .eq("id", sellerId)
        .single(),
      adminClient
        .from("exposure_holds")
        .select(`
          *,
          order:orders(
            id,
            status,
            review_window_ends_at,
            listing:listings(
              brand,
              model
            )
          )
        `)
        .eq("seller_id", sellerId)
        .in("status", ["active", "disputed"])
        .order("created_at", { ascending: false }),
      adminClient
        .from("relay_balance_ledger")
        .select(`
          *,
          order:orders(
            id,
            status,
            listing:listings(
              brand,
              model
            )
          )
        `)
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(100),
      adminClient
        .from("withdrawal_requests")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(50),
      adminClient
        .from("orders")
        .select(`
          id,
          status,
          price,
          payout_status,
          balance_credit_status,
          seller_funds_frozen,
          seller_proceeds_cents,
          review_window_ends_at,
          updated_at,
          listing:listings(
            brand,
            model
          )
        `)
        .eq("seller_id", sellerId)
        .or("status.eq.disputed,seller_funds_frozen.eq.true,payout_status.eq.frozen")
        .order("updated_at", { ascending: false }),
      adminClient
        .from("relay_audit_events")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (profileResult.error || !profileResult.data) {
    throw new Error(profileResult.error?.message || "Seller not found");
  }
  if (exposureHoldsResult.error) {
    throw new Error(exposureHoldsResult.error.message || "Failed to load exposure holds");
  }
  if (ledgerResult.error) {
    throw new Error(ledgerResult.error.message || "Failed to load balance ledger");
  }
  if (withdrawalsResult.error) {
    throw new Error(withdrawalsResult.error.message || "Failed to load withdrawal history");
  }
  if (disputedOrdersResult.error) {
    throw new Error(disputedOrdersResult.error.message || "Failed to load disputed orders");
  }
  if (auditLogResult.error) {
    throw new Error(auditLogResult.error.message || "Failed to load money audit log");
  }

  const relayBalance = await getRelayBalanceSnapshot(sellerId, { adminClient });

  return {
    seller: profileResult.data,
    relayBalance,
    exposureHolds: (exposureHoldsResult.data || []).map((row: any) => ({
      ...row,
      order: normalizeRelationRecord(row.order),
    })),
    ledger: (ledgerResult.data || []).map((row: any) => ({
      ...row,
      order: normalizeRelationRecord(row.order),
    })),
    withdrawals: withdrawalsResult.data || [],
    disputedOrders: (disputedOrdersResult.data || []).map((row: any) => ({
      ...row,
      listing: normalizeRelationRecord(row.listing),
    })),
    auditLog: auditLogResult.data || [],
  };
}

export async function getAdminOrderMoneyDetail(
  adminClient: SupabaseAdminClient,
  orderId: string
) {
  const [orderResult, ledgerResult, exposureHoldResult, auditLogResult] =
    await Promise.all([
      adminClient
        .from("orders")
        .select(`
          *,
          listing:listings(
            id,
            brand,
            model,
            sku
          ),
          buyer:profiles!orders_buyer_id_fkey(
            id,
            display_name,
            full_name,
            username,
            email
          ),
          seller:profiles!orders_seller_id_fkey(
            id,
            display_name,
            full_name,
            username,
            email,
            stripe_account_id,
            seller_tier
          )
        `)
        .eq("id", orderId)
        .single(),
      adminClient
        .from("relay_balance_ledger")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      adminClient
        .from("exposure_holds")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient
        .from("relay_audit_events")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (orderResult.error || !orderResult.data) {
    throw new Error(orderResult.error?.message || "Order not found");
  }
  if (ledgerResult.error) {
    throw new Error(ledgerResult.error.message || "Failed to load order ledger");
  }
  if (auditLogResult.error) {
    throw new Error(auditLogResult.error.message || "Failed to load order audit log");
  }

  const order = {
    ...orderResult.data,
    listing: normalizeRelationRecord((orderResult.data as any).listing),
    buyer: normalizeRelationRecord((orderResult.data as any).buyer),
    seller: normalizeRelationRecord((orderResult.data as any).seller),
  } as any;
  const ledger = ledgerResult.data || [];
  const sellerWithdrawalsResult = order.seller_id
    ? await adminClient
        .from("withdrawal_requests")
        .select("*")
        .eq("seller_id", order.seller_id)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [], error: null };

  if (sellerWithdrawalsResult.error) {
    throw new Error(
      sellerWithdrawalsResult.error.message || "Failed to load seller withdrawals"
    );
  }

  const sellerBalance =
    order.seller_id
      ? await getRelayBalanceSnapshot(order.seller_id, { adminClient })
      : null;

  const subtotalCents = toCents(order.price);
  const shippingCents = toCents(order.shipping_cost);
  const relayFeeCents =
    typeof order.relay_fee_cents === "number" ? order.relay_fee_cents : toCents(order.platform_fee);
  const stripeFeeEstimateCents =
    typeof order.stripe_fee_estimate_cents === "number"
      ? order.stripe_fee_estimate_cents
      : toCents(order.stripe_fee);
  const sellerProceedsCents =
    typeof order.seller_proceeds_cents === "number"
      ? order.seller_proceeds_cents
      : toCents(order.seller_earnings);

  return {
    order,
    sellerBalance,
    ledger,
    exposureHold: exposureHoldResult.data || null,
    sellerWithdrawals: sellerWithdrawalsResult.data || [],
    auditLog: auditLogResult.data || [],
    computed: {
      buyerPaidAmountCents: subtotalCents + shippingCents,
      subtotalCents,
      shippingCents,
      relayFeeCents,
      stripeFeeEstimateCents,
      sellerProceedsCents,
      pendingCreditCents: sumLedgerAmountByType(ledger, "order_pending_credit"),
      availableCreditCents: sumLedgerAmountByType(ledger, "order_available_credit"),
      disputeFreezeCents: sumLedgerAmountByType(ledger, "dispute_freeze"),
      exposureHoldCents: Number(exposureHoldResult.data?.amount_cents || 0),
    },
  };
}
