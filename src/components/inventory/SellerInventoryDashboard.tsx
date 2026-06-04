"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Eye, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { dedupeSkuListings, formatSizeDisplay, getListingDisplayMetrics } from "@/lib/listing-display";
import type { Listing } from "@/types";

type ListingStatus = "active" | "sold_out" | "inactive" | "removed" | "pending_review" | "rejected";
type InventoryFilter = "all" | "active" | "inactive" | "sold_out" | "low_stock";
type InventorySort = "newest" | "name_asc" | "price_asc" | "price_desc" | "quantity_desc";

interface InventoryVariant {
  id?: string;
  size: string;
  quantity: number;
  price: number;
  isActive: boolean;
}

interface InventoryListingRow extends Listing {
  displayName: string;
  displayImage: string;
  displaySku: string | null;
  availableSizeSummary: string;
  totalQuantity: number;
  lowestPrice: number;
  activeQuantity: number;
  searchableText: string;
  variants: InventoryVariant[];
}

const LOW_STOCK_THRESHOLD = 2;

const STATUS_BADGES: Record<ListingStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  inactive: { label: "Inactive", color: "bg-slate-500/15 text-slate-300 border-slate-500/25" },
  sold_out: { label: "Sold Out", color: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  removed: { label: "Removed", color: "bg-red-500/15 text-red-300 border-red-500/25" },
  pending_review: { label: "Pending Review", color: "bg-orange-500/15 text-orange-300 border-orange-500/25" },
  rejected: { label: "Rejected", color: "bg-red-500/15 text-red-300 border-red-500/25" },
};

export default function SellerInventoryDashboard() {
  const { currentUser } = useAuth();
  const [listings, setListings] = useState<InventoryListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [sortBy, setSortBy] = useState<InventorySort>("newest");
  const [expandedListingId, setExpandedListingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    const sellerId = currentUser?.id;

    if (!sellerId) {
      setLoading(false);
      return;
    }

    async function fetchListings() {
      const supabase = createClient();
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from("listings")
          .select("*, listing_variants(id, size, price, quantity, is_active)")
          .eq("seller_id", sellerId)
          .order("updated_at", { ascending: false });

        if (error) {
          throw error;
        }

        const dedupedListings = dedupeSkuListings((data || []) as Listing[]);
        const formatted = dedupedListings.map((listing) => {
          const metrics = getListingDisplayMetrics(listing);
          const displayName = getDisplayName(listing);
          const activeQuantity = metrics.variants.reduce(
            (sum, variant) => sum + (variant.isActive ? variant.quantity : 0),
            0
          );
          const totalQuantity = metrics.variants.reduce((sum, variant) => sum + variant.quantity, 0);
          const searchableText = [
            listing.sku,
            listing.sku_normalized,
            displayName,
            listing.brand,
            listing.model,
            listing.nickname,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return {
            ...listing,
            displayName,
            displayImage: listing.images?.[0] || "/placeholder-shoe.png",
            displaySku: listing.sku || null,
            availableSizeSummary: formatSizeDisplay(metrics.sizes, metrics.sizeLabels) || "No active sizes",
            totalQuantity,
            activeQuantity,
            lowestPrice: metrics.lowestPrice,
            searchableText,
            variants: metrics.variants.map((variant) => ({
              id: variant.id,
              size: variant.size,
              quantity: variant.quantity,
              price: variant.price,
              isActive: variant.isActive,
            })),
          } satisfies InventoryListingRow;
        });

        setListings(formatted);
      } catch (error) {
        console.error("Error fetching seller inventory:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, [currentUser?.id]);

  const filteredListings = useMemo(() => {
    const normalizedSearch = deferredSearchQuery.trim().toLowerCase();

    let nextListings = listings;

    if (normalizedSearch) {
      nextListings = nextListings.filter((listing) => listing.searchableText.includes(normalizedSearch));
    }

    nextListings = nextListings.filter((listing) => {
      if (filter === "all") {
        return true;
      }

      if (filter === "low_stock") {
        return listing.activeQuantity > 0 && listing.activeQuantity <= LOW_STOCK_THRESHOLD;
      }

      return listing.status === filter;
    });

    const sortedListings = [...nextListings];
    sortedListings.sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return a.displayName.localeCompare(b.displayName);
        case "price_asc":
          return getSortablePrice(a.lowestPrice) - getSortablePrice(b.lowestPrice);
        case "price_desc":
          return getSortablePrice(b.lowestPrice) - getSortablePrice(a.lowestPrice);
        case "quantity_desc":
          return b.totalQuantity - a.totalQuantity;
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return sortedListings;
  }, [deferredSearchQuery, filter, listings, sortBy]);

  const activeListingsCount = listings.filter((listing) => listing.status === "active").length;
  const lowStockCount = listings.filter(
    (listing) => listing.activeQuantity > 0 && listing.activeQuantity <= LOW_STOCK_THRESHOLD
  ).length;
  const totalInventoryValue = listings.reduce((sum, listing) => {
    return (
      sum +
      listing.variants.reduce((variantSum, variant) => {
        return variantSum + variant.price * variant.quantity;
      }, 0)
    );
  }, 0);
  const uniqueSkuCount = new Set(listings.map((listing) => listing.sku_normalized || listing.id)).size;

  const handleToggleStatus = async (listingId: string, currentStatus: ListingStatus) => {
    if (!currentUser?.id) {
      return;
    }

    setActionLoading(listingId);
    try {
      const supabase = createClient();
      const nextStatus: ListingStatus = currentStatus === "active" ? "inactive" : "active";
      const { error } = await supabase
        .from("listings")
        .update({ status: nextStatus })
        .eq("id", listingId)
        .eq("seller_id", currentUser.id);

      if (error) {
        throw error;
      }

      setListings((prev) =>
        prev.map((listing) => (listing.id === listingId ? { ...listing, status: nextStatus } : listing))
      );
    } catch (error) {
      console.error("Error updating listing status:", error);
      alert("Failed to update listing status. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (listingId: string) => {
    if (!currentUser?.id) {
      return;
    }

    setActionLoading(listingId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("listings")
        .update({ status: "removed" })
        .eq("id", listingId)
        .eq("seller_id", currentUser.id);

      if (error) {
        throw error;
      }

      setListings((prev) =>
        prev.map((listing) => (listing.id === listingId ? { ...listing, status: "removed" } : listing))
      );
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting listing:", error);
      alert("Failed to delete listing. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="relay-empty text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-2">
        <p className="relay-eyebrow text-relay-accent">INVENTORY</p>
        <h1 className="relay-title">Inventory Dashboard</h1>
        <p className="text-relay-subtle max-w-3xl">
          Search by SKU or product details, filter low-stock pairs fast, and review size-level inventory from one mobile-friendly seller workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard label="Active Listings" value={activeListingsCount} />
        <StatCard label="Unique SKU Listings" value={uniqueSkuCount} />
        <StatCard label="Units in Stock" value={listings.reduce((sum, listing) => sum + listing.totalQuantity, 0)} />
        <StatCard label={`Low Stock (<=${LOW_STOCK_THRESHOLD})`} value={lowStockCount} />
        <StatCard label="Inventory Value" value={`$${totalInventoryValue.toFixed(0)}`} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <label className="relative flex-1">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search SKU, product name, brand, model, or colorway"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-11 pr-4 py-3 text-sm text-relay-text placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#5f8fff]/40"
              />
            </label>

            <label className="sm:w-[220px]">
              <span className="sr-only">Sort inventory</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as InventorySort)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-relay-text focus:outline-none focus:ring-2 focus:ring-[#5f8fff]/40"
              >
                <option value="newest">Newest</option>
                <option value="name_asc">Name A-Z</option>
                <option value="price_asc">Lowest Price</option>
                <option value="price_desc">Highest Price</option>
                <option value="quantity_desc">Total Quantity</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/inventory/bulk-import" className="relay-button-secondary inline-flex items-center gap-2">
              <FileSpreadsheet size={16} />
              Bulk Import
            </Link>
            <Link href="/sell" className="relay-button-primary inline-flex items-center gap-2">
              <Plus size={16} />
              Create Listing
            </Link>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["all", "active", "inactive", "sold_out", "low_stock"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                filter === status
                  ? "bg-[#5f8fff] text-white"
                  : "bg-white/[0.04] text-white/70 border border-white/10 hover:bg-white/[0.08]"
              }`}
            >
              {status === "all"
                ? "All"
                : status === "sold_out"
                ? "Sold Out"
                : status === "low_stock"
                ? `Low Stock (<=${LOW_STOCK_THRESHOLD})`
                : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filteredListings.length === 0 ? (
        <div className="relay-card p-12 text-center">
          <p className="text-relay-text mb-2">No inventory matched that search or filter.</p>
          <p className="text-relay-subtle text-sm">
            Try another SKU or product keyword, or switch filters to see more items.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredListings.map((listing) => {
            const badge = STATUS_BADGES[listing.status];
            const isExpanded = expandedListingId === listing.id;

            return (
              <div key={listing.id} className="relay-card p-0 overflow-hidden">
                <div className="p-4 sm:p-6">
                  <div className="flex flex-col xl:flex-row gap-5 xl:items-start">
                    <div className="w-full sm:w-28 h-28 rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 flex-shrink-0">
                      {listing.displayImage && listing.displayImage !== "/placeholder-shoe.png" ? (
                        <img
                          src={listing.displayImage}
                          alt={listing.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-indigo-500/20">
                          <span className="text-white/30 text-xs">No Image</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h2 className="text-xl font-semibold text-relay-text truncate">{listing.displayName}</h2>
                            <span className={`${badge.color} border px-3 py-1 rounded-full text-xs font-semibold`}>
                              {badge.label}
                            </span>
                            {listing.activeQuantity > 0 && listing.activeQuantity <= LOW_STOCK_THRESHOLD && (
                              <span className="border border-amber-500/25 bg-amber-500/15 px-3 py-1 rounded-full text-xs font-semibold text-amber-300">
                                Low Stock
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/55">
                            <span>SKU: {listing.displaySku || "Custom / Manual"}</span>
                            <span>
                              {listing.listing_type === "sku" ? "Catalog Listing" : "Manual Listing"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/listing/${listing.id}`}
                            className="px-4 py-2 bg-[#5f8fff]/20 text-[#7ca6ff] hover:bg-[#5f8fff]/30 text-sm font-medium rounded-full transition-colors border border-[#5f8fff]/30 inline-flex items-center gap-2"
                          >
                            <Eye size={14} />
                            View
                          </Link>
                          <Link
                            href={`/edit-listing/${listing.id}`}
                            className="px-4 py-2 bg-white/[0.04] text-white/75 hover:bg-white/[0.08] text-sm font-medium rounded-full transition-colors border border-white/10 inline-flex items-center gap-2"
                          >
                            <Pencil size={14} />
                            Edit
                          </Link>
                          {listing.status !== "removed" && (
                            <button
                              onClick={() => handleToggleStatus(listing.id, listing.status)}
                              disabled={actionLoading === listing.id}
                              className="px-4 py-2 bg-white/[0.04] text-white/75 hover:bg-white/[0.08] text-sm font-medium rounded-full transition-colors border border-white/10 disabled:opacity-50"
                            >
                              {actionLoading === listing.id
                                ? "Updating..."
                                : listing.status === "active"
                                ? "Deactivate"
                                : "Activate"}
                            </button>
                          )}
                          {listing.status !== "removed" &&
                            (showDeleteConfirm === listing.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-red-300 text-xs">Remove listing?</span>
                                <button
                                  onClick={() => handleDelete(listing.id)}
                                  disabled={actionLoading === listing.id}
                                  className="px-3 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm font-medium rounded-full transition-colors border border-red-500/30 disabled:opacity-50"
                                >
                                  {actionLoading === listing.id ? "Removing..." : "Confirm"}
                                </button>
                                <button
                                  onClick={() => setShowDeleteConfirm(null)}
                                  className="px-3 py-2 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] text-sm font-medium rounded-full transition-colors border border-white/10"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowDeleteConfirm(listing.id)}
                                className="px-4 py-2 bg-red-500/15 text-red-300 hover:bg-red-500/25 text-sm font-medium rounded-full transition-colors border border-red-500/25 inline-flex items-center gap-2"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                        <Metric label="Available Sizes" value={listing.availableSizeSummary} />
                        <Metric label="Total Quantity" value={`${listing.totalQuantity} units`} />
                        <Metric
                          label="Lowest Price"
                          value={listing.lowestPrice > 0 ? `From $${listing.lowestPrice}` : "No price"}
                        />
                        <Metric label="Variants" value={`${listing.variants.length} total`} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-5 border-t border-white/8">
                    <button
                      onClick={() =>
                        setExpandedListingId((current) => (current === listing.id ? null : listing.id))
                      }
                      className="w-full sm:w-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 text-sm font-medium text-relay-text hover:bg-white/[0.08] transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {isExpanded ? "Hide Variants" : "Show Variants"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/8 bg-white/[0.02] px-4 sm:px-6 py-4">
                    <div className="grid grid-cols-1 gap-3">
                      {listing.variants.map((variant) => (
                        <div
                          key={variant.id || `${listing.id}-${variant.size}`}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <p className="text-relay-text font-semibold">Size {variant.size}</p>
                              <p className="text-sm text-white/50 mt-1">
                                {variant.isActive ? "Variant active" : "Variant inactive"}
                              </p>
                            </div>

                            <div className="grid grid-cols-3 gap-3 sm:gap-5 sm:min-w-[320px]">
                              <VariantMetric label="Quantity" value={variant.quantity} />
                              <VariantMetric label="Price" value={`$${variant.price}`} />
                              <VariantMetric
                                label="Status"
                                value={variant.isActive && variant.quantity > 0 ? "Active" : "Inactive"}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-6">
      <p className="text-white/70 text-sm mb-2">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <p className="text-white/45 text-xs uppercase tracking-[0.18em] mb-2">{label}</p>
      <p className="text-relay-text text-sm font-medium">{value}</p>
    </div>
  );
}

function VariantMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/40 mb-1">{label}</p>
      <p className="text-sm font-semibold text-relay-text">{value}</p>
    </div>
  );
}

function getDisplayName(listing: Listing) {
  return [listing.brand, listing.model, listing.nickname].filter(Boolean).join(" ").trim() || "Untitled Listing";
}

function getSortablePrice(price: number) {
  return price > 0 ? price : Number.MAX_SAFE_INTEGER;
}
