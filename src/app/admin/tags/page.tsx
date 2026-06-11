"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, RefreshCw, Search, Shield, Tag, XCircle } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import type { RelayTag, SellerTagRequest, SellerTier } from "@/types";

interface AdminSellerSummary {
  id: string;
  username: string | null;
  display_name: string | null;
  full_name: string | null;
  seller_tier: SellerTier;
}

interface AdminTagDashboardData {
  tags: Array<
    RelayTag & {
      seller?: AdminSellerSummary | null;
      order?: { id: string } | null;
    }
  >;
  sellers: AdminSellerSummary[];
  requests: Array<
    SellerTagRequest & {
      seller?: AdminSellerSummary | null;
    }
  >;
  counts: {
    unused: number;
    assigned: number;
    used: number;
    disputed: number;
    voided: number;
  };
}

function sellerLabel(seller?: AdminSellerSummary | null) {
  return seller?.display_name || seller?.full_name || seller?.username || "Unassigned";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "N/A";
  }

  return new Date(value).toLocaleDateString();
}

export default function AdminTagsPage() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const [data, setData] = useState<AdminTagDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [singleSerial, setSingleSerial] = useState("");
  const [singleBarcode, setSingleBarcode] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [bulkInput, setBulkInput] = useState("");

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
      const response = await fetch(`/api/admin/tags?q=${encodeURIComponent(search)}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load Relay tag inventory");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Relay tag inventory");
    } finally {
      setLoading(false);
    }
  }

  async function submitTagAction(url: string, body: Record<string, unknown>, method = "PATCH") {
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
        throw new Error(payload.error || "Relay tag action failed");
      }

      setSuccess("Relay tag inventory updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Relay tag action failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSingleTag() {
    if (!singleSerial.trim()) {
      setError("Tag serial is required.");
      return;
    }

    await submitTagAction("/api/admin/tags", {
      action: "create",
      serial: singleSerial,
      barcode: singleBarcode,
      batchLabel,
      assignSellerId: selectedSellerId || null,
    }, "POST");

    setSingleSerial("");
    setSingleBarcode("");
  }

  async function handleBulkImport() {
    if (!bulkInput.trim()) {
      setError("Paste at least one serial or CSV row to import.");
      return;
    }

    await submitTagAction("/api/admin/tags", {
      action: "import",
      rawText: bulkInput,
      batchLabel,
      assignSellerId: selectedSellerId || null,
    }, "POST");

    setBulkInput("");
  }

  async function handleTagRequestUpdate(requestId: string, status: "approved" | "fulfilled" | "rejected") {
    await submitTagAction(`/api/admin/tag-requests/${requestId}`, { status });
  }

  async function handleCustodyReview(orderId: string, approve: boolean) {
    await submitTagAction(`/api/admin/orders/${orderId}/custody-review`, {
      approve,
      reason: approve ? null : "Relay tag evidence did not match review expectations.",
    });
  }

  const filteredTags = useMemo(() => {
    if (!data) {
      return [];
    }

    const query = search.trim().toLowerCase();
    if (!query) {
      return data.tags;
    }

    return data.tags.filter((tag) =>
      [
        tag.tag_serial_number,
        tag.barcode_value,
        tag.status,
        tag.order?.id,
        tag.source_batch_label,
        sellerLabel(tag.seller),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [data, search]);

  const reviewQueue = filteredTags.filter(
    (tag) => tag.photo_verification_status === "admin_review" && tag.assigned_order_id
  );

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading Relay tag inventory...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Relay Tags</h1>
          <p className="text-white/50 max-w-2xl">
            Import security tags, assign inventory to sellers, review custody submissions, and manage replenishment requests.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void loadData()}
            className="relay-button-secondary inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {(error || success) && (
        <div className={`relay-card p-4 border ${error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
          {error || success}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <Metric label="Unused" value={data.counts.unused} />
            <Metric label="Assigned" value={data.counts.assigned} />
            <Metric label="Used" value={data.counts.used} />
            <Metric label="Disputed" value={data.counts.disputed} tone="red" />
            <Metric label="Voided" value={data.counts.voided} tone="amber" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-6">
            <div className="relay-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#7ca6ff]" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Create Or Import Tags</h2>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-2">Assign seller</label>
                <select
                  value={selectedSellerId}
                  onChange={(event) => setSelectedSellerId(event.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] focus:outline-none focus:border-[#5f8fff]"
                >
                  <option value="">No seller assigned</option>
                  {data.sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {sellerLabel(seller)} · {seller.seller_tier.replace("tier_", "Tier ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-2">Batch label</label>
                <input
                  value={batchLabel}
                  onChange={(event) => setBatchLabel(event.target.value)}
                  placeholder="June 2026 batch"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] placeholder-white/30 focus:outline-none focus:border-[#5f8fff]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-3">
                <input
                  value={singleSerial}
                  onChange={(event) => setSingleSerial(event.target.value)}
                  placeholder="Tag serial"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] placeholder-white/30 focus:outline-none focus:border-[#5f8fff]"
                />
                <input
                  value={singleBarcode}
                  onChange={(event) => setSingleBarcode(event.target.value)}
                  placeholder="Barcode value"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] placeholder-white/30 focus:outline-none focus:border-[#5f8fff]"
                />
                <button
                  onClick={handleCreateSingleTag}
                  disabled={saving}
                  className="relay-button-primary whitespace-nowrap disabled:opacity-50"
                >
                  Create Tag
                </button>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-2">Bulk import</label>
                <textarea
                  value={bulkInput}
                  onChange={(event) => setBulkInput(event.target.value)}
                  rows={8}
                  placeholder={"SERIAL001,BARCODE001\nSERIAL002,BARCODE002\nSERIAL003"}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#f5f7fb] placeholder-white/30 focus:outline-none focus:border-[#5f8fff]"
                />
                <p className="text-white/35 text-xs mt-2">
                  Accepts newline-delimited serials or CSV rows with serial and optional barcode.
                </p>
              </div>

              <button
                onClick={handleBulkImport}
                disabled={saving}
                className="relay-button-secondary w-full disabled:opacity-50"
              >
                Import Batch
              </button>
            </div>

            <div className="relay-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#7ca6ff]" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Review Queue</h2>
              </div>

              {reviewQueue.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                  No Relay tag submissions are waiting on admin review.
                </div>
              ) : (
                <div className="space-y-3">
                  {reviewQueue.slice(0, 10).map((tag) => (
                    <div key={tag.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-[#f5f7fb] font-semibold">{tag.tag_serial_number}</p>
                          <p className="text-white/45 text-sm">
                            Seller: {sellerLabel(tag.seller)} · Order {tag.order?.id?.slice(0, 8).toUpperCase()}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300">
                          manual review
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          onClick={() => tag.assigned_order_id && handleCustodyReview(tag.assigned_order_id, true)}
                          disabled={saving || !tag.assigned_order_id}
                          className="relay-button-primary inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => tag.assigned_order_id && handleCustodyReview(tag.assigned_order_id, false)}
                          disabled={saving || !tag.assigned_order_id}
                          className="relay-button-danger inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr,0.7fr] gap-6">
            <div className="relay-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#f5f7fb]">Inventory</h2>
                  <p className="text-white/45 text-sm">Search by serial, barcode, seller, order, or batch label.</p>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search tags"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-[#f5f7fb] placeholder-white/30 focus:outline-none focus:border-[#5f8fff]"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {filteredTags.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                    No Relay tags matched this search.
                  </div>
                ) : (
                  filteredTags.slice(0, 100).map((tag) => (
                    <div key={tag.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="text-[#f5f7fb] font-semibold">{tag.tag_serial_number}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              tag.status === "voided"
                                ? "bg-red-500/15 text-red-300"
                                : tag.status === "assigned_to_seller"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-[#5f8fff]/15 text-[#7ca6ff]"
                            }`}>
                              {tag.status.replace(/_/g, " ")}
                            </span>
                            {tag.photo_verification_status === "admin_review" && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300">
                                admin review
                              </span>
                            )}
                          </div>
                          <p className="text-white/45 text-sm">
                            Barcode: {tag.barcode_value || "None"} · Seller: {sellerLabel(tag.seller)} · Order {tag.order?.id?.slice(0, 8).toUpperCase() || "N/A"}
                          </p>
                          <p className="text-white/30 text-xs mt-1">
                            Batch {tag.source_batch_label || "N/A"} · Imported {formatDate(tag.imported_at)} · Bound {formatDate(tag.bound_to_order_at)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <select
                            value={tag.assigned_seller_id || ""}
                            onChange={(event) => {
                              const sellerId = event.target.value;
                              if (!sellerId) {
                                void submitTagAction(`/api/admin/tags/${tag.id}`, { action: "unassign" });
                                return;
                              }

                              void submitTagAction(`/api/admin/tags/${tag.id}`, { action: "assign", sellerId });
                            }}
                            disabled={saving || tag.status === "voided"}
                            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-[#f5f7fb] focus:outline-none focus:border-[#5f8fff]"
                          >
                            <option value="">Unassigned</option>
                            {data.sellers.map((seller) => (
                              <option key={seller.id} value={seller.id}>
                                {sellerLabel(seller)}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => void submitTagAction(`/api/admin/tags/${tag.id}`, { action: "void", reason: "Voided by admin inventory control" })}
                            disabled={saving || tag.status === "voided"}
                            className="relay-button-danger disabled:opacity-50"
                          >
                            Void
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="relay-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-[#7ca6ff]" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Seller Requests</h2>
              </div>

              {data.requests.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                  No seller tag requests are pending.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.requests.slice(0, 20).map((request) => (
                    <div key={request.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-[#f5f7fb] font-semibold">{sellerLabel(request.seller)}</p>
                          <p className="text-white/45 text-sm">
                            {request.requested_quantity} tags · {request.policy_type.replace(/_/g, " ")}
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
                      <p className="text-white/35 text-xs mb-3">
                        {formatDate(request.created_at)} · Tier {request.seller_tier_snapshot.replace("tier_", "")}
                      </p>
                      {request.request_reason && (
                        <p className="text-white/60 text-sm mb-3">{request.request_reason}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void handleTagRequestUpdate(request.id, "approved")}
                          disabled={saving || request.status === "approved" || request.status === "fulfilled"}
                          className="relay-button-secondary disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => void handleTagRequestUpdate(request.id, "fulfilled")}
                          disabled={saving || request.status === "fulfilled"}
                          className="relay-button-primary disabled:opacity-50"
                        >
                          Fulfill
                        </button>
                        <button
                          onClick={() => void handleTagRequestUpdate(request.id, "rejected")}
                          disabled={saving || request.status === "rejected" || request.status === "fulfilled"}
                          className="relay-button-danger disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  tone?: "blue" | "amber" | "red";
}) {
  const tones = {
    blue: "border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#7ca6ff]",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
  };

  return (
    <div className="relay-card p-5">
      <p className="text-white/50 text-xs uppercase tracking-[0.18em] mb-2">{label}</p>
      <div className={`inline-flex px-3 py-2 rounded-xl border text-lg font-semibold ${tones[tone]}`}>
        {value}
      </div>
    </div>
  );
}
