"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Lock, Star, AlertTriangle, RefreshCw, ChevronRight } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import type { SellerTier } from "@/types";

interface SellerTrustDashboardSeller {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  username: string | null;
  seller_tier: SellerTier;
  recommended_seller_tier: SellerTier;
  trust_score: number;
  recommended_trust_score: number;
  completed_order_count: number;
  lifetime_gmv_cents: number;
  buyer_completion_rate_bps: number;
  authenticity_violation_count: number;
  tier_locked: boolean;
  is_founding_seller: boolean;
  tier_3_approved_at: string | null;
  is_banned: boolean;
  tier_last_evaluated_at: string | null;
  reserve_balance_cents: number;
  reserve_percentage_bps: number;
  open_dispute_count: number;
  review_queue_count: number;
  tag_inventory_count: number;
}

interface DashboardData {
  sellers: SellerTrustDashboardSeller[];
  metrics: {
    sellerCount: number;
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    lockedCount: number;
    foundingSellerCount: number;
    bannedSellerCount: number;
    pendingTier3Approvals: number;
    openDisputeCount: number;
    custodyReviewCount: number;
    checkcheckReviewCount: number;
    tagReviewCount: number;
    totalReserveBalanceCents: number;
    totalTagInventory: number;
  };
}

function formatTier(tier: SellerTier) {
  return tier.replace("tier_", "Tier ");
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function formatPercent(bps: number) {
  return `${((bps || 0) / 100).toFixed(1)}%`;
}

function MetricCard({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string | number;
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
      <div className={`inline-flex px-3 py-2 rounded-xl border text-lg font-semibold ${tones[tone]}`}>
        {value}
      </div>
    </div>
  );
}

export default function AdminTrustDashboardPage() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") {
      return;
    }

    void loadDashboard();
  }, [currentUser]);

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/trust/dashboard", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load seller trust dashboard");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load seller trust dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function evaluateAll() {
    setEvaluating(true);
    setError("");

    try {
      const response = await fetch("/api/admin/trust/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to run trust evaluation");
      }

      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run trust evaluation");
    } finally {
      setEvaluating(false);
    }
  }

  if (isLoading || loading) {
    return (
      <div className="py-12 text-center text-white/40">
        Loading seller trust dashboard...
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Seller Trust</h1>
          <p className="text-white/50 max-w-2xl">
            Review automated trust scores, promotion gates, reserve balances, tag inventory, and sellers who need manual attention.
          </p>
        </div>

        <button
          onClick={evaluateAll}
          disabled={evaluating}
          className="relay-button-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${evaluating ? "animate-spin" : ""}`} />
          {evaluating ? "Evaluating..." : "Run Evaluation"}
        </button>
      </div>

      {error && (
        <div className="relay-card p-4 border border-red-500/20 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard label="Sellers" value={data.metrics.sellerCount} />
            <MetricCard label="Pending Tier 3 Approval" value={data.metrics.pendingTier3Approvals} tone="amber" />
            <MetricCard label="Locked Tiers" value={data.metrics.lockedCount} tone="green" />
            <MetricCard label="Banned Sellers" value={data.metrics.bannedSellerCount} tone="red" />
            <MetricCard label="Tier 1 / 2 / 3" value={`${data.metrics.tier1Count} / ${data.metrics.tier2Count} / ${data.metrics.tier3Count}`} />
            <MetricCard label="Orders Requiring Review" value={data.metrics.custodyReviewCount + data.metrics.checkcheckReviewCount + data.metrics.tagReviewCount} tone="amber" />
            <MetricCard label="Total Reserve Balance" value={formatMoney(data.metrics.totalReserveBalanceCents)} tone="green" />
            <MetricCard label="Assigned Tag Inventory" value={data.metrics.totalTagInventory} />
          </div>

          <div className="relay-card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Seller Queue</h2>
                <p className="text-white/45 text-sm">Current tier, automated recommendation, violations, reserves, and review load.</p>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {data.sellers.map((seller) => (
                <Link
                  key={seller.id}
                  href={`/admin/trust/${seller.id}`}
                  className="block px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-[#f5f7fb] font-semibold truncate">
                          {seller.display_name || seller.full_name || seller.username || seller.email}
                        </p>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#5f8fff]/15 text-[#7ca6ff]">
                          {formatTier(seller.seller_tier)}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white/5 text-white/60">
                          Recommended {formatTier(seller.recommended_seller_tier)}
                        </span>
                        {seller.tier_locked && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300">
                            <Lock className="w-3 h-3" />
                            Locked
                          </span>
                        )}
                        {seller.is_founding_seller && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300">
                            <Star className="w-3 h-3" />
                            Founding
                          </span>
                        )}
                        {seller.is_banned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-300">
                            <AlertTriangle className="w-3 h-3" />
                            Banned
                          </span>
                        )}
                      </div>
                      <p className="text-white/40 text-sm truncate">
                        @{seller.username || "no-username"} · {seller.email}
                      </p>
                    </div>

                    {/* Desktop: grid layout / Mobile: compact inline stats */}
                    <div className="hidden md:grid md:grid-cols-3 xl:grid-cols-6 gap-3 xl:min-w-[780px]">
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-white/50 text-[11px] uppercase tracking-[0.14em] mb-1">Score</p>
                        <p className="text-[#f5f7fb] font-semibold">{seller.trust_score}</p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-white/50 text-[11px] uppercase tracking-[0.14em] mb-1">GMV</p>
                        <p className="text-[#f5f7fb] font-semibold">{formatMoney(seller.lifetime_gmv_cents)}</p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-white/50 text-[11px] uppercase tracking-[0.14em] mb-1">Completed</p>
                        <p className="text-[#f5f7fb] font-semibold">{seller.completed_order_count}</p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-white/50 text-[11px] uppercase tracking-[0.14em] mb-1">Buyer Completion</p>
                        <p className="text-[#f5f7fb] font-semibold">{formatPercent(seller.buyer_completion_rate_bps)}</p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-white/50 text-[11px] uppercase tracking-[0.14em] mb-1">Reserve</p>
                        <p className="text-[#f5f7fb] font-semibold">{formatMoney(seller.reserve_balance_cents)}</p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-white/50 text-[11px] uppercase tracking-[0.14em] mb-1">Review Queue</p>
                        <p className="text-[#f5f7fb] font-semibold">{seller.review_queue_count}</p>
                      </div>
                    </div>
                    <div className="md:hidden flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span className="text-white/50">Score <span className="text-[#f5f7fb] font-semibold">{seller.trust_score}</span></span>
                      <span className="text-white/50">GMV <span className="text-[#f5f7fb] font-semibold">{formatMoney(seller.lifetime_gmv_cents)}</span></span>
                      <span className="text-white/50">Orders <span className="text-[#f5f7fb] font-semibold">{seller.completed_order_count}</span></span>
                      <span className="text-white/50">Reserve <span className="text-[#f5f7fb] font-semibold">{formatMoney(seller.reserve_balance_cents)}</span></span>
                      {seller.review_queue_count > 0 && (
                        <span className="text-amber-300 font-semibold">{seller.review_queue_count} to review</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[#7ca6ff] text-sm font-medium">
                      <Shield className="w-4 h-4" />
                      Review Seller
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
