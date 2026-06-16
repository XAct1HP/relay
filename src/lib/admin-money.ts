import "server-only";

import { getRelayBalanceSnapshot } from "@/lib/money-policy";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

const ACTIVE_LEDGER_STATUSES = new Set(["pending", "posted", "completed"]);

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
  const [balancesResult, withdrawalsResult, frozenOrdersResult] = await Promise.all([
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

  return {
    metrics: {
      totalPendingSellerBalancesCents: sellers.reduce(
        (sum, row) => sum + Number(row.pending_balance_cents || 0),
        0
      ),
      totalAvailableSellerBalancesCents: sellers.reduce(
        (sum, row) => sum + Number(row.available_balance_cents || 0),
        0
      ),
      totalWithdrawableBalancesCents: sellers.reduce(
        (sum, row) =>
          sum + (row.admin_frozen ? 0 : Number(row.withdrawable_balance_cents || 0)),
        0
      ),
      totalActiveExposureHoldsCents: sellers.reduce(
        (sum, row) => sum + Number(row.exposure_cents || 0),
        0
      ),
      totalDisputedOrFrozenFundsCents: frozenOrders.reduce(
        (sum, row) => sum + Number(row.seller_proceeds_cents || 0),
        0
      ),
      frozenSellerCount: sellers.filter((row) => row.admin_frozen).length,
      pendingWithdrawalCount: withdrawals.filter((row) => row.status === "pending").length,
    },
    sellers: sellers.map((row: any) => ({
      id: row.seller_id,
      label: formatSellerLabel(row.seller),
      seller: row.seller,
      sellerTier: row.seller?.seller_tier || "tier_1",
      totalBalanceCents: Number(row.total_balance_cents || 0),
      pendingBalanceCents: Number(row.pending_balance_cents || 0),
      availableBalanceCents: Number(row.available_balance_cents || 0),
      exposureCents: Number(row.exposure_cents || 0),
      withdrawableBalanceCents: row.admin_frozen ? 0 : Number(row.withdrawable_balance_cents || 0),
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
