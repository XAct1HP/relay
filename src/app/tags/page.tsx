"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Box, CheckCircle2, Clock, Package, RefreshCw, Tag, ChevronDown, ChevronUp } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import type { RelayTag, SellerTagRequest, SellerTier } from "@/types";

interface SellerTagPolicy {
  sellerTier: SellerTier;
  requestMode: "welcome_pack" | "on_demand_request" | "bundle_250" | "monthly_replenishment";
  defaultRequestQuantity: number;
  description: string;
}

interface SellerTagDashboardData {
  profile: {
    id: string;
    seller_tier: SellerTier;
    seller_application_status: string | null;
    is_verified_seller: boolean | null;
  };
  policy: SellerTagPolicy;
  counts: {
    available: number;
    used: number;
    needsMore: boolean;
  };
  availableTags: RelayTag[];
  usedTags: RelayTag[];
  requests: SellerTagRequest[];
}

function formatTierLabel(tier: SellerTier) {
  return tier.replace("tier_", "Tier ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString();
}

function statusTone(status: RelayTag["status"]) {
  if (status === "assigned_to_seller") return "bg-emerald-500/15 text-emerald-300";
  if (status === "voided" || status === "disputed") return "bg-red-500/15 text-red-300";
  return "bg-[#5f8fff]/15 text-[#7ca6ff]";
}

function requestStatusTone(status: string) {
  if (status === "fulfilled") return "bg-emerald-500/15 text-emerald-300";
  if (status === "rejected") return "bg-red-500/15 text-red-300";
  return "bg-[#5f8fff]/15 text-[#7ca6ff]";
}

type TabId = "inventory" | "request" | "history";

export default function SellerTagsPage() {
  const { currentUser, isLoading } = useAuth();
  const [data, setData] = useState<SellerTagDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestedQuantity, setRequestedQuantity] = useState(50);
  const [requestReason, setRequestReason] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  const [showUsed, setShowUsed] = useState(false);

  useEffect(() => {
    if (currentUser?.role === "seller") {
      void loadData();
    } else if (!isLoading) {
      setLoading(false);
    }
  }, [currentUser?.role]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/seller/tags", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load Relay tag dashboard");
      }

      setData(payload);
      setRequestedQuantity(payload.policy?.defaultRequestQuantity || 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Relay tag dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestTags() {
    if (!data) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/seller/tag-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedQuantity, requestReason }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to submit Relay tag request");
      }

      setSuccess("Tag request submitted successfully.");
      setRequestReason("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit Relay tag request");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading Relay tags...</div>;
  }

  if (!currentUser || currentUser.role !== "seller") {
    return null;
  }

  if (!data) {
    return (
      <div className="relay-card p-4 border border-red-500/20 bg-red-500/10 text-red-300">
        {error || "Relay tag dashboard is unavailable right now."}
      </div>
    );
  }

  const pendingRequests = data.requests.filter((r) => r.status === "pending" || r.status === "approved");
  const tabs: { id: TabId; label: string }[] = [
    { id: "inventory", label: "Inventory" },
    { id: "request", label: "Request Tags" },
    { id: "history", label: `Requests (${data.requests.length})` },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">SELLER HQ</p>
          <h1 className="relay-title">Relay Tags</h1>
          <p className="text-white/50 max-w-2xl text-sm sm:text-base">
            Security tags for chain-of-custody verification on your orders.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="relay-button-secondary inline-flex items-center gap-2 self-start"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {(error || success) && (
        <div className={`relay-card p-4 border ${error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
          {error || success}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="relay-card p-4 sm:p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">Available</p>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-300">{data.counts.available}</p>
          {data.counts.needsMore && (
            <p className="text-amber-300 text-xs mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Running low
            </p>
          )}
        </div>
        <div className="relay-card p-4 sm:p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">Used</p>
          <p className="text-2xl sm:text-3xl font-bold text-[#f5f7fb]">{data.counts.used}</p>
        </div>
        <div className="relay-card p-4 sm:p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">Pending Requests</p>
          <p className="text-2xl sm:text-3xl font-bold text-[#7ca6ff]">{pendingRequests.length}</p>
        </div>
        <div className="relay-card p-4 sm:p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">Tier</p>
          <div className="inline-flex px-3 py-1.5 rounded-xl border border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#7ca6ff] text-lg font-semibold">
            {formatTierLabel(data.profile.seller_tier)}
          </div>
        </div>
      </div>

      {/* Tier policy banner - compact */}
      <div className="relay-card p-4 border border-white/5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-2 text-white/50">
            <Tag className="w-4 h-4 text-[#7ca6ff]" />
            <span className="font-medium text-white/70">Tier Policy</span>
          </div>
          <span className="text-white/50">{data.policy.description}</span>
          <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/50 text-xs">
            {data.policy.requestMode.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-[#5f8fff] text-[#f5f7fb]"
                : "border-transparent text-white/40 hover:text-white/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          {/* Available tags */}
          <div className="relay-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <h2 className="font-semibold text-[#f5f7fb]">Available Tags</h2>
              <span className="text-white/40 text-sm ml-1">({data.availableTags.length})</span>
            </div>

            {data.availableTags.length === 0 ? (
              <div className="p-8 text-center text-white/40 text-sm">
                No tags available. Request more below.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {data.availableTags.slice(0, 10).map((tag) => (
                  <div key={tag.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-[#f5f7fb] font-medium text-sm">{tag.tag_serial_number}</p>
                      <p className="text-white/40 text-xs">
                        {tag.barcode_value ? `Barcode ${tag.barcode_value}` : "No barcode"} · Assigned {formatDate(tag.assigned_to_seller_at)}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${statusTone(tag.status)}`}>
                      {tag.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
                {data.availableTags.length > 10 && (
                  <div className="px-5 py-3 text-center text-white/40 text-xs">
                    +{data.availableTags.length - 10} more tags
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Used tags - collapsible */}
          <div className="relay-card overflow-hidden">
            <button
              onClick={() => setShowUsed(!showUsed)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#7ca6ff]" />
                <h2 className="font-semibold text-[#f5f7fb]">Used Tags</h2>
                <span className="text-white/40 text-sm ml-1">({data.usedTags.length})</span>
              </div>
              {showUsed ? (
                <ChevronUp className="w-4 h-4 text-white/40" />
              ) : (
                <ChevronDown className="w-4 h-4 text-white/40" />
              )}
            </button>

            {showUsed && (
              <>
                {data.usedTags.length === 0 ? (
                  <div className="px-5 pb-4 text-white/40 text-sm">
                    Used tags will appear here after they are bound to orders.
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 border-t border-white/5">
                    {data.usedTags.slice(0, 10).map((tag) => (
                      <div key={tag.id} className="px-5 py-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-[#f5f7fb] font-medium text-sm">{tag.tag_serial_number}</p>
                          <p className="text-white/40 text-xs">
                            Order {tag.assigned_order_id?.slice(0, 8).toUpperCase() || "N/A"} · Verification {tag.photo_verification_status.replace(/_/g, " ")}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${statusTone(tag.status)}`}>
                          {tag.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                    {data.usedTags.length > 10 && (
                      <div className="px-5 py-3 text-center text-white/40 text-xs">
                        +{data.usedTags.length - 10} more tags
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Fulfillment reminder */}
          <div className="relay-card p-4 border border-white/5">
            <p className="text-white/50 text-sm">
              Tagged orders stay blocked from label generation until the tag is bound, seller photos are uploaded, and any required review is complete.{" "}
              <Link href="/orders" className="text-[#7ca6ff] hover:text-[#9ab8ff] transition-colors font-medium">
                Review open orders
              </Link>
            </p>
          </div>
        </div>
      )}

      {activeTab === "request" && (
        <div className="max-w-lg">
          <div className="relay-card p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Box className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Request More Tags</h2>
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">Quantity</label>
              <input
                type="number"
                min={1}
                value={requestedQuantity}
                onChange={(e) => setRequestedQuantity(Number(e.target.value))}
                className="relay-input w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">Reason (optional)</label>
              <textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                rows={3}
                placeholder="Any context for the admin reviewing this request."
                className="relay-input w-full resize-none"
              />
            </div>

            <button
              onClick={handleRequestTags}
              disabled={submitting || requestedQuantity <= 0}
              className="relay-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="relay-card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#7ca6ff]" />
            <h2 className="font-semibold text-[#f5f7fb]">Request History</h2>
          </div>

          {data.requests.length === 0 ? (
            <div className="p-8 text-center text-white/40 text-sm">
              No tag requests submitted yet.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {data.requests.map((request) => (
                <div key={request.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <p className="text-[#f5f7fb] font-medium text-sm">
                        {request.requested_quantity} tags
                        <span className="text-white/40 font-normal ml-2">
                          {request.policy_type.replace(/_/g, " ")}
                        </span>
                      </p>
                      <p className="text-white/40 text-xs mt-0.5">{formatDate(request.created_at)}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${requestStatusTone(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                  {request.request_reason && (
                    <p className="text-white/50 text-sm mt-2">{request.request_reason}</p>
                  )}
                  {request.admin_notes && (
                    <p className="text-white/40 text-xs mt-1.5 italic">Admin: {request.admin_notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
