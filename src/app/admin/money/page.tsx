"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { formatListingTitle } from "@/lib/listing-display";

interface MoneyOverviewResponse {
  metrics: {
    totalPendingSellerBalancesCents: number;
    totalAvailableSellerBalancesCents: number;
    totalWithdrawableBalancesCents: number;
    totalDisputedOrFrozenFundsCents: number;
    frozenSellerCount: number;
    pendingWithdrawalCount: number;
  };
  accounting: {
    totalSellerPendingBalanceCents: number;
    totalSellerAvailableBalanceCents: number;
    totalSellerLedgerLiabilityCents: number;
    totalRelayBalanceSnapshotCents: number;
    ledgerSnapshotDeltaCents: number;
    totalLockedWithdrawalBalanceCents: number;
    stripePlatformAvailableBalanceCents: number;
    stripePlatformPendingBalanceCents: number;
    stripePlatformTotalBalanceCents: number;
    stripeVsLedgerLiabilityDeltaCents: number;
    stripeAvailableCoverageDeltaCents: number;
    failedTransferRestoreGapCount: number;
    failedTransferRestoreGapAmountCents: number;
    staleProcessingWithdrawalCount: number;
    staleProcessingWithdrawalAmountCents: number;
    refundsOrDisputesImbalanceCount: number;
    refundRecoveryReviewCount: number;
    refundRecoveryOutstandingExposureCents: number;
    postWithdrawalRecoveryCount: number;
    missingSettlementAvailableOnCount: number;
    stripeBalanceError: string | null;
  };
  warnings: Array<{
    code: string;
    severity: "critical" | "warning" | "info";
    title: string;
    detail: string;
    amountCents?: number;
    count?: number;
    sampleIds?: string[];
  }>;
  sellers: Array<{
    id: string;
    label: string;
    sellerTier: string;
    totalBalanceCents: number;
    pendingBalanceCents: number;
    availableBalanceCents: number;
    withdrawableBalanceCents: number;
    adminFrozen: boolean;
    frozenReason: string | null;
    updatedAt: string | null;
  }>;
  withdrawals: Array<{
    id: string;
    seller_id: string;
    amount_cents: number;
    stripe_transfer_fee_cents: number;
    status: string;
    review_required?: boolean;
    created_at: string;
    seller?: {
      id: string;
      display_name?: string | null;
      full_name?: string | null;
      username?: string | null;
      email?: string | null;
    } | null;
  }>;
  frozenOrders: Array<{
    id: string;
    seller_id: string;
    status: string;
    payout_status: string | null;
    seller_funds_frozen: boolean;
    seller_proceeds_cents: number | null;
    updated_at: string;
    listing?: {
      brand?: string | null;
      model?: string | null;
    } | null;
    seller?: {
      display_name?: string | null;
      full_name?: string | null;
      username?: string | null;
      email?: string | null;
    } | null;
  }>;
}

function formatMoneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function formatSignedMoneyFromCents(cents: number) {
  const absolute = formatMoneyFromCents(Math.abs(cents || 0));
  if (cents > 0) return `+${absolute}`;
  if (cents < 0) return `-${absolute}`;
  return absolute;
}

function relativeTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString();
}

function BreakdownSegment({
  label,
  cents,
  totalCents,
  color,
}: {
  label: string;
  cents: number;
  totalCents: number;
  color: string;
}) {
  const pct = totalCents > 0 ? (cents / totalCents) * 100 : 0;
  if (pct < 0.5) return null;

  return (
    <div className="group relative" style={{ width: `${Math.max(pct, 4)}%` }}>
      <div
        className="h-3 rounded-full transition-all group-hover:h-4"
        style={{ backgroundColor: color }}
      />
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block z-10">
        <div className="rounded-lg bg-[#1a1d2e] border border-white/10 px-3 py-2 text-xs whitespace-nowrap shadow-xl">
          <p className="font-semibold text-[#f5f7fb]">{label}</p>
          <p className="text-white/50">{formatMoneyFromCents(cents)} ({pct.toFixed(1)}%)</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminMoneyPage() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const [data, setData] = useState<MoneyOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      void loadOverview();
    } else if (!isLoading) {
      setLoading(false);
    }
  }, [currentUser?.role, isLoading]);

  async function loadOverview() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/money/overview", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load admin money overview");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin money overview");
    } finally {
      setLoading(false);
    }
  }

  const reviewRequiredWithdrawals = useMemo(
    () => (data?.withdrawals || []).filter((item) => item.review_required),
    [data?.withdrawals]
  );
  const criticalWarningCount = useMemo(
    () => (data?.warnings || []).filter((warning) => warning.severity === "critical").length,
    [data?.warnings]
  );

  const filteredSellers = useMemo(() => {
    const sellers = data?.sellers || [];
    if (!sellerFilter.trim()) return sellers.slice(0, 20);
    const q = sellerFilter.toLowerCase();
    return sellers.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 20);
  }, [data?.sellers, sellerFilter]);

  // Build the combined activity feed from withdrawals + frozen orders
  const activityFeed = useMemo(() => {
    const items: Array<{
      id: string;
      type: "withdrawal" | "frozen";
      title: string;
      subtitle: string;
      amount: string;
      timestamp: string;
      href: string;
      status: string;
    }> = [];

    for (const w of data?.withdrawals || []) {
      items.push({
        id: `w-${w.id}`,
        type: "withdrawal",
        title:
          w.seller?.display_name ||
          w.seller?.full_name ||
          w.seller?.username ||
          w.seller?.email ||
          "Unknown seller",
        subtitle: `Fee ${formatMoneyFromCents(w.stripe_transfer_fee_cents)}`,
        amount: formatMoneyFromCents(w.amount_cents),
        timestamp: w.created_at,
        href: `/admin/money/sellers/${w.seller_id}`,
        status: w.status.replace(/_/g, " "),
      });
    }

    for (const o of data?.frozenOrders || []) {
      items.push({
        id: `f-${o.id}`,
        type: "frozen",
        title: formatListingTitle(o.listing?.brand, o.listing?.model, undefined, "Order"),
        subtitle:
          o.seller?.display_name ||
          o.seller?.full_name ||
          o.seller?.username ||
          o.seller?.email ||
          "Unknown seller",
        amount: formatMoneyFromCents(Number(o.seller_proceeds_cents || 0)),
        timestamp: o.updated_at,
        href: `/admin/money/orders/${o.id}`,
        status: o.payout_status || o.status,
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items;
  }, [data?.withdrawals, data?.frozenOrders]);

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading Relay Balance overview...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  // Compute hero totals
  const totalRelayBalance = data
    ? data.metrics.totalPendingSellerBalancesCents + data.metrics.totalAvailableSellerBalancesCents
    : 0;
  const breakdownTotal = data
    ? data.metrics.totalPendingSellerBalancesCents +
      data.metrics.totalAvailableSellerBalancesCents +
      data.metrics.totalDisputedOrFrozenFundsCents
    : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN MONEY</p>
          <h1 className="relay-title">Relay Balance</h1>
          <p className="text-white/50 max-w-2xl">
            Platform-wide financial snapshot. Monitor balances, address flagged items, and drill into individual sellers.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/withdrawals" className="relay-button-secondary inline-flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Withdrawal Queue
          </Link>
          <button
            onClick={() => void loadOverview()}
            className="relay-button-secondary inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="relay-card border border-red-500/20 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Hero Financial Summary */}
          <div className="relay-card p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
              <div>
                <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">
                  Total Relay Balance
                </p>
                <p className="text-4xl sm:text-5xl font-bold text-[#f5f7fb] tracking-tight">
                  {formatMoneyFromCents(totalRelayBalance)}
                </p>
                <p className="text-white/40 text-sm mt-1">
                  {formatMoneyFromCents(data.metrics.totalPendingSellerBalancesCents)} pending
                  {" + "}
                  {formatMoneyFromCents(data.metrics.totalAvailableSellerBalancesCents)} available
                </p>
              </div>
              <div className="text-right">
                <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">Available to Withdraw</p>
                <p className="text-2xl font-semibold text-[#7ca6ff]">
                  {formatMoneyFromCents(data.metrics.totalWithdrawableBalancesCents)}
                </p>
              </div>
            </div>

            {/* Composition Bar */}
            <div>
              <div className="flex gap-1 rounded-full overflow-hidden bg-white/5 p-1">
                <BreakdownSegment
                  label="Pending"
                  cents={data.metrics.totalPendingSellerBalancesCents}
                  totalCents={breakdownTotal}
                  color="#f59e0b"
                />
                <BreakdownSegment
                  label="Available"
                  cents={data.metrics.totalAvailableSellerBalancesCents}
                  totalCents={breakdownTotal}
                  color="#10b981"
                />
                <BreakdownSegment
                  label="Disputed / Frozen"
                  cents={data.metrics.totalDisputedOrFrozenFundsCents}
                  totalCents={breakdownTotal}
                  color="#ef4444"
                />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Pending
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Available
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Frozen
                </span>
              </div>
            </div>
          </div>

          <div className="relay-card p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-5">
              <div>
                <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">
                  Launch Accounting Safety
                </p>
                <h2 className="text-xl font-semibold text-[#f5f7fb]">Platform Balance Checks</h2>
                <p className="text-white/45 text-sm mt-1 max-w-3xl">
                  Compare Relay&apos;s seller ledger liabilities against the pooled Stripe platform balance before opening withdrawals at launch.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {criticalWarningCount > 0 ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-300">
                    <AlertTriangle className="w-4 h-4" />
                    {criticalWarningCount} critical warning{criticalWarningCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    No critical launch warnings
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[
                ["Seller Pending", formatMoneyFromCents(data.accounting.totalSellerPendingBalanceCents)],
                ["Seller Available", formatMoneyFromCents(data.accounting.totalSellerAvailableBalanceCents)],
                ["Ledger Liability", formatMoneyFromCents(data.accounting.totalSellerLedgerLiabilityCents)],
                ["Stripe Platform Available", formatMoneyFromCents(data.accounting.stripePlatformAvailableBalanceCents)],
                ["Stripe Platform Pending", formatMoneyFromCents(data.accounting.stripePlatformPendingBalanceCents)],
                ["Stripe vs Ledger Delta", formatSignedMoneyFromCents(data.accounting.stripeVsLedgerLiabilityDeltaCents)],
                ["Available Coverage Delta", formatSignedMoneyFromCents(data.accounting.stripeAvailableCoverageDeltaCents)],
                ["Locked Withdrawal Balance", formatMoneyFromCents(data.accounting.totalLockedWithdrawalBalanceCents)],
                ["Missing available_on", String(data.accounting.missingSettlementAvailableOnCount)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">{label}</p>
                  <p className="text-[#f5f7fb] font-semibold text-lg">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-2">Checks</p>
                <div className="space-y-2 text-sm text-white/60">
                  <p>
                    Failed transfer restore gaps: <span className="text-[#f5f7fb] font-semibold">{data.accounting.failedTransferRestoreGapCount}</span>
                    {" · "}
                    {formatMoneyFromCents(data.accounting.failedTransferRestoreGapAmountCents)}
                  </p>
                  <p>
                    Stale processing withdrawals: <span className="text-[#f5f7fb] font-semibold">{data.accounting.staleProcessingWithdrawalCount}</span>
                    {" · "}
                    {formatMoneyFromCents(data.accounting.staleProcessingWithdrawalAmountCents)}
                  </p>
                  <p>
                    Refund/dispute imbalance candidates: <span className="text-[#f5f7fb] font-semibold">{data.accounting.refundsOrDisputesImbalanceCount}</span>
                  </p>
                  <p>
                    Refund recovery reviews: <span className="text-[#f5f7fb] font-semibold">{data.accounting.refundRecoveryReviewCount}</span>
                    {" · "}
                    {formatMoneyFromCents(data.accounting.refundRecoveryOutstandingExposureCents)}
                  </p>
                  <p>
                    Post-withdrawal recovery cases: <span className="text-[#f5f7fb] font-semibold">{data.accounting.postWithdrawalRecoveryCount}</span>
                  </p>
                  <p>
                    Ledger snapshot delta: <span className="text-[#f5f7fb] font-semibold">{formatSignedMoneyFromCents(data.accounting.ledgerSnapshotDeltaCents)}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-2">Stripe Status</p>
                {data.accounting.stripeBalanceError ? (
                  <p className="text-sm text-red-300">{data.accounting.stripeBalanceError}</p>
                ) : (
                  <div className="space-y-2 text-sm text-white/60">
                    <p>
                      Stripe platform total: <span className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(data.accounting.stripePlatformTotalBalanceCents)}</span>
                    </p>
                    <p>
                      Seller liability total: <span className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(data.accounting.totalSellerLedgerLiabilityCents)}</span>
                    </p>
                    <p>
                      Difference: <span className="text-[#f5f7fb] font-semibold">{formatSignedMoneyFromCents(data.accounting.stripeVsLedgerLiabilityDeltaCents)}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {(data.warnings || []).length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  No launch accounting warnings are currently detected.
                </div>
              ) : (
                data.warnings.map((warning) => {
                  const tone =
                    warning.severity === "critical"
                      ? "border-red-500/20 bg-red-500/10 text-red-200"
                      : warning.severity === "warning"
                        ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
                        : "border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#dce7ff]";
                  return (
                    <div key={warning.code} className={`rounded-2xl border p-4 ${tone}`}>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                          {warning.severity}
                        </span>
                        <p className="font-semibold text-sm">{warning.title}</p>
                      </div>
                      <p className="text-sm">{warning.detail}</p>
                      {(warning.amountCents !== undefined || warning.count !== undefined || (warning.sampleIds || []).length > 0) && (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {warning.amountCents !== undefined && (
                            <span className="rounded-full bg-black/10 px-2.5 py-1">
                              Amount {formatMoneyFromCents(warning.amountCents)}
                            </span>
                          )}
                          {warning.count !== undefined && (
                            <span className="rounded-full bg-black/10 px-2.5 py-1">
                              Count {warning.count}
                            </span>
                          )}
                          {(warning.sampleIds || []).slice(0, 5).map((id) => (
                            <span key={id} className="rounded-full bg-black/10 px-2.5 py-1">
                              {id.slice(0, 8)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Attention Indicators (only shown when counts > 0) */}
          {(data.metrics.pendingWithdrawalCount > 0 ||
            data.metrics.frozenSellerCount > 0 ||
            reviewRequiredWithdrawals.length > 0) && (
            <div className="flex flex-col sm:flex-row gap-3">
              {data.metrics.pendingWithdrawalCount > 0 && (
                <Link
                  href="/admin/withdrawals"
                  className="flex-1 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-3.5 transition-colors hover:bg-amber-500/15"
                >
                  <Wallet className="w-5 h-5 text-amber-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-amber-200 font-semibold text-sm">
                      {data.metrics.pendingWithdrawalCount} Pending Withdrawal{data.metrics.pendingWithdrawalCount === 1 ? "" : "s"}
                    </p>
                    <p className="text-amber-100/60 text-xs">Awaiting processing</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-300/60 ml-auto flex-shrink-0" />
                </Link>
              )}

              {data.metrics.frozenSellerCount > 0 && (
                <Link
                  href="/admin/money?filter=frozen"
                  className="flex-1 flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 transition-colors hover:bg-red-500/15"
                >
                  <ShieldAlert className="w-5 h-5 text-red-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-red-200 font-semibold text-sm">
                      {data.metrics.frozenSellerCount} Frozen Seller{data.metrics.frozenSellerCount === 1 ? "" : "s"}
                    </p>
                    <p className="text-red-100/60 text-xs">Funds held from payout</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-red-300/60 ml-auto flex-shrink-0" />
                </Link>
              )}

              {reviewRequiredWithdrawals.length > 0 && (
                <Link
                  href="/admin/withdrawals"
                  className="flex-1 flex items-center gap-3 rounded-2xl border border-[#5f8fff]/20 bg-[#5f8fff]/10 px-5 py-3.5 transition-colors hover:bg-[#5f8fff]/15"
                >
                  <Clock3 className="w-5 h-5 text-[#7ca6ff] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[#7ca6ff] font-semibold text-sm">
                      {reviewRequiredWithdrawals.length} Manual Review{reviewRequiredWithdrawals.length === 1 ? "" : "s"}
                    </p>
                    <p className="text-[#7ca6ff]/60 text-xs">Requires admin approval</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#7ca6ff]/60 ml-auto flex-shrink-0" />
                </Link>
              )}
            </div>
          )}

          {/* Seller List + Activity Feed */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-6">
            {/* Seller Money Detail */}
            <div className="relay-card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-[#f5f7fb]">Seller Money Detail</h2>
                  <p className="text-white/45 text-sm">
                    Open a seller to inspect balances, withdrawals, ledger activity, and disputes.
                  </p>
                </div>
              </div>

              {/* Search Filter */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={sellerFilter}
                  onChange={(e) => setSellerFilter(e.target.value)}
                  placeholder="Search sellers..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-4 py-2.5 text-sm text-[#f5f7fb] placeholder:text-white/30 focus:outline-none focus:border-[#5f8fff]/40 transition-colors"
                />
              </div>

              <div className="space-y-3">
                {filteredSellers.length === 0 ? (
                  <div className="text-white/40 text-sm py-4 text-center">
                    {sellerFilter ? "No sellers match your search." : "No Relay Balance sellers found yet."}
                  </div>
                ) : (
                  filteredSellers.map((seller) => (
                    <Link
                      key={seller.id}
                      href={`/admin/money/sellers/${seller.id}`}
                      className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="text-[#f5f7fb] font-semibold">{seller.label}</p>
                            <span className="rounded-full bg-[#5f8fff]/15 px-2 py-0.5 text-xs font-semibold text-[#7ca6ff]">
                              {seller.sellerTier.replace("_", " ")}
                            </span>
                            {seller.adminFrozen && (
                              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                                frozen
                              </span>
                            )}
                          </div>
                          {seller.frozenReason && (
                            <p className="text-red-300 text-sm mt-1">{seller.frozenReason}</p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:min-w-[480px]">
                          <div>
                            <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">Pending</p>
                            <p className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(seller.pendingBalanceCents)}</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">Available</p>
                            <p className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(seller.availableBalanceCents)}</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">Total</p>
                            <p className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(seller.totalBalanceCents)}</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">Available to Withdraw</p>
                            <p className="text-[#7ca6ff] font-bold text-base">{formatMoneyFromCents(seller.withdrawableBalanceCents)}</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Activity Feed (combined withdrawals + frozen orders) */}
            <div className="relay-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Banknote className="w-5 h-5 text-[#7ca6ff]" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Activity Feed</h2>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {activityFeed.length === 0 ? (
                  <div className="text-white/40 text-sm py-4 text-center">No recent activity.</div>
                ) : (
                  activityFeed.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`block rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04] border-l-[3px] ${
                        item.type === "withdrawal"
                          ? "border-l-emerald-500"
                          : "border-l-red-500"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[#f5f7fb] font-medium truncate">{item.title}</p>
                          <p className="text-white/45 text-sm truncate">{item.subtitle}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-semibold ${item.type === "withdrawal" ? "text-emerald-300" : "text-red-300"}`}>
                            {item.amount}
                          </p>
                          <span className="text-white/40 text-xs">{item.status}</span>
                        </div>
                      </div>
                      <p className="text-white/30 text-xs mt-2">{relativeTime(item.timestamp)}</p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
