"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  Package,
  RefreshCw,
  ShoppingCart,
  Tag,
  Truck,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { TAG_BUNDLES, isBundleUnlocked, formatBundlePrice } from "@/lib/tag-bundles";
import type { TagBundle } from "@/lib/tag-bundles";
import type { RelayTag, TagOrder, SellerTier } from "@/types";

interface SellerTagDashboardData {
  profile: {
    id: string;
    seller_tier: SellerTier;
    seller_application_status: string | null;
    is_verified_seller: boolean | null;
  };
  policy: {
    sellerTier: SellerTier;
    requestMode: string;
    defaultRequestQuantity: number;
    description: string;
  };
  counts: {
    available: number;
    used: number;
    needsMore: boolean;
  };
  availableTags: RelayTag[];
  usedTags: RelayTag[];
  requests: any[];
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

function orderStatusTone(status: string) {
  if (status === "fulfilled") return "bg-emerald-500/15 text-emerald-300";
  if (status === "shipped") return "bg-[#5f8fff]/15 text-[#7ca6ff]";
  if (status === "processing") return "bg-amber-500/15 text-amber-300";
  return "bg-white/10 text-white/60";
}

type TabId = "inventory" | "buy" | "orders";

export default function SellerTagsPage() {
  const { currentUser, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const [data, setData] = useState<SellerTagDashboardData | null>(null);
  const [tagOrders, setTagOrders] = useState<TagOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  const [showUsed, setShowUsed] = useState(false);

  // Show success message if redirected from Stripe
  useEffect(() => {
    const purchased = searchParams.get("purchased");
    if (purchased) {
      const bundle = TAG_BUNDLES.find((b) => b.id === purchased);
      if (bundle) {
        setSuccess(`Payment confirmed! Your ${bundle.name} pack (${bundle.quantity} tags) is being prepared for shipment.`);
        setActiveTab("orders");
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (currentUser?.role === "seller") {
      void loadData();
      void loadOrders();
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
        throw new Error(payload.error || "Failed to load tag dashboard");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tag dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    try {
      const response = await fetch("/api/seller/tags/orders", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setTagOrders(payload.orders || []);
      }
    } catch {
      // Non-critical, fail silently
    }
  }

  async function handlePurchase(bundle: TagBundle) {
    setPurchasing(bundle.id);
    setError("");

    try {
      const response = await fetch("/api/seller/tags/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: bundle.id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to start checkout");
      }

      if (payload.url) {
        window.location.href = payload.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setPurchasing(null);
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
        {error || "Tag dashboard is unavailable right now."}
      </div>
    );
  }

  const sellerTier = data.profile.seller_tier;
  const pendingOrders = tagOrders.filter((o) => o.status === "paid" || o.status === "processing" || o.status === "shipped");

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "inventory", label: "Inventory" },
    { id: "buy", label: "Buy Tags" },
    { id: "orders", label: "Orders", count: pendingOrders.length || undefined },
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
          onClick={() => { void loadData(); void loadOrders(); }}
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
          <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">In Transit</p>
          <p className="text-2xl sm:text-3xl font-bold text-[#7ca6ff]">{pendingOrders.length}</p>
        </div>
        <div className="relay-card p-4 sm:p-5">
          <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">Tier</p>
          <div className="inline-flex px-3 py-1.5 rounded-xl border border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#7ca6ff] text-lg font-semibold">
            {sellerTier.replace("tier_", "Tier ")}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === tab.id
                ? "border-[#5f8fff] text-[#f5f7fb]"
                : "border-transparent text-white/40 hover:text-white/60"
            }`}
          >
            {tab.label}
            {tab.count && tab.count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#5f8fff]/20 text-[#7ca6ff] text-xs font-semibold">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Inventory tab */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="relay-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <h2 className="font-semibold text-[#f5f7fb]">Available Tags</h2>
              <span className="text-white/40 text-sm ml-1">({data.availableTags.length})</span>
            </div>

            {data.availableTags.length === 0 ? (
              <div className="p-8 text-center text-white/40 text-sm">
                <p>No tags in your inventory.</p>
                <button
                  onClick={() => setActiveTab("buy")}
                  className="text-[#7ca6ff] hover:text-[#9ab8ff] font-medium mt-2 transition-colors"
                >
                  Purchase tags to get started
                </button>
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
                    Used tags appear here after they are bound to orders.
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

      {/* Buy Tags tab */}
      {activeTab === "buy" && (
        <div className="space-y-6">
          <p className="text-white/50 text-sm">
            Purchase Relay security tags shipped directly to you. Higher tiers unlock better per-tag pricing.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TAG_BUNDLES.map((bundle) => {
              const unlocked = isBundleUnlocked(bundle, sellerTier);
              const isPurchasing = purchasing === bundle.id;

              return (
                <div
                  key={bundle.id}
                  className={`relay-card p-5 sm:p-6 relative overflow-hidden transition-all ${
                    unlocked
                      ? "border border-white/10 hover:border-white/20"
                      : "border border-white/5 opacity-60"
                  }`}
                >
                  {!unlocked && (
                    <div className="absolute top-4 right-4">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-white/40 text-xs font-medium">
                        <Lock className="w-3 h-3" />
                        {bundle.minTier.replace("tier_", "Tier ")}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-[#f5f7fb]">{bundle.name}</h3>
                        <span className="text-white/40 text-sm">{bundle.quantity} tags</span>
                      </div>
                      <p className="text-white/50 text-sm">{bundle.description}</p>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-[#f5f7fb]">
                        {formatBundlePrice(bundle.priceCents)}
                      </span>
                      <span className="text-white/40 text-sm">{bundle.pricePerTag}/tag</span>
                    </div>

                    <button
                      onClick={() => handlePurchase(bundle)}
                      disabled={!unlocked || isPurchasing || purchasing !== null}
                      className={`w-full py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                        unlocked
                          ? "relay-button-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          : "bg-white/5 text-white/30 cursor-not-allowed"
                      }`}
                    >
                      {isPurchasing ? (
                        "Redirecting to Stripe..."
                      ) : !unlocked ? (
                        <>
                          <Lock className="w-4 h-4" />
                          Unlock at {bundle.minTier.replace("tier_", "Tier ")}
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          Purchase
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Orders tab */}
      {activeTab === "orders" && (
        <div className="relay-card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#7ca6ff]" />
            <h2 className="font-semibold text-[#f5f7fb]">Tag Orders</h2>
          </div>

          {tagOrders.length === 0 ? (
            <div className="p-8 text-center text-white/40 text-sm">
              <p>No tag orders yet.</p>
              <button
                onClick={() => setActiveTab("buy")}
                className="text-[#7ca6ff] hover:text-[#9ab8ff] font-medium mt-2 transition-colors"
              >
                Browse tag bundles
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {tagOrders.map((order) => (
                <div key={order.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <p className="text-[#f5f7fb] font-medium text-sm">
                        {order.bundle_name} Pack
                        <span className="text-white/40 font-normal ml-2">
                          {order.quantity} tags
                        </span>
                      </p>
                      <p className="text-white/40 text-xs mt-0.5">
                        {formatDate(order.paid_at || order.created_at)} · {formatBundlePrice(order.price_cents)}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${orderStatusTone(order.status)}`}>
                      {order.status}
                    </span>
                  </div>

                  {order.shipping_tracking_number && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-[#7ca6ff]">
                      <Truck className="w-3.5 h-3.5" />
                      <span>
                        {order.shipping_carrier ? `${order.shipping_carrier}: ` : ""}
                        {order.shipping_tracking_number}
                      </span>
                    </div>
                  )}

                  {order.admin_notes && (
                    <p className="text-white/40 text-xs mt-2 italic">Note: {order.admin_notes}</p>
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
