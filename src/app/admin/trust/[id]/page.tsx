"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Lock,
  Unlock,
  RefreshCw,
  Shield,
  Star,
  AlertTriangle,
  Tag,
  Archive,
  Flag,
  CheckCircle2,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import type {
  SellerTier,
  SellerTierHistoryEntry,
  SellerTrustEvaluation,
  SellerViolation,
  SellerReserveAccount,
  SellerReserveEntry,
  RelayTag,
  User,
} from "@/types";

interface SellerTrustDetailResponse {
  seller: User;
  reserveAccount: SellerReserveAccount | null;
  reserveEntries: SellerReserveEntry[];
  tierHistory: SellerTierHistoryEntry[];
  evaluations: SellerTrustEvaluation[];
  violations: SellerViolation[];
  tags: RelayTag[];
  reviewOrders: Array<{
    id: string;
    status: string;
    price: number;
    created_at: string;
    checkcheck_status: string;
    random_audit_required: boolean;
    high_risk_sku_required: boolean;
    listing?: { brand?: string; model?: string } | null;
  }>;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function formatTier(tier?: SellerTier | null) {
  return tier ? tier.replace("tier_", "Tier ") : "None";
}

function formatPercent(bps?: number) {
  return `${(((bps || 0) as number) / 100).toFixed(1)}%`;
}

export default function AdminSellerTrustDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const sellerId = params.id as string;

  const [data, setData] = useState<SellerTrustDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [targetTier, setTargetTier] = useState<SellerTier>("tier_1");
  const [violationType, setViolationType] = useState<"authenticity" | "tag_tampering" | "dispute_rate" | "manual_demotion" | "other">("authenticity");
  const [violationNotes, setViolationNotes] = useState("");

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") {
      return;
    }

    void loadSeller();
  }, [currentUser, sellerId]);

  async function loadSeller() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/trust/sellers/${sellerId}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load seller trust details");
      }

      setData(payload);
      setTargetTier(payload.seller.seller_tier || "tier_1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load seller trust details");
    } finally {
      setLoading(false);
    }
  }

  const latestEvaluation = useMemo(
    () => data?.evaluations?.[0] || null,
    [data]
  );

  async function runSellerEvaluation() {
    setActionLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/trust/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to evaluate seller");
      }

      await loadSeller();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to evaluate seller");
    } finally {
      setActionLoading(false);
    }
  }

  async function updateOverride(action: string, extra: Record<string, unknown> = {}) {
    setActionLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/trust/sellers/${sellerId}/override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: overrideReason,
          ...extra,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update seller trust override");
      }

      await loadSeller();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update seller trust override");
    } finally {
      setActionLoading(false);
    }
  }

  async function addViolation() {
    setActionLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/trust/sellers/${sellerId}/violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          violationType,
          notes: violationNotes,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to record seller violation");
      }

      setViolationNotes("");
      await loadSeller();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record seller violation");
    } finally {
      setActionLoading(false);
    }
  }

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading seller trust details...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  if (!data) {
    return <div className="py-12 text-center text-white/40">Seller not found.</div>;
  }

  const { seller, reserveAccount, reserveEntries, tierHistory, evaluations, violations, tags, reviewOrders } = data;

  return (
    <div className="space-y-6 pb-12">
      <Link
        href="/admin/trust"
        className="inline-flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Seller Trust
      </Link>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">SELLER TRUST DETAIL</p>
          <h1 className="relay-title">{seller.display_name || seller.full_name || seller.username || seller.email}</h1>
          <p className="text-white/45">
            @{seller.username || "no-username"} · {seller.email}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {seller.tier_locked ? (
            <button
              onClick={() => updateOverride("unlock")}
              disabled={actionLoading}
              className="relay-button-secondary inline-flex items-center gap-2"
            >
              <Unlock className="w-4 h-4" />
              Unlock Tier
            </button>
          ) : (
            <button
              onClick={() => updateOverride("lock")}
              disabled={actionLoading}
              className="relay-button-secondary inline-flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              Lock Tier
            </button>
          )}

          <button
            onClick={runSellerEvaluation}
            disabled={actionLoading}
            className="relay-button-secondary inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${actionLoading ? "animate-spin" : ""}`} />
            Re-evaluate
          </button>
        </div>
      </div>

      {error && (
        <div className="relay-card p-4 border border-red-500/20 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="relay-card p-5">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="px-3 py-1 rounded-full bg-[#5f8fff]/15 text-[#7ca6ff] text-sm font-semibold">
                Current {formatTier(seller.seller_tier)}
              </span>
              <span className="px-3 py-1 rounded-full bg-white/5 text-white/60 text-sm font-semibold">
                Recommended {formatTier(seller.recommended_seller_tier || null)}
              </span>
              {seller.tier_locked && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-sm font-semibold">
                  <Lock className="w-3.5 h-3.5" />
                  Locked
                </span>
              )}
              {seller.is_founding_seller && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-sm font-semibold">
                  <Star className="w-3.5 h-3.5" />
                  Founding Seller
                </span>
              )}
              {seller.is_banned && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/15 text-red-300 text-sm font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Banned
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">Trust Score</p>
                <p className="text-[#f5f7fb] text-2xl font-semibold">{seller.trust_score || 0}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">Lifetime GMV</p>
                <p className="text-[#f5f7fb] text-2xl font-semibold">{formatMoney(seller.lifetime_gmv_cents || 0)}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">Completed Orders</p>
                <p className="text-[#f5f7fb] text-2xl font-semibold">{seller.completed_order_count || 0}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">Buyer Completion</p>
                <p className="text-[#f5f7fb] text-2xl font-semibold">{formatPercent(seller.buyer_completion_rate_bps)}</p>
              </div>
            </div>
          </div>

          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Trust Score Breakdown</h2>
            </div>

            {latestEvaluation ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries((latestEvaluation.breakdown as Record<string, number>) || {}).map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">
                      {key.replace(/([A-Z])/g, " $1")}
                    </p>
                    <p className="text-[#f5f7fb] text-xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/45">No trust evaluation has been recorded yet.</p>
            )}
          </div>

          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Archive className="w-5 h-5 text-emerald-300" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Reserve Balance</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">Balance</p>
                <p className="text-[#f5f7fb] text-xl font-semibold">{formatMoney(reserveAccount?.balance_cents || 0)}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">Reserve Rate</p>
                <p className="text-[#f5f7fb] text-xl font-semibold">{formatPercent(reserveAccount?.reserve_percentage_bps || 0)}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">Minimum Balance</p>
                <p className="text-[#f5f7fb] text-xl font-semibold">{formatMoney(reserveAccount?.minimum_balance_cents || 0)}</p>
              </div>
            </div>

            <div className="space-y-2">
              {reserveEntries.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[#f5f7fb] font-medium capitalize">{entry.entry_type.replaceAll("_", " ")}</p>
                    <p className="text-white/40 text-sm">{entry.status} · {new Date(entry.created_at).toLocaleString()}</p>
                  </div>
                  <p className="text-[#f5f7fb] font-semibold">{formatMoney(entry.amount_cents)}</p>
                </div>
              ))}
              {reserveEntries.length === 0 && <p className="text-white/45">No reserve entries yet.</p>}
            </div>
          </div>

          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Flag className="w-5 h-5 text-red-300" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Violations</h2>
            </div>

            <div className="space-y-3 mb-5">
              {violations.map((violation) => (
                <div key={violation.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 text-xs font-semibold">
                      {violation.violation_type.replaceAll("_", " ")}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs font-semibold">
                      {violation.severity}
                    </span>
                  </div>
                  <p className="text-[#f5f7fb] text-sm">{violation.notes || "No notes recorded."}</p>
                  <p className="text-white/40 text-xs mt-2">{new Date(violation.created_at).toLocaleString()}</p>
                </div>
              ))}
              {violations.length === 0 && <p className="text-white/45">No violations recorded.</p>}
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
              <h3 className="text-[#f5f7fb] font-semibold">Add Violation</h3>
              <select
                value={violationType}
                onChange={(event) => setViolationType(event.target.value as typeof violationType)}
                className="relay-input"
              >
                <option value="authenticity">Authenticity</option>
                <option value="tag_tampering">Tag Tampering</option>
                <option value="dispute_rate">Dispute Rate</option>
                <option value="manual_demotion">Manual Demotion</option>
                <option value="other">Other</option>
              </select>
              <textarea
                value={violationNotes}
                onChange={(event) => setViolationNotes(event.target.value)}
                className="relay-textarea"
                rows={3}
                placeholder="Explain the violation and enforcement action."
              />
              <button onClick={addViolation} disabled={actionLoading} className="relay-button-secondary">
                Record Violation
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Manual Controls</h2>
            <div className="space-y-3">
              <select
                value={targetTier}
                onChange={(event) => setTargetTier(event.target.value as SellerTier)}
                className="relay-input"
              >
                <option value="tier_1">Tier 1</option>
                <option value="tier_2">Tier 2</option>
                <option value="tier_3">Tier 3</option>
              </select>
              <textarea
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                className="relay-textarea"
                rows={4}
                placeholder="Document why this manual trust action is needed."
              />
              <button
                onClick={() => updateOverride("set_tier", { targetTier, lock: true })}
                disabled={actionLoading}
                className="relay-button-secondary w-full"
              >
                Set Tier + Lock
              </button>
              <button
                onClick={() => updateOverride("set_founding", { isFoundingSeller: !seller.is_founding_seller })}
                disabled={actionLoading}
                className="relay-button-secondary w-full"
              >
                {seller.is_founding_seller ? "Remove Founding Status" : "Mark as Founding Seller"}
              </button>
              <button
                onClick={() => updateOverride("approve_tier_3")}
                disabled={actionLoading}
                className="relay-button-secondary w-full inline-flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve Tier 3 Eligibility
              </button>
            </div>
          </div>

          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-5 h-5 text-amber-300" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Tag Inventory</h2>
            </div>
            <div className="space-y-2">
              {tags.slice(0, 12).map((tag) => (
                <div key={tag.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[#f5f7fb] font-medium">{tag.tag_serial_number}</p>
                      <p className="text-white/40 text-sm">{tag.status.replaceAll("_", " ")}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs font-semibold">
                      {tag.photo_verification_status.replaceAll("_", " ")}
                    </span>
                  </div>
                </div>
              ))}
              {tags.length === 0 && <p className="text-white/45">No tags assigned to this seller yet.</p>}
            </div>
          </div>

          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Orders Requiring Review</h2>
            <div className="space-y-2">
              {reviewOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <p className="text-[#f5f7fb] font-medium">
                    {(order.listing?.brand || "Unknown")} {(order.listing?.model || "Order")}
                  </p>
                  <p className="text-white/40 text-sm">
                    {order.id.slice(0, 8)}... · {order.status} · {formatMoney(Math.round((order.price || 0) * 100))}
                  </p>
                </div>
              ))}
              {reviewOrders.length === 0 && <p className="text-white/45">No review-blocked orders right now.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="relay-card p-5">
          <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Tier History</h2>
          <div className="space-y-2">
            {tierHistory.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-full bg-[#5f8fff]/15 text-[#7ca6ff] text-xs font-semibold">
                    {formatTier(entry.previous_tier)} → {formatTier(entry.new_tier)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs font-semibold">
                    {entry.change_source.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="text-white/45 text-sm">{entry.reason || "No reason recorded."}</p>
                <p className="text-white/35 text-xs mt-2">{new Date(entry.created_at).toLocaleString()}</p>
              </div>
            ))}
            {tierHistory.length === 0 && <p className="text-white/45">No tier history recorded yet.</p>}
          </div>
        </div>

        <div className="relay-card p-5">
          <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Recent Evaluations</h2>
          <div className="space-y-2">
            {evaluations.map((evaluation) => (
              <div key={evaluation.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-full bg-[#5f8fff]/15 text-[#7ca6ff] text-xs font-semibold">
                    Score {evaluation.trust_score}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs font-semibold">
                    Recommended {formatTier(evaluation.recommended_tier)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs font-semibold">
                    Applied {formatTier(evaluation.applied_tier)}
                  </span>
                </div>
                <p className="text-white/45 text-sm">
                  {Array.isArray(evaluation.reasons) && evaluation.reasons.length > 0
                    ? evaluation.reasons.join("; ")
                    : "No blocking reasons."}
                </p>
                <p className="text-white/35 text-xs mt-2">{new Date(evaluation.created_at).toLocaleString()}</p>
              </div>
            ))}
            {evaluations.length === 0 && <p className="text-white/45">No evaluations recorded yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
