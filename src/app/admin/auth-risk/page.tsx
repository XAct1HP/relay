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

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Auth & Risk</h1>
          <p className="text-white/50 max-w-2xl">
            Manage Tier 3 random audits, high-risk SKUs, and order auth reviews that block fulfillment.
          </p>
        </div>

        <button onClick={() => void loadData()} className="relay-button-secondary inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {(error || success) && (
        <div className={`relay-card p-4 border ${error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
          {error || success}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[0.85fr,1.15fr] gap-6">
            <div className="relay-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-[#7ca6ff]" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Tier 3 Random Audit Rate</h2>
              </div>

              <p className="text-white/50 text-sm mb-4">
                This rate is applied once per new Tier 3 order and persisted on the order record. It is not recalculated on page load.
              </p>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 mb-4">
                <p className="text-white/40 text-xs uppercase tracking-[0.16em] mb-1">Current Rate</p>
                <p className="text-[#f5f7fb] text-2xl font-semibold">{formatPercentFromBps(data.settings.tier_3_random_audit_rate_bps)}</p>
              </div>

              <label className="block text-sm text-white/60 mb-2">Rate in basis points</label>
              <input
                type="number"
                min={0}
                max={10000}
                value={auditRateBps}
                onChange={(event) => setAuditRateBps(Number(event.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] focus:outline-none focus:border-[#5f8fff] mb-4"
              />

              <button
                onClick={() => void submitAction("/api/admin/auth-risk", {
                  action: "set_random_audit_rate",
                  tier3RandomAuditRateBps: auditRateBps,
                })}
                disabled={saving}
                className="relay-button-primary w-full disabled:opacity-50"
              >
                Save Audit Rate
              </button>
            </div>

            <div className="relay-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-5 h-5 text-amber-300" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">High-Risk SKUs</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[0.8fr,1.2fr,auto] gap-3 mb-5">
                <input
                  value={newSku}
                  onChange={(event) => setNewSku(event.target.value.toUpperCase())}
                  placeholder="SKU"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] placeholder-white/30 focus:outline-none focus:border-[#5f8fff]"
                />
                <input
                  value={newSkuReason}
                  onChange={(event) => setNewSkuReason(event.target.value)}
                  placeholder="Why this SKU is high-risk"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] placeholder-white/30 focus:outline-none focus:border-[#5f8fff]"
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

              <div className="space-y-3">
                {data.highRiskSkus.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                    No high-risk SKUs configured yet.
                  </div>
                ) : (
                  data.highRiskSkus.map((sku) => (
                    <div key={sku.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="text-[#f5f7fb] font-semibold">{sku.display_sku || sku.sku_normalized}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sku.is_active ? "bg-red-500/15 text-red-300" : "bg-white/5 text-white/50"}`}>
                            {sku.is_active ? "active" : "inactive"}
                          </span>
                        </div>
                        <p className="text-white/60 text-sm">{sku.risk_reason}</p>
                      </div>
                      <button
                        onClick={() => void submitAction(`/api/admin/high-risk-skus/${sku.id}`, { action: "remove" }, "PATCH")}
                        disabled={saving || !sku.is_active}
                        className="relay-button-danger disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Fulfillment Review Queue</h2>
            </div>

            <div className="space-y-4">
              {data.reviewQueue.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                  No orders are waiting on auth or custody review right now.
                </div>
              ) : (
                data.reviewQueue.map((order) => (
                  <div key={order.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[#f5f7fb] font-semibold">
                            {(order.listing?.brand || "Unknown")} {(order.listing?.model || "Order")}
                          </p>
                          <span className="px-2 py-0.5 rounded-full bg-[#5f8fff]/15 text-[#7ca6ff] text-xs font-semibold">
                            {(order.seller?.seller_tier || "tier_1").replace("tier_", "Tier ")}
                          </span>
                          {order.legacyAuthFlow && (
                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs font-semibold">
                              legacy
                            </span>
                          )}
                        </div>
                        <p className="text-white/45 text-sm">
                          {sellerLabel(order)} · {formatMoney(order.price)} · {new Date(order.created_at).toLocaleString()}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60">
                            CheckCheck: {order.checkcheck_status || "n/a"}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60">
                            Custody: {order.chainOfCustodyStatus || "missing"}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/60">
                            Relay tag: {order.relayTagStatus || "missing"}
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
                          <p className="text-white/60 text-sm">CheckCheck reason: {order.checkcheck_reason}</p>
                        )}
                        {order.checkcheck_admin_notes && (
                          <p className="text-white/45 text-sm">Admin note: {order.checkcheck_admin_notes}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 xl:min-w-[360px]">
                        {order.checkcheck_required && !order.legacyAuthFlow && (
                          <>
                            <button
                              onClick={() => void submitAction(`/api/admin/orders/${order.id}/checkcheck-review`, { action: "approve" }, "PATCH")}
                              disabled={saving}
                              className="relay-button-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Approve CheckCheck
                            </button>
                            <button
                              onClick={() => void submitAction(`/api/admin/orders/${order.id}/checkcheck-review`, { action: "request_resubmission", reason: "Please upload a clearer or corrected CheckCheck certificate." }, "PATCH")}
                              disabled={saving}
                              className="relay-button-secondary disabled:opacity-50"
                            >
                              Request Resubmission
                            </button>
                            <button
                              onClick={() => void submitAction(`/api/admin/orders/${order.id}/checkcheck-review`, { action: "reject", reason: "CheckCheck certificate was rejected during admin review." }, "PATCH")}
                              disabled={saving}
                              className="relay-button-danger disabled:opacity-50"
                            >
                              Reject CheckCheck
                            </button>
                            <button
                              onClick={() => void submitAction(`/api/admin/orders/${order.id}/checkcheck-review`, { action: "force_manual_review", reason: "Manual review forced by admin." }, "PATCH")}
                              disabled={saving}
                              className="relay-button-secondary disabled:opacity-50"
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
                              className="relay-button-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Approve Custody
                            </button>
                            <button
                              onClick={() => void submitAction(`/api/admin/orders/${order.id}/custody-review`, { action: "reject", reason: "Chain-of-custody evidence did not pass review." }, "PATCH")}
                              disabled={saving}
                              className="relay-button-danger disabled:opacity-50"
                            >
                              Reject Custody
                            </button>
                            <button
                              onClick={() => void submitAction(`/api/admin/orders/${order.id}/custody-review`, { action: "force_manual_review", reason: "Manual custody review forced by admin." }, "PATCH")}
                              disabled={saving}
                              className="relay-button-secondary disabled:opacity-50 md:col-span-2"
                            >
                              Force Custody Manual Review
                            </button>
                          </>
                        )}

                        {order.legacyAuthFlow && (
                          <div className="md:col-span-2 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-white/50 text-sm">
                            This is a legacy order from before the custody decision engine. It keeps legacy auth behavior instead of the new Relay tag gating.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
