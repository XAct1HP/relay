"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Tag,
  XCircle,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { formatListingTitle } from "@/lib/listing-display";
import type { HighRiskSku, SellerTier } from "@/types";

interface ReviewQueueOrder {
  id: string;
  status: string;
  price: number;
  created_at: string;
  relay_tag_required: boolean;
  checkcheck_required: boolean;
  checkcheck_reason: string | null;
  checkcheck_status: string;
  checkcheck_admin_notes: string | null;
  random_audit_required: boolean;
  high_risk_sku_required: boolean;
  legacyAuthFlow: boolean;
  chainOfCustodyStatus: string | null;
  chainOfCustodyAdminReviewRequired: boolean;
  relayTagStatus: string | null;
  seller?: {
    id: string;
    username: string | null;
    display_name: string | null;
    full_name: string | null;
    seller_tier: SellerTier;
  } | null;
  listing?: {
    brand?: string | null;
    model?: string | null;
    sku?: string | null;
    sku_normalized?: string | null;
  } | null;
}

interface AuthRiskPageData {
  settings: {
    id: string;
    tier_3_random_audit_rate_bps: number;
    updated_at: string;
  };
  highRiskSkus: HighRiskSku[];
  reviewQueue: ReviewQueueOrder[];
}

function sellerLabel(order: ReviewQueueOrder) {
  return order.seller?.display_name || order.seller?.full_name || order.seller?.username || "Unknown seller";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatPercentFromBps(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

export default function AdminAuthRiskPage() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const [data, setData] = useState<AuthRiskPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [auditRateBps, setAuditRateBps] = useState(500);
  const [newSku, setNewSku] = useState("");
  const [newSkuReason, setNewSkuReason] = useState("");

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      void loadData();
    } else if (!isLoading) {
      setLoading(false);
    }
  }, [currentUser?.role]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth-risk", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load auth risk settings");
      }

      setData(payload);
      setAuditRateBps(payload.settings?.tier_3_random_audit_rate_bps ?? 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load auth risk settings");
    } finally {
      setLoading(false);
    }
  }

  async function submitAction(url: string, body: Record<string, unknown>, method = "POST") {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Request failed");
      }

      setSuccess("Auth risk settings updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading auth risk settings...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  const reviewCount = data?.reviewQueue.length ?? 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Auth & Risk</h1>
          <p className="text-white/50 max-w-2xl text-sm leading-relaxed">
            Control authentication gates and risk thresholds that protect Relay fulfillment.
            Configure audit sampling rates, flag high-risk SKUs, and review orders waiting on auth or custody approval.
          </p>
        </div>

        <button onClick={() => void loadData()} className="relay-button-secondary inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Status Messages */}
      {(error || success) && (
        <div className={`relay-card p-4 border ${error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
          {error || success}
        </div>
      )}

      {data && (
        <>
          {/* Risk Configuration - Single Consolidated Card */}
          <div className="relay-card p-0 overflow-hidden">
            {/* Audit Rate Section */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-[#7ca6ff]" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Risk Configuration</h2>
              </div>

              <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-3">Tier 3 Random Audit Rate</p>

              <p className="text-white/50 text-sm mb-4">
                This rate is applied once per new Tier 3 order and persisted on the order record. It is not recalculated on page load.
              </p>

              {/* Visual Rate Display */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 mb-4">
                <div className="flex items-end justify-between mb-3">
                  <p className="text-white/40 text-xs uppercase tracking-[0.16em]">Current Rate</p>
                  <p className="text-[#f5f7fb] text-2xl font-semibold">{formatPercentFromBps(data.settings.tier_3_random_audit_rate_bps)}</p>
                </div>
                <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#5f8fff] to-[#7ca6ff] transition-all duration-500"
                    style={{ width: `${Math.min((data.settings.tier_3_random_audit_rate_bps / 10000) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-white/25 text-[10px]">0%</span>
                  <span className="text-white/25 text-[10px]">100%</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-sm text-white/60 mb-2">Rate in basis points</label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={auditRateBps}
                    onChange={(event) => setAuditRateBps(Number(event.target.value))}
                    className="relay-input w-full"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => void submitAction("/api/admin/auth-risk", {
                      action: "set_random_audit_rate",
                      tier3RandomAuditRateBps: auditRateBps,
                    })}
                    disabled={saving}
                    className="relay-button-primary disabled:opacity-50 whitespace-nowrap"
                  >
                    Save Audit Rate
                  </button>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-white/[0.06]" />

            {/* High-Risk SKUs Section */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-5 h-5 text-amber-300" />
                <p className="text-white/40 text-xs uppercase tracking-[0.16em]">High-Risk SKUs</p>
                {data.highRiskSkus.filter((s) => s.is_active).length > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 text-xs font-semibold">
                    {data.highRiskSkus.filter((s) => s.is_active).length} active
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[0.8fr,1.2fr,auto] gap-3 mb-5">
                <input
                  value={newSku}
                  onChange={(event) => setNewSku(event.target.value.toUpperCase())}
                  placeholder="SKU"
                  className="relay-input"
                />
                <input
                  value={newSkuReason}
                  onChange={(event) => setNewSkuReason(event.target.value)}
                  placeholder="Why this SKU is high-risk"
                  className="relay-input"
                />
                <button
                  onClick={() => void submitAction("/api/admin/auth-risk", {
                    action: "add_high_risk_sku",
                    sku: newSku,
                    riskReason: newSkuReason,
                  })}
                  disabled={saving || !newSku.trim() || !newSkuReason.trim()}
                  className="relay-button-primary disabled:opacity-50"
                >
                  Add SKU
                </button>
              </div>

              {data.highRiskSkus.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                  No high-risk SKUs configured yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.highRiskSkus.map((sku) => (
                    <div
                      key={sku.id}
                      className={`group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border transition-colors ${
                        sku.is_active
                          ? "border-red-500/20 bg-red-500/10 text-red-300"
                          : "border-white/5 bg-white/[0.03] text-white/40"
                      }`}
                      title={sku.risk_reason}
                    >
                      <span className="font-semibold">{sku.display_sku || sku.sku_normalized}</span>
                      {!sku.is_active && <span className="text-[10px] uppercase text-white/30">inactive</span>}
                      {sku.is_active && (
                        <button
                          onClick={() => void submitAction(`/api/admin/high-risk-skus/${sku.id}`, { action: "remove" }, "PATCH")}
                          disabled={saving}
                          className="opacity-50 group-hover:opacity-100 hover:text-red-200 transition-opacity disabled:opacity-30"
                          aria-label={`Remove ${sku.display_sku || sku.sku_normalized}`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Fulfillment Review Queue */}
          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Fulfillment Review Queue</h2>
              {reviewCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#5f8fff] text-white text-xs font-bold">
                  {reviewCount}
                </span>
              )}
            </div>

            <div className="space-y-3">
              {data.reviewQueue.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                  No orders are waiting on auth or custody review right now.
                </div>
              ) : (
                data.reviewQueue.map((order) => {
                  const borderColor = order.high_risk_sku_required
                    ? "border-l-red-400"
                    : order.random_audit_required
                      ? "border-l-amber-400"
                      : order.legacyAuthFlow
                        ? "border-l-white/20"
                        : "border-l-[#5f8fff]";

                  return (
                    <div
                      key={order.id}
                      className={`rounded-xl border border-white/5 bg-white/[0.02] border-l-[3px] ${borderColor} overflow-hidden`}
                    >
                      <div className="flex flex-col xl:flex-row xl:items-center gap-4 p-4">
                        {/* Left: Order identity */}
                        <div className="min-w-0 flex-shrink-0 xl:w-[220px]">
                          <p className="text-[#f5f7fb] font-semibold text-sm truncate">
                            Order {order.id.slice(0, 8)}...
                          </p>
                          <p className="text-white/45 text-xs mt-0.5 truncate">{sellerLabel(order)}</p>
                          <p className="text-white/30 text-xs mt-0.5">{new Date(order.created_at).toLocaleString()}</p>
                        </div>

                        {/* Middle: Item details + badges */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[#f5f7fb] text-sm font-medium truncate">
                              {formatListingTitle(order.listing?.brand, order.listing?.model, undefined, "Item")}
                            </p>
                            <span className="text-[#7ca6ff] text-sm font-semibold">{formatMoney(order.price)}</span>
                            <span className="px-2 py-0.5 rounded-full bg-[#5f8fff]/15 text-[#7ca6ff] text-xs font-semibold">
                              {(order.seller?.seller_tier || "tier_1").replace("tier_", "Tier ")}
                            </span>
                            {order.legacyAuthFlow && (
                              <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs font-semibold">
                                legacy
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                              CheckCheck: {order.checkcheck_status || "n/a"}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                              Custody: {order.chainOfCustodyStatus || "missing"}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                              Tag: {order.relayTagStatus || "missing"}
                            </span>
                            {order.random_audit_required && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                                random audit
                              </span>
                            )}
                            {order.high_risk_sku_required && (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                                high-risk SKU
                              </span>
                            )}
                          </div>
                          {order.checkcheck_reason && (
                            <p className="text-white/50 text-xs">CheckCheck reason: {order.checkcheck_reason}</p>
                          )}
                          {order.checkcheck_admin_notes && (
                            <p className="text-white/40 text-xs">Admin note: {order.checkcheck_admin_notes}</p>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex flex-wrap gap-2 xl:flex-col xl:items-end xl:min-w-[180px] flex-shrink-0">
                          {order.checkcheck_required && !order.legacyAuthFlow && (
                            <>
                              <button
                                onClick={() => void submitAction(`/api/admin/orders/${order.id}/checkcheck-review`, { action: "approve" }, "PATCH")}
                                disabled={saving}
                                className="relay-button-primary inline-flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Approve CheckCheck
                              </button>
                              <button
                                onClick={() => void submitAction(`/api/admin/orders/${order.id}/checkcheck-review`, { action: "request_resubmission", reason: "Please upload a clearer or corrected CheckCheck certificate." }, "PATCH")}
                                disabled={saving}
                                className="relay-button-secondary text-sm disabled:opacity-50"
                              >
                                Request Resubmission
                              </button>
                              <button
                                onClick={() => void submitAction(`/api/admin/orders/${order.id}/checkcheck-review`, { action: "reject", reason: "CheckCheck certificate was rejected during admin review." }, "PATCH")}
                                disabled={saving}
                                className="relay-button-danger text-sm disabled:opacity-50"
                              >
                                Reject CheckCheck
                              </button>
                              <button
                                onClick={() => void submitAction(`/api/admin/orders/${order.id}/checkcheck-review`, { action: "force_manual_review", reason: "Manual review forced by admin." }, "PATCH")}
                                disabled={saving}
                                className="relay-button-secondary text-sm disabled:opacity-50"
                              >
                                Force Manual Review
                              </button>
                            </>
                          )}

                          {order.relay_tag_required && !order.legacyAuthFlow && (
                            <>
                              <button
                                onClick={() => void submitAction(`/api/admin/orders/${order.id}/custody-review`, { action: "approve" }, "PATCH")}
                                disabled={saving}
                                className="relay-button-primary inline-flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Approve Custody
                              </button>
                              <button
                                onClick={() => void submitAction(`/api/admin/orders/${order.id}/custody-review`, { action: "reject", reason: "Chain-of-custody evidence did not pass review." }, "PATCH")}
                                disabled={saving}
                                className="relay-button-danger text-sm disabled:opacity-50"
                              >
                                Reject Custody
                              </button>
                              <button
                                onClick={() => void submitAction(`/api/admin/orders/${order.id}/custody-review`, { action: "force_manual_review", reason: "Manual custody review forced by admin." }, "PATCH")}
                                disabled={saving}
                                className="relay-button-secondary text-sm disabled:opacity-50"
                              >
                                Force Custody Manual Review
                              </button>
                            </>
                          )}

                          {order.legacyAuthFlow && (
                            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-white/50 text-xs max-w-[280px]">
                              Legacy order from before the custody decision engine. Uses legacy auth behavior instead of Relay tag gating.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
