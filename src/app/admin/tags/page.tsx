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

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const map: Record<string, string> = {
    unused: "bg-[#5f8fff]/15 text-[#7ca6ff]",
    assigned_to_seller: "bg-[#5f8fff]/15 text-[#7ca6ff]",
    used: "bg-emerald-500/15 text-emerald-300",
    in_transit: "bg-amber-500/15 text-amber-300",
    delivered: "bg-emerald-500/15 text-emerald-300",
    voided: "bg-red-500/15 text-red-300",
    disputed: "bg-red-500/15 text-red-300",
  };
  const cls = map[status] || "bg-white/10 text-white/60";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
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

  const reviewQueue = useMemo(
    () =>
      filteredTags.filter(
        (tag) => tag.photo_verification_status === "admin_review" && tag.assigned_order_id
      ),
    [filteredTags]
  );

  const actionableOrders = useMemo(
    () =>
      tagOrders.filter(
        (o) => o.status === "paid" || o.status === "processing" || o.status === "shipped"
      ),
    [tagOrders]
  );

  const completedOrders = useMemo(
    () => tagOrders.filter((o) => o.status === "fulfilled"),
    [tagOrders]
  );

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading tag inventory...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  const totalTags = data ? data.counts.unused + data.counts.assigned + data.counts.used + data.counts.disputed + data.counts.voided : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Relay Tags</h1>
          <p className="text-white/40 text-sm max-w-2xl">
            Import, assign, fulfill, and review tags across the marketplace.
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

      {/* Alerts */}
      {(error || success) && (
        <div className={`relay-card p-4 border ${error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
          {error || success}
        </div>
      )}

      {data && (
        <>
          {/* Compact Metrics Summary Bar */}
          <div className="relay-card px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-white/40 text-xs uppercase tracking-[0.14em] mr-1">Tags</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#5f8fff]/15 text-[#7ca6ff] border border-[#5f8fff]/10">
                <Tag className="w-3 h-3" />
                {totalTags} total
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/10">
                {data.counts.assigned} assigned
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/10">
                {data.counts.unused} unassigned
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#5f8fff]/10 text-[#7ca6ff]/80 border border-[#5f8fff]/10">
                {data.counts.used} used
              </span>
              {data.counts.disputed > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/10">
                  {data.counts.disputed} disputed
                </span>
              )}
              {data.counts.voided > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-300/70 border border-red-500/10">
                  {data.counts.voided} voided
                </span>
              )}
            </div>
          </div>

          {/* Tag Order Fulfillment */}
          {actionableOrders.length > 0 && (
            <div className="relay-card overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-semibold text-[#f5f7fb]">Pending Orders</h2>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold ml-1">
                    {actionableOrders.length}
                  </span>
                </div>
                <p className="text-white/30 text-xs hidden sm:block">Drag an order to Import Tags to link it</p>
              </div>

              <div className="divide-y divide-white/5">
                {actionableOrders.map((order) => {
                  const statusBorder =
                    order.status === "shipped"
                      ? "border-l-[3px] border-l-[#5f8fff]"
                      : order.status === "processing"
                        ? "border-l-[3px] border-l-amber-400"
                        : "border-l-[3px] border-l-white/10";

                  return (
                    <div
                      key={order.id}
                      className={`px-5 py-4 cursor-grab active:cursor-grabbing ${statusBorder}`}
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
                              {order.bundle_name} Pack / {order.quantity} tags
                            </p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${orderStatusTone(order.status)}`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-white/45 text-sm">
                            {sellerLabel(order.seller as any)} / {formatBundlePrice(order.price_cents)} / Paid {formatDate(order.paid_at)}
                          </p>
                          {order.shipping_tracking_number && (
                            <p className="text-[#7ca6ff] text-xs flex items-center gap-1">
                              <Truck className="w-3.5 h-3.5" />
                              {order.shipping_carrier ? `${order.shipping_carrier}: ` : ""}
                              {order.shipping_tracking_number}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
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
                            <>
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
                            </>
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

                      {/* Inline Shipping Form */}
                      {fulfillOrderId === order.id && (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                          <div className="flex-1">
                            <label className="block text-xs text-white/40 mb-1">Tracking #</label>
                            <input
                              value={fulfillTracking}
                              onChange={(e) => setFulfillTracking(e.target.value)}
                              placeholder="1Z999AA10123456784"
                              className="relay-input w-full text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-white/40 mb-1">Carrier</label>
                            <input
                              value={fulfillCarrier}
                              onChange={(e) => setFulfillCarrier(e.target.value)}
                              placeholder="UPS, USPS, FedEx..."
                              className="relay-input w-full text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-white/40 mb-1">Notes (optional)</label>
                            <input
                              value={fulfillNotes}
                              onChange={(e) => setFulfillNotes(e.target.value)}
                              placeholder="Any notes"
                              className="relay-input w-full text-sm"
                            />
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleOrderStatusUpdate(order.id, "shipped")}
                              disabled={saving || !fulfillTracking.trim()}
                              className="relay-button-accent text-sm disabled:opacity-50 whitespace-nowrap"
                            >
                              Confirm
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
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Orders (collapsed section) */}
          {completedOrders.length > 0 && (
            <div className="relay-card overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-[#f5f7fb]">Completed Orders</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold ml-1">
                  {completedOrders.length}
                </span>
              </div>
              <div className="divide-y divide-white/5">
                {completedOrders.slice(0, 20).map((order) => (
                  <div key={order.id} className="px-5 py-3 border-l-[3px] border-l-emerald-500/40 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-[#f5f7fb] font-medium text-sm">
                        {order.bundle_name} / {order.quantity} tags / {sellerLabel(order.seller as any)}
                      </p>
                      <p className="text-white/40 text-xs">
                        {formatBundlePrice(order.price_cents)} / Fulfilled {formatDate(order.fulfilled_at)}
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

          {/* Create / Import Tags -- side-by-side card with vertical divider */}
          <div
            ref={importRef}
            className={`relay-card overflow-hidden transition-all ${
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
            {/* Card Header */}
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Create or Import Tags</h2>
            </div>

            {/* Linked order banner */}
            {linkedOrder && (
              <div className="mx-5 mt-4 rounded-xl border border-[#5f8fff]/20 bg-[#5f8fff]/[0.06] p-3 flex items-center justify-between">
                <div className="text-sm">
                  <p className="text-[#7ca6ff] font-medium">
                    Linked to {linkedOrder.bundle_name} order ({linkedOrder.quantity} tags)
                  </p>
                  <p className="text-white/45 text-xs">
                    {sellerLabel(linkedOrder.seller as any)} / {formatBundlePrice(linkedOrder.price_cents)}
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

            {/* Shared controls */}
            <div className="px-5 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Assign seller</label>
                <select
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                  className="relay-select w-full text-sm"
                >
                  <option value="">No seller assigned</option>
                  {data.sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {sellerLabel(seller)} / {seller.seller_tier.replace("tier_", "Tier ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Batch label</label>
                <input
                  value={batchLabel}
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder="June 2026 batch"
                  className="relay-input w-full text-sm"
                />
              </div>
            </div>

            {/* Two-column: Create Single | Bulk Import */}
            <div className="p-5 grid grid-cols-1 xl:grid-cols-[1fr,auto,1fr] gap-0">
              {/* Left: Create Single Tag */}
              <div className="space-y-3 pr-0 xl:pr-5">
                <p className="text-white/50 text-xs uppercase tracking-[0.14em]">Create Single Tag</p>
                <input
                  value={singleSerial}
                  onChange={(e) => setSingleSerial(e.target.value)}
                  placeholder="Tag serial"
                  className="relay-input w-full text-sm"
                />
                <input
                  value={singleBarcode}
                  onChange={(e) => setSingleBarcode(e.target.value)}
                  placeholder="Barcode value"
                  className="relay-input w-full text-sm"
                />
                <button
                  onClick={handleCreateSingleTag}
                  disabled={saving}
                  className="relay-button-primary w-full whitespace-nowrap disabled:opacity-50 text-sm"
                >
                  Create Tag
                </button>
              </div>

              {/* Vertical divider */}
              <div className="hidden xl:block w-px bg-white/5 mx-0" />
              <div className="block xl:hidden h-px bg-white/5 my-4" />

              {/* Right: Bulk Import */}
              <div className="space-y-3 pl-0 xl:pl-5">
                <p className="text-white/50 text-xs uppercase tracking-[0.14em]">Bulk Import</p>
                <textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  rows={4}
                  placeholder={"SERIAL001,BARCODE001\nSERIAL002,BARCODE002\nSERIAL003"}
                  className="relay-input w-full resize-none text-sm"
                />
                <p className="text-white/30 text-xs">
                  Newline-delimited serials or CSV rows (serial, barcode).
                </p>
                <button
                  onClick={handleBulkImport}
                  disabled={saving}
                  className="relay-button-secondary w-full disabled:opacity-50 text-sm"
                >
                  Import Batch
                </button>
              </div>
            </div>
          </div>

          {/* Review Queue */}
          <div className="relay-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Review Queue</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ml-1 ${
                reviewQueue.length > 0
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-white/5 text-white/30"
              }`}>
                {reviewQueue.length}
              </span>
            </div>

            {reviewQueue.length === 0 ? (
              <div className="px-5 py-6 text-white/40 text-sm">
                No tag submissions waiting on admin review.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {reviewQueue.slice(0, 10).map((tag) => (
                  <div key={tag.id} className="px-5 py-4 border-l-[3px] border-l-amber-400">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <p className="text-[#f5f7fb] font-semibold">{tag.tag_serial_number}</p>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300">
                            manual review
                          </span>
                        </div>
                        <p className="text-white/45 text-sm">
                          Seller: {sellerLabel(tag.seller)} / Order {tag.order?.id?.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 flex-shrink-0">
                        <button
                          onClick={() => tag.assigned_order_id && handleCustodyReview(tag.assigned_order_id, true)}
                          disabled={saving || !tag.assigned_order_id}
                          className="relay-button-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => tag.assigned_order_id && handleCustodyReview(tag.assigned_order_id, false)}
                          disabled={saving || !tag.assigned_order_id}
                          className="relay-button-danger inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Full Tag Inventory */}
          <div className="relay-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#f5f7fb]">Tag Inventory</h2>
                <p className="text-white/40 text-xs mt-0.5">Search by serial, barcode, seller, order, or batch label.</p>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tags"
                  className="relay-input w-full pl-9 text-sm"
                />
              </div>
            </div>

            {filteredTags.length === 0 ? (
              <div className="px-5 py-6 text-white/40 text-sm">
                No tags matched this search.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredTags.slice(0, 100).map((tag) => {
                  const borderColor =
                    tag.status === "voided"
                      ? "border-l-red-400"
                      : tag.status === "assigned_to_seller"
                        ? "border-l-[#5f8fff]"
                        : tag.status === "used"
                          ? "border-l-emerald-400"
                          : "border-l-white/10";

                  return (
                    <div key={tag.id} className={`px-5 py-3.5 border-l-[3px] ${borderColor}`}>
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <p className="text-[#f5f7fb] font-semibold text-sm">{tag.tag_serial_number}</p>
                            <StatusBadge status={tag.status} />
                            {tag.photo_verification_status === "admin_review" && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300">
                                admin review
                              </span>
                            )}
                          </div>
                          <p className="text-white/40 text-xs">
                            Barcode: {tag.barcode_value || "None"} / {sellerLabel(tag.seller)} / Order {tag.order?.id?.slice(0, 8).toUpperCase() || "N/A"}
                            <span className="text-white/25 ml-2">
                              Batch {tag.source_batch_label || "N/A"} / Imported {formatDate(tag.imported_at)} / Bound {formatDate(tag.bound_to_order_at)}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 flex-shrink-0">
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
                            className="relay-button-danger disabled:opacity-50 text-sm"
                          >
                            Void
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
