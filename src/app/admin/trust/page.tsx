"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Star, AlertTriangle, RefreshCw } from "lucide-react";
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
  pending_balance_cents: number;
  available_balance_cents: number;
  exposure_cents: number;
  withdrawable_balance_cents: number;
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
    totalPendingBalanceCents: number;
    totalAvailableBalanceCents: number;
    totalExposureCents: number;
    totalWithdrawableBalanceCents: number;
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

function trustScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function trustScoreDot(score: number): string {
  if (score >= 70) return "bg-emerald-400";
  if (score >= 40) return "bg-amber-400";
  return "bg-red-400";
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

  // Memoized counts - placed above early returns to avoid hooks-order violations
  const totalReviewCount = useMemo(() => {
    if (!data) return 0;
    return data.metrics.custodyReviewCount + data.metrics.checkcheckReviewCount + data.metrics.tagReviewCount;
  }, [data]);

  const tierMismatchCount = useMemo(() => {
    if (!data) return 0;
    return data.sellers.filter((s) => s.seller_tier !== s.recommended_seller_tier).length;
  }, [data]);

  const tierBarSegments = useMemo(() => {
    if (!data || data.metrics.sellerCount === 0) return { t1: 0, t2: 0, t3: 0 };
    const total = data.metrics.sellerCount;
    return {
      t1: (data.metrics.tier1Count / total) * 100,
      t2: (data.metrics.tier2Count / total) * 100,
      t3: (data.metrics.tier3Count / total) * 100,
    };
  }, [data]);

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
            Trust scores, tier distribution, and sellers who need manual attention.
          </p>
        </div>

        <button
          onClick={evaluateAll}
          disabled={evaluating}
          className={`inline-flex items-center gap-2 ${
            tierMismatchCount > 0
              ? "relay-button-primary"
              : "relay-button-secondary"
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${evaluating ? "animate-spin" : ""}`} />
          {evaluating
            ? "Evaluating..."
            : tierMismatchCount > 0
              ? `Run Evaluation (${tierMismatchCount} pending)`
              : "Run Evaluation"}
        </button>
      </div>

      {error && (
        <div className="relay-card p-4 border border-red-500/20 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Hero row: seller count + tier distribution bar */}
          <div className="relay-card p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
              <div className="shrink-0">
                <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-1">Total Sellers</p>
                <p className="text-3xl font-bold text-[#f5f7fb]">{data.metrics.sellerCount}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">Tier Distribution</p>
                <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
                  {tierBarSegments.t1 > 0 && (
                    <div
                      className="bg-white/30 transition-all"
                      style={{ width: `${tierBarSegments.t1}%` }}
                    />
                  )}
                  {tierBarSegments.t2 > 0 && (
                    <div
                      className="bg-[#5f8fff] transition-all"
                      style={{ width: `${tierBarSegments.t2}%` }}
                    />
                  )}
                  {tierBarSegments.t3 > 0 && (
                    <div
                      className="bg-emerald-400 transition-all"
                      style={{ width: `${tierBarSegments.t3}%` }}
                    />
                  )}
                </div>
                <div className="flex gap-5 mt-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white/30" />
                    <span className="text-white/50">T1</span>
                    <span className="text-[#f5f7fb] font-semibold">{data.metrics.tier1Count}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#5f8fff]" />
                    <span className="text-white/50">T2</span>
                    <span className="text-[#f5f7fb] font-semibold">{data.metrics.tier2Count}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-white/50">T3</span>
                    <span className="text-[#f5f7fb] font-semibold">{data.metrics.tier3Count}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Attention row: actionable items only, shown when count > 0 */}
          {(data.metrics.pendingTier3Approvals > 0 ||
            data.metrics.bannedSellerCount > 0 ||
            data.metrics.lockedCount > 0 ||
            totalReviewCount > 0) && (
            <div className="flex flex-wrap gap-2">
              {data.metrics.pendingTier3Approvals > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border border-amber-500/20 bg-amber-500/10 text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {data.metrics.pendingTier3Approvals} Pending T3 Approval{data.metrics.pendingTier3Approvals !== 1 ? "s" : ""}
                </span>
              )}
              {data.metrics.bannedSellerCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border border-red-500/20 bg-red-500/10 text-red-300">
                  {data.metrics.bannedSellerCount} Banned
                </span>
              )}
              {data.metrics.lockedCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                  <Lock className="w-3.5 h-3.5" />
                  {data.metrics.lockedCount} Locked
                </span>
              )}
              {totalReviewCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border border-amber-500/20 bg-amber-500/10 text-amber-300">
                  {totalReviewCount} Order{totalReviewCount !== 1 ? "s" : ""} to Review
                </span>
              )}
            </div>
          )}

          {/* Seller queue */}
          <div className="relay-card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Seller Queue</h2>
              <p className="text-white/45 text-sm">Tier status, trust scores, and review load.</p>
            </div>

            <div className="divide-y divide-white/5">
              {data.sellers.map((seller) => (
                <Link
                  key={seller.id}
                  href={`/admin/trust/${seller.id}`}
                  className="block px-5 py-4 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    {/* Left: name + badges */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-[#f5f7fb] font-semibold truncate group-hover:text-[#7ca6ff] transition-colors">
                          {seller.display_name || seller.full_name || seller.username || seller.email}
                        </p>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#5f8fff]/15 text-[#7ca6ff]">
                          {formatTier(seller.seller_tier)}
                        </span>
                        {seller.seller_tier !== seller.recommended_seller_tier && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300">
                            Rec. {formatTier(seller.recommended_seller_tier)}
                          </span>
                        )}
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
                        {seller.review_queue_count > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300">
                            {seller.review_queue_count} to review
                          </span>
                        )}
                      </div>
                      <p className="text-white/40 text-sm truncate">
                        @{seller.username || "no-username"} · {seller.email}
                      </p>
                    </div>

                    {/* Right: key stats inline */}
                    <div className="hidden sm:flex items-center gap-5 shrink-0 text-sm">
                      <div className="text-center">
                        <p className="text-white/40 text-[11px] uppercase tracking-[0.14em] mb-0.5">Score</p>
                        <span className="flex items-center justify-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${trustScoreDot(seller.trust_score)}`} />
                          <span className={`font-bold text-base ${trustScoreColor(seller.trust_score)}`}>
                            {seller.trust_score}
                          </span>
                        </span>
                      </div>
                      <div className="text-center">
                        <p className="text-white/40 text-[11px] uppercase tracking-[0.14em] mb-0.5">GMV</p>
                        <p className="text-[#f5f7fb] font-semibold">{formatMoney(seller.lifetime_gmv_cents)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-white/40 text-[11px] uppercase tracking-[0.14em] mb-0.5">Orders</p>
                        <p className="text-[#f5f7fb] font-semibold">{seller.completed_order_count}</p>
                      </div>
                    </div>

                    {/* Mobile: compact stats */}
                    <div className="sm:hidden flex items-center gap-3 shrink-0 text-sm">
                      <span className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${trustScoreDot(seller.trust_score)}`} />
                        <span className={`font-bold ${trustScoreColor(seller.trust_score)}`}>
                          {seller.trust_score}
                        </span>
                      </span>
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
