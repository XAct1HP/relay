"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Box, CheckCircle2, Clock, Package, RefreshCw, Tag } from "lucide-react";
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
  if (!value) {
    return "N/A";
  }

  return new Date(value).toLocaleDateString();
}

function statusTone(status: RelayTag["status"]) {
  if (status === "assigned_to_seller") {
    return "bg-emerald-500/15 text-emerald-300";
  }

  if (status === "voided" || status === "disputed") {
    return "bg-red-500/15 text-red-300";
  }

  return "bg-[#5f8fff]/15 text-[#7ca6ff]";
}

export default function SellerTagsPage() {
  const { currentUser, isLoading } = useAuth();
  const [data, setData] = useState<SellerTagDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestedQuantity, setRequestedQuantity] = useState(50);
  const [requestReason, setRequestReason] = useState("");

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
    if (!data) {
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/seller/tag-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedQuantity,
          requestReason,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to submit Relay tag request");
      }

      setSuccess("Relay tag request submitted.");
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
      <div className="space-y-4">
        <div className="relay-card p-4 border border-red-500/20 bg-red-500/10 text-red-300">
          {error || "Relay tag dashboard is unavailable right now."}
        </div>
      </div>
    );
  }

  const pendingRequests = data.requests.filter((request) => request.status === "pending" || request.status === "approved");

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">SELLER HQ</p>
          <h1 className="relay-title">Relay Tags</h1>
          <p className="text-white/50 max-w-2xl">
            Manage your assigned Relay security tags, request replenishment, and keep fulfillment moving for tagged orders.
          </p>
        </div>

        <button
          onClick={() => void loadData()}
          className="relay-button-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {(error || success) && (
        <div className={`relay-card p-4 border ${error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="relay-card p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.18em] mb-2">Current Tier</p>
          <div className="inline-flex px-3 py-2 rounded-xl border border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#7ca6ff] text-lg font-semibold">
            {formatTierLabel(data.profile.seller_tier)}
          </div>
        </div>
        <div className="relay-card p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.18em] mb-2">Available Tags</p>
          <p className="text-3xl font-semibold text-[#f5f7fb]">{data.counts.available}</p>
        </div>
        <div className="relay-card p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.18em] mb-2">Used Tags</p>
          <p className="text-3xl font-semibold text-[#f5f7fb]">{data.counts.used}</p>
        </div>
        <div className="relay-card p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.18em] mb-2">Open Requests</p>
          <p className="text-3xl font-semibold text-[#f5f7fb]">{pendingRequests.length}</p>
        </div>
      </div>

      <div className={`relay-card p-5 border ${data.counts.needsMore ? "border-amber-500/30 bg-amber-500/5" : "border-[#5f8fff]/20 bg-[#5f8fff]/5"}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Tier Policy</h2>
            </div>
            <p className="text-white/60 text-sm">{data.policy.description}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-white/5 text-white/70">
                Default quantity: {data.policy.defaultRequestQuantity}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 text-white/70">
                Mode: {data.policy.requestMode.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {data.counts.needsMore && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-300 text-sm font-medium">
              <AlertCircle className="w-4 h-4" />
              Inventory is running low
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-6">
        <div className="space-y-6">
          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Available Tags</h2>
            </div>

            {data.availableTags.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                No assigned tags available right now.
              </div>
            ) : (
              <div className="space-y-3">
                {data.availableTags.slice(0, 20).map((tag) => (
                  <div key={tag.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[#f5f7fb] font-semibold">{tag.tag_serial_number}</p>
                      <p className="text-white/45 text-sm">
                        Barcode: {tag.barcode_value || "None"} · Assigned {formatDate(tag.assigned_to_seller_at)}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusTone(tag.status)}`}>
                      {tag.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Used Tags</h2>
            </div>

            {data.usedTags.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                Used tags will appear here after they are bound to orders.
              </div>
            ) : (
              <div className="space-y-3">
                {data.usedTags.slice(0, 20).map((tag) => (
                  <div key={tag.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[#f5f7fb] font-semibold">{tag.tag_serial_number}</p>
                      <p className="text-white/45 text-sm">
                        Order: {tag.assigned_order_id?.slice(0, 8).toUpperCase() || "N/A"} · Verification {tag.photo_verification_status.replace(/_/g, " ")}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusTone(tag.status)}`}>
                      {tag.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Box className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Request More Tags</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-2">Requested quantity</label>
                <input
                  type="number"
                  min={1}
                  value={requestedQuantity}
                  onChange={(event) => setRequestedQuantity(Number(event.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] focus:outline-none focus:border-[#5f8fff]"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-2">Reason</label>
                <textarea
                  value={requestReason}
                  onChange={(event) => setRequestReason(event.target.value)}
                  rows={4}
                  placeholder="Share anything admin should know about this request."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] placeholder-white/30 focus:outline-none focus:border-[#5f8fff]"
                />
              </div>

              <button
                onClick={handleRequestTags}
                disabled={submitting || requestedQuantity <= 0}
                className="relay-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting..." : "Submit Tag Request"}
              </button>
            </div>
          </div>

          <div className="relay-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Recent Requests</h2>
            </div>

            {data.requests.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                You have not submitted any Relay tag requests yet.
              </div>
            ) : (
              <div className="space-y-3">
                {data.requests.slice(0, 10).map((request) => (
                  <div key={request.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-[#f5f7fb] font-semibold">{request.requested_quantity} tags</p>
                        <p className="text-white/45 text-sm">
                          {request.policy_type.replace(/_/g, " ")} · {formatDate(request.created_at)}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        request.status === "fulfilled"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : request.status === "rejected"
                            ? "bg-red-500/15 text-red-300"
                            : "bg-[#5f8fff]/15 text-[#7ca6ff]"
                      }`}>
                        {request.status}
                      </span>
                    </div>
                    {request.request_reason && (
                      <p className="text-white/60 text-sm mb-2">{request.request_reason}</p>
                    )}
                    {request.admin_notes && (
                      <p className="text-white/40 text-xs">Admin note: {request.admin_notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relay-card p-5 border border-[#5f8fff]/20 bg-[#5f8fff]/5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-2">Fulfillment Reminder</h2>
            <p className="text-white/60 text-sm mb-4">
              Tagged orders stay blocked from label generation until the Relay tag is bound, the required seller photos are uploaded, and any required CheckCheck or admin review is complete.
            </p>
            <Link href="/orders" className="text-[#7ca6ff] text-sm font-medium hover:text-[#9ab8ff] transition-colors">
              Review open orders
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
