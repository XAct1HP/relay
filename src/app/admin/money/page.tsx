"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  Clock3,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";

interface MoneyOverviewResponse {
  metrics: {
    totalPendingSellerBalancesCents: number;
    totalAvailableSellerBalancesCents: number;
    totalWithdrawableBalancesCents: number;
    totalActiveExposureHoldsCents: number;
    totalDisputedOrFrozenFundsCents: number;
    frozenSellerCount: number;
    pendingWithdrawalCount: number;
  };
  sellers: Array<{
    id: string;
    label: string;
    sellerTier: string;
    totalBalanceCents: number;
    pendingBalanceCents: number;
    availableBalanceCents: number;
    exposureCents: number;
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

function relativeTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString();
}

function MetricCard({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const tones = {
    blue: "border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#7ca6ff]",
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
  };

  return (
    <div className="relay-card p-4 sm:p-5">
      <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">{label}</p>
      <div className={`inline-flex rounded-xl border px-3 py-2 text-lg font-semibold ${tones[tone]}`}>
        {value}
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

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading Relay Balance overview...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN MONEY</p>
          <h1 className="relay-title">Relay Balance</h1>
          <p className="text-white/50 max-w-3xl">
            Review platform-wide pending, available, withdrawable, exposure, frozen funds, and recent withdrawals.
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <MetricCard
              label="Total Pending Seller Balances"
              value={formatMoneyFromCents(data.metrics.totalPendingSellerBalancesCents)}
              tone="amber"
            />
            <MetricCard
              label="Total Available Seller Balances"
              value={formatMoneyFromCents(data.metrics.totalAvailableSellerBalancesCents)}
              tone="green"
            />
            <MetricCard
              label="Total Withdrawable Balances"
              value={formatMoneyFromCents(data.metrics.totalWithdrawableBalancesCents)}
              tone="blue"
            />
            <MetricCard
              label="Total Active Exposure Holds"
              value={formatMoneyFromCents(data.metrics.totalActiveExposureHoldsCents)}
              tone="amber"
            />
            <MetricCard
              label="Total Disputed / Frozen Funds"
              value={formatMoneyFromCents(data.metrics.totalDisputedOrFrozenFundsCents)}
              tone="red"
            />
            <MetricCard
              label="Frozen Sellers"
              value={String(data.metrics.frozenSellerCount)}
              tone="red"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-6">
            <div className="relay-card p-5">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-[#f5f7fb]">Seller Money Detail</h2>
                  <p className="text-white/45 text-sm">Open a seller to inspect balances, exposure, ledger activity, withdrawals, disputes, and audit events.</p>
                </div>
              </div>

              <div className="space-y-3">
                {data.sellers.length === 0 ? (
                  <div className="text-white/40 text-sm">No Relay Balance sellers found yet.</div>
                ) : (
                  data.sellers.slice(0, 20).map((seller) => (
                    <Link
                      key={seller.id}
                      href={`/admin/money/sellers/${seller.id}`}
                      className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
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
                          <p className="text-white/45 text-sm">
                            Updated {relativeTime(seller.updatedAt)}
                          </p>
                          {seller.frozenReason && (
                            <p className="text-red-300 text-sm mt-2">{seller.frozenReason}</p>
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
                            <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">Exposure</p>
                            <p className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(seller.exposureCents)}</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">Withdrawable</p>
                            <p className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(seller.withdrawableBalanceCents)}</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="relay-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Banknote className="w-5 h-5 text-emerald-300" />
                  <h2 className="text-lg font-semibold text-[#f5f7fb]">Recent Withdrawals</h2>
                </div>

                <div className="space-y-3">
                  {data.withdrawals.length === 0 ? (
                    <div className="text-white/40 text-sm">No withdrawals yet.</div>
                  ) : (
                    data.withdrawals.map((withdrawal) => (
                      <div key={withdrawal.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-[#f5f7fb] font-medium">
                            {withdrawal.seller?.display_name ||
                              withdrawal.seller?.full_name ||
                              withdrawal.seller?.username ||
                              withdrawal.seller?.email ||
                              "Unknown seller"}
                          </p>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-white/60">
                            {withdrawal.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-white/45 text-sm mb-2">
                          Gross {formatMoneyFromCents(withdrawal.amount_cents)} · Fee {formatMoneyFromCents(withdrawal.stripe_transfer_fee_cents)}
                        </p>
                        <div className="flex items-center justify-between text-xs text-white/40">
                          <span>{relativeTime(withdrawal.created_at)}</span>
                          <Link
                            href={`/admin/money/sellers/${withdrawal.seller_id}`}
                            className="inline-flex items-center gap-1 text-[#7ca6ff] hover:text-[#9bbcff]"
                          >
                            Seller detail
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="relay-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldAlert className="w-5 h-5 text-red-300" />
                  <h2 className="text-lg font-semibold text-[#f5f7fb]">Disputed / Frozen Orders</h2>
                </div>

                <div className="space-y-3">
                  {data.frozenOrders.length === 0 ? (
                    <div className="text-white/40 text-sm">No frozen funds right now.</div>
                  ) : (
                    data.frozenOrders.map((order) => (
                      <Link
                        key={order.id}
                        href={`/admin/money/orders/${order.id}`}
                        className="block rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[#f5f7fb] font-medium truncate">
                              {(order.listing?.brand || "Unknown")} {(order.listing?.model || "Order")}
                            </p>
                            <p className="text-white/45 text-sm">
                              {order.seller?.display_name ||
                                order.seller?.full_name ||
                                order.seller?.username ||
                                order.seller?.email ||
                                "Unknown seller"}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-red-300 font-semibold">
                              {formatMoneyFromCents(Number(order.seller_proceeds_cents || 0))}
                            </p>
                            <p className="text-white/40 text-xs">
                              {order.payout_status || order.status}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              {reviewRequiredWithdrawals.length > 0 && (
                <div className="relay-card border border-amber-500/20 bg-amber-500/10 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock3 className="w-5 h-5 text-amber-300" />
                    <h2 className="text-lg font-semibold text-amber-200">Manual Review Queue</h2>
                  </div>
                  <p className="text-amber-100/80 text-sm">
                    {reviewRequiredWithdrawals.length} withdrawal request{reviewRequiredWithdrawals.length === 1 ? "" : "s"} currently require admin review before Stripe transfer.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
