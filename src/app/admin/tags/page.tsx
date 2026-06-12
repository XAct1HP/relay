"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  GripVertical,
  Package,
  RefreshCw,
  Search,
  Shield,
  Tag,
  Truck,
  XCircle,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { formatBundlePrice } from "@/lib/tag-bundles";
import type { RelayTag, TagOrder, SellerTier } from "@/types";

interface AdminSellerSummary {
  id: string;
  username: string | null;
  display_name: string | null;
  full_name: string | null;
  email?: string | null;
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
  requests: any[];
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
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString();
}

function orderStatusTone(status: string) {
  if (status === "fulfilled") return "bg-emerald-500/15 text-emerald-300";
  if (status === "shipped") return "bg-[#5f8fff]/15 text-[#7ca6ff]";
  if (status === "processing") return "bg-amber-500/15 text-amber-300";
  return "bg-white/10 text-white/60";
}

function Metric({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  tone?: "blue" | "amber" | "red" | "green";
}) {
  const tones = {
    blue: "border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#7ca6ff]",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
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

export default function AdminTagsPage() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const [data, setData] = useState<AdminTagDashboardData | null>(null);
  const [tagOrders, setTagOrders] = useState<(TagOrder & { seller?: AdminSellerSummary | null })[]>([]);
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

  // Fulfillment form state
  const [fulfillOrderId, setFulfillOrderId] = useState<string | null>(null);
  const [fulfillTracking, setFulfillTracking] = useState("");
  const [fulfillCarrier, setFulfillCarrier] = useState("");
  const [fulfillNotes, setFulfillNotes] = useState("");

  // Drag-and-drop from orders to import
  const [importDropHighlight, setImportDropHighlight] = useState(false);
  const [linkedOrder, setLinkedOrder] = useState<(TagOrder & { seller?: AdminSellerSummary | null }) | null>(null);
  const importRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      void loadData();
      void loadTagOrders();
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
        throw new Error(payload.error || "Failed to load tag inventory");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tag inventory");
    } finally {
      setLoading(false);
    }
  }

  async function loadTagOrders() {
    try {
      const response = await fetch("/api/admin/tags/orders", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setTagOrders(payload.orders || []);
      }
    } catch {
      // Non-critical
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
        throw new Error(payload.error || "Tag action failed");
      }

      setSuccess("Tag inventory updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tag action failed");
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

  async function handleCustodyReview(orderId: string, approve: boolean) {
    await submitTagAction(`/api/admin/orders/${orderId}/custody-review`, {
      approve,
      reason: approve ? null : "Relay tag evidence did not match review expectations.",
    });
  }

  async function handleOrderStatusUpdate(orderId: string, status: string) {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const body: Record<string, unknown> = { status };
      if (status === "shipped") {
        body.trackingNumber = fulfillTracking;
        body.carrier = fulfillCarrier;
      }
      if (fulfillNotes) {
        body.adminNotes = fulfillNotes;
      }

      const response = await fetch(`/api/admin/tags/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update order");
      }

      setSuccess("Tag order updated.");
      setFulfillOrderId(null);
      setFulfillTracking("");
      setFulfillCarrier("");
      setFulfillNotes("");
      await loadTagOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setSaving(false);
    }
  }

  const filteredTags = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    if (!query) return data.tags;

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

  const actionableOrders = tagOrders.filter(
    (o) => o.status === "paid" || o.status === "processing" || o.status === "shipped"
  );

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading tag inventory...</div>;
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
            Import tags, assign to sellers, fulfill purchase orders, and review custody submissions.
          </p>
        </div>

        <button
          onClick={() => { void loadData(); void loadTagOrders(); }}
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

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            <Metric label="Unused" value={data.counts.unused} />
            <Metric label="Assigned" value={data.counts.assigned} tone="green" />
            <Metric label="Used" value={data.counts.used} />
            <Metric label="Disputed" value={data.counts.disputed} tone="red" />
            <Metric label="Voided" value={data.counts.voided} tone="amber" />
          </div>

          {/* Tag Orders Fulfillment */}
          {actionableOrders.length > 0 && (
            <div className="relay-card overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-semibold text-[#f5f7fb]">Tag Orders to Fulfill</h2>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold ml-2">
                    {actionableOrders.length}
                  </span>
                </div>
                <p className="text-white/30 text-xs hidden sm:block">Drag an order to Import Tags to link it</p>
              </div>

              <div className="divide-y divide-white/5">
                {actionableOrders.map((order) => (
                  <div
                    key={order.id}
                    className="px-5 py-4 cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/relay-order", JSON.stringify(order));
                      e.dataTransfer.effectAllowed = "link";
                    }}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <GripVertical className="w-4 h-4 text-white/20 flex-shrink-0 hidden sm:block" />
                          <p className="text-[#f5f7fb] font-semibold">
                            {order.bundle_name} Pack · {order.quantity} tags
                          </p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${orderStatusTone(order.status)}`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-white/45 text-sm">
                          {sellerLabel(order.seller as any)} · {formatBundlePrice(order.price_cents)} · Paid {formatDate(order.paid_at)}
                        </p>
                        {order.shipping_tracking_number && (
                          <p className="text-[#7ca6ff] text-xs flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5" />
                            {order.shipping_carrier ? `${order.shipping_carrier}: ` : ""}
                            {order.shipping_tracking_number}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 flex-shrink-0">
                        {order.status === "paid" && (
                          <button
                            onClick={() => handleOrderStatusUpdate(order.id, "processing")}
                            disabled={saving}
                            className="relay-button-secondary text-sm disabled:opacity-50"
                          >
                            Start Processing
                          </button>
                        )}
                        {(order.status === "paid" || order.status === "processing") && (
                          <button
                            onClick={() => {
                              setFulfillOrderId(fulfillOrderId === order.id ? null : order.id);
                              setFulfillTracking(order.shipping_tracking_number || "");
                              setFulfillCarrier(order.shipping_carrier || "");
                            }}
                            disabled={saving}
                            className="relay-button-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            Ship
                          </button>
                        )}
                        {order.status === "shipped" && (
                          <button
                            onClick={() => handleOrderStatusUpdate(order.id, "fulfilled")}
                            disabled={saving}
                            className="relay-button-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Mark Fulfilled
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Shipping form */}
                    {fulfillOrderId === order.id && (
                      <div className="mt-4 p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-white/50 mb-1">Tracking Number</label>
                            <input
                              value={fulfillTracking}
                              onChange={(e) => setFulfillTracking(e.target.value)}
                              placeholder="1Z999AA10123456784"
                              className="relay-input w-full text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-white/50 mb-1">Carrier</label>
                            <input
                              value={fulfillCarrier}
                              onChange={(e) => setFulfillCarrier(e.target.value)}
                              placeholder="UPS, USPS, FedEx..."
                              className="relay-input w-full text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-white/50 mb-1">Admin Notes (optional)</label>
                          <input
                            value={fulfillNotes}
                            onChange={(e) => setFulfillNotes(e.target.value)}
                            placeholder="Any notes for this order"
                            className="relay-input w-full text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOrderStatusUpdate(order.id, "shipped")}
                            disabled={saving || !fulfillTracking.trim()}
                            className="relay-button-accent text-sm disabled:opacity-50"
                          >
                            Confirm Shipment
                          </button>
                          <button
                            onClick={() => setFulfillOrderId(null)}
                            className="relay-button-secondary text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-6">
            {/* Create / Import Tags */}
            <div
              ref={importRef}
              className={`relay-card p-5 space-y-4 transition-all ${
                importDropHighlight
                  ? "ring-2 ring-[#5f8fff] border-[#5f8fff]/40 bg-[#5f8fff]/[0.04]"
                  : ""
              }`}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("application/relay-order")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "link";
                  setImportDropHighlight(true);
                }
              }}
              onDragLeave={(e) => {
                if (importRef.current && !importRef.current.contains(e.relatedTarget as Node)) {
                  setImportDropHighlight(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setImportDropHighlight(false);
                try {
                  const orderData = JSON.parse(e.dataTransfer.getData("application/relay-order"));
                  if (orderData.seller_id) {
                    setSelectedSellerId(orderData.seller_id);
                  }
                  const label = `Order ${orderData.id?.slice(0, 8).toUpperCase() || "N/A"} - ${orderData.bundle_name} (${orderData.quantity} tags)`;
                  setBatchLabel(label);
                  setLinkedOrder(orderData);
                  setSuccess(`Import linked to ${orderData.bundle_name} order for ${sellerLabel(orderData.seller)}. Scan ${orderData.quantity} tags.`);
                } catch {}
              }}
            >
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#7ca6ff]" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Create or Import Tags</h2>
              </div>

              {linkedOrder && (
                <div className="rounded-xl border border-[#5f8fff]/20 bg-[#5f8fff]/[0.06] p-3 flex items-center justify-between">
                  <div className="text-sm">
                    <p className="text-[#7ca6ff] font-medium">
                      Linked to {linkedOrder.bundle_name} order ({linkedOrder.quantity} tags)
                    </p>
                    <p className="text-white/45 text-xs">
                      {sellerLabel(linkedOrder.seller as any)} · {formatBundlePrice(linkedOrder.price_cents)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setLinkedOrder(null);
                      setSelectedSellerId("");
                      setBatchLabel("");
                    }}
                    className="text-white/40 hover:text-white/60 text-xs px-2 py-1"
                  >
                    Unlink
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm text-white/60 mb-2">Assign seller</label>
                <select
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                  className="relay-select w-full"
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
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder="June 2026 batch"
                  className="relay-input w-full"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-3">
                <input
                  value={singleSerial}
                  onChange={(e) => setSingleSerial(e.target.value)}
                  placeholder="Tag serial"
                  className="relay-input"
                />
                <input
                  value={singleBarcode}
                  onChange={(e) => setSingleBarcode(e.target.value)}
                  placeholder="Barcode value"
                  className="relay-input"
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
                  onChange={(e) => setBulkInput(e.target.value)}
                  rows={6}
                  placeholder={"SERIAL001,BARCODE001\nSERIAL002,BARCODE002\nSERIAL003"}
                  className="relay-input w-full resize-none"
                />
                <p className="text-white/35 text-xs mt-2">
                  Newline-delimited serials or CSV rows with serial and optional barcode.
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

            {/* Review Queue */}
            <div className="relay-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#7ca6ff]" />
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Review Queue</h2>
              </div>

              {reviewQueue.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                  No tag submissions are waiting on admin review.
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

          {/* Full Inventory */}
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
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tags"
                  className="relay-input w-full pl-9"
                />
              </div>
            </div>

            <div className="space-y-3">
              {filteredTags.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-white/45 text-sm">
                  No tags matched this search.
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
                          onChange={(e) => {
                            const sellerId = e.target.value;
                            if (!sellerId) {
                              void submitTagAction(`/api/admin/tags/${tag.id}`, { action: "unassign" });
                              return;
                            }
                            void submitTagAction(`/api/admin/tags/${tag.id}`, { action: "assign", sellerId });
                          }}
                          disabled={saving || tag.status === "voided"}
                          className="relay-select text-sm"
                        >
                          <option value="">Unassigned</option>
                          {data.sellers.map((seller) => (
                            <option key={seller.id} value={seller.id}>
                              {sellerLabel(seller)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => void submitTagAction(`/api/admin/tags/${tag.id}`, { action: "void", reason: "Voided by admin" })}
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

          {/* Completed Orders History */}
          {tagOrders.filter((o) => o.status === "fulfilled").length > 0 && (
            <div className="relay-card overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-[#f5f7fb]">Completed Tag Orders</h2>
              </div>
              <div className="divide-y divide-white/5">
                {tagOrders
                  .filter((o) => o.status === "fulfilled")
                  .slice(0, 20)
                  .map((order) => (
                    <div key={order.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-[#f5f7fb] font-medium text-sm">
                          {order.bundle_name} · {order.quantity} tags · {sellerLabel(order.seller as any)}
                        </p>
                        <p className="text-white/40 text-xs">
                          {formatBundlePrice(order.price_cents)} · Fulfilled {formatDate(order.fulfilled_at)}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${orderStatusTone(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
