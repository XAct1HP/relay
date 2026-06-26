"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, Download, Eye, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  applyBulkInventoryAction,
  deleteInventoryListingAction,
  exportInventoryCsvAction,
  updateInventoryVariantAction,
} from "@/app/dashboard/inventory/actions";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { dedupeSkuListings, formatSizeDisplay, getListingDisplayMetrics } from "@/lib/listing-display";
import type { Listing } from "@/types";

type ListingStatus = "active" | "sold_out" | "inactive" | "removed" | "pending_review" | "rejected";
type InventoryFilter = "all" | "active" | "inactive" | "sold_out" | "low_stock";
type InventorySort = "newest" | "name_asc" | "price_asc" | "price_desc" | "quantity_desc";
type BulkInventoryAction =
  | ""
  | "activate"
  | "deactivate"
  | "increase_price_percent"
  | "decrease_price_percent"
  | "set_quantity_zero";

interface InventoryVariant {
  id?: string;
  size: string;
  quantity: number;
  price: number;
  condition: "new" | "used";
  isActive: boolean;
}

interface VariantDraft {
  price: string;
  quantity: string;
  isActive: boolean;
}

interface BulkResultSummary {
  updatedCount: number;
  skippedCount: number;
  errors: string[];
}

interface PendingBulkAction {
  action: Exclude<BulkInventoryAction, "">;
  percentage?: number;
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
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkInventoryAction>("");
  const [bulkPercentage, setBulkPercentage] = useState("");
  const [pendingBulkAction, setPendingBulkAction] = useState<PendingBulkAction | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkFormError, setBulkFormError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResultSummary | null>(null);
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDraft>>({});
  const [variantMessages, setVariantMessages] = useState<
    Record<string, { type: "error" | "success"; message: string }>
  >({});
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const deferredSearchQuery = useDeferredValue(searchQuery);

  async function loadListings(sellerId: string, options?: { showLoading?: boolean }) {
    const supabase = createClient();
    const showLoading = options?.showLoading ?? true;

    if (showLoading) {
      setLoading(true);
    }

    try {
        const { data, error } = await supabase
        .from("listings")
        .select("*, listing_variants(id, size, price, quantity, condition, is_active)")
        .eq("seller_id", sellerId)
        .neq("status", "removed")
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      const formatted = formatInventoryListings((data || []) as Listing[]);
      setListings(formatted);
      setVariantDrafts(buildVariantDrafts(formatted));
      const listingIdSet = new Set(formatted.map((listing) => listing.id));
      const variantIdSet = new Set(
        formatted.flatMap((listing) => listing.variants.map((variant) => variant.id).filter(Boolean) as string[])
      );
      setSelectedListingIds((prev) => prev.filter((id) => listingIdSet.has(id)));
      setSelectedVariantIds((prev) => prev.filter((id) => variantIdSet.has(id)));
    } catch (error) {
      console.error("Error fetching seller inventory:", error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const sellerId = currentUser?.id;

    if (!sellerId) {
      setLoading(false);
      return;
    }

    loadListings(sellerId);
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

  const groupedByBrand = useMemo(() => {
    const groups: Record<string, typeof filteredListings> = {};
    filteredListings.forEach((listing) => {
      const brand = listing.brand || "Other";
      if (!groups[brand]) groups[brand] = [];
      groups[brand].push(listing);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredListings]);

  const toggleBrand = (brand: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

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
  const selectedSourceCount = selectedListingIds.length + selectedVariantIds.length;

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
      const result = await deleteInventoryListingAction(listingId);
      if (!result.success) {
        throw new Error(result.error);
      }

      await loadListings(currentUser.id, { showLoading: false });
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting listing:", error);
      alert(error instanceof Error ? error.message : "Failed to delete listing. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSelection = (values: string[], value: string) => {
    return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
  };

  const handleToggleListingSelection = (listingId: string) => {
    setSelectedListingIds((prev) => toggleSelection(prev, listingId));
    setPendingBulkAction(null);
    setBulkFormError(null);
  };

  const handleToggleVariantSelection = (variantId: string) => {
    setSelectedVariantIds((prev) => toggleSelection(prev, variantId));
    setPendingBulkAction(null);
    setBulkFormError(null);
  };

  const clearBulkSelection = () => {
    setSelectedListingIds([]);
    setSelectedVariantIds([]);
    setBulkAction("");
    setBulkPercentage("");
    setPendingBulkAction(null);
    setBulkFormError(null);
  };

  const updateVariantDraft = (variantId: string, updates: Partial<VariantDraft>) => {
    setVariantDrafts((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || { price: "", quantity: "0", isActive: true }),
        ...updates,
      },
    }));

    setVariantMessages((prev) => {
      if (!prev[variantId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  };

  const handleSaveVariant = async (listingId: string, variant: InventoryVariant) => {
    if (!currentUser?.id || !variant.id) {
      return;
    }

    const draft = variantDrafts[variant.id] || {
      price: String(variant.price),
      quantity: String(variant.quantity),
      isActive: variant.isActive,
    };
    const price = Number(draft.price);
    const quantity = Number(draft.quantity);

    if (!Number.isFinite(price) || price <= 0) {
      setVariantMessages((prev) => ({
        ...prev,
        [variant.id!]: { type: "error", message: "Price must be greater than 0." },
      }));
      return;
    }

    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0) {
      setVariantMessages((prev) => ({
        ...prev,
        [variant.id!]: { type: "error", message: "Quantity must be an integer greater than or equal to 0." },
      }));
      return;
    }

    setSavingVariantId(variant.id);
    try {
      const result = await updateInventoryVariantAction({
        listingId,
        variantId: variant.id,
        price,
        quantity,
        isActive: draft.isActive,
      });

      if (!result.success) {
        setVariantMessages((prev) => ({
          ...prev,
          [variant.id!]: { type: "error", message: result.error },
        }));
        return;
      }

      await loadListings(currentUser.id, { showLoading: false });
      setVariantMessages((prev) => ({
        ...prev,
        [variant.id!]: {
          type: "success",
          message: result.message || `Size ${result.variant.size} updated.`,
        },
      }));
    } catch (error) {
      console.error("Error updating inventory variant:", error);
      setVariantMessages((prev) => ({
        ...prev,
        [variant.id!]: { type: "error", message: "Failed to update this variant. Please try again." },
      }));
    } finally {
      setSavingVariantId(null);
    }
  };

  const handleReviewBulkAction = () => {
    setBulkResult(null);

    if (selectedSourceCount === 0) {
      setBulkFormError("Select at least one listing or variant first.");
      return;
    }

    if (!bulkAction) {
      setBulkFormError("Choose a bulk action first.");
      return;
    }

    const percentage = Number(bulkPercentage);
    if (
      (bulkAction === "increase_price_percent" || bulkAction === "decrease_price_percent") &&
      (!Number.isFinite(percentage) || percentage <= 0)
    ) {
      setBulkFormError("Enter a percentage greater than 0.");
      return;
    }

    setBulkFormError(null);
    setPendingBulkAction({
      action: bulkAction,
      percentage:
        bulkAction === "increase_price_percent" || bulkAction === "decrease_price_percent"
          ? percentage
          : undefined,
    });
  };

  const handleApplyBulkAction = async () => {
    if (!currentUser?.id || !pendingBulkAction) {
      return;
    }

    setBulkApplying(true);
    setBulkFormError(null);

    try {
      const result = await applyBulkInventoryAction({
        listingIds: selectedListingIds,
        variantIds: selectedVariantIds,
        action: pendingBulkAction.action,
        percentage: pendingBulkAction.percentage,
      });

      if (!result.success) {
        setBulkFormError(result.error);
        return;
      }

      await loadListings(currentUser.id, { showLoading: false });
      setBulkResult({
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        errors: result.errors,
      });
      clearBulkSelection();
    } catch (error) {
      console.error("Error applying bulk inventory action:", error);
      setBulkFormError("Failed to apply the bulk inventory action. Please try again.");
    } finally {
      setBulkApplying(false);
      setPendingBulkAction(null);
    }
  };

  const handleExportInventory = async () => {
    setExporting(true);

    try {
      const result = await exportInventoryCsvAction();
      if (!result.success) {
        throw new Error(result.error);
      }

      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting inventory:", error);
      alert(error instanceof Error ? error.message : "Failed to export inventory.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="relay-empty text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-12">
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
            <button
              onClick={handleExportInventory}
              disabled={exporting}
              className="relay-button-secondary inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={16} />
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
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

        <div className="flex gap-2 overflow-x-auto flex-nowrap scrollbar-hide pb-1">
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

      {selectedSourceCount > 0 && (
        <div className="relay-card p-4 sm:p-5 space-y-4 sticky top-0 z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <p className="text-relay-text font-semibold">Bulk edit selected inventory</p>
              <p className="text-sm text-white/55 mt-1">
                {getSelectionSummary(selectedListingIds.length, selectedVariantIds.length)}
              </p>
            </div>

            <button
              onClick={clearBulkSelection}
              className="px-4 py-2 rounded-full border border-white/10 bg-white/[0.04] text-sm text-white/70 hover:bg-white/[0.08] transition-colors"
            >
              Clear Selection
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_auto] gap-3 items-end">
            <label className="space-y-2 sm:col-span-2 lg:col-span-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">Bulk Action</span>
              <select
                value={bulkAction}
                onChange={(event) => {
                  setBulkAction(event.target.value as BulkInventoryAction);
                  setPendingBulkAction(null);
                  setBulkFormError(null);
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-relay-text focus:outline-none focus:ring-2 focus:ring-[#5f8fff]/40"
              >
                <option value="">Choose action</option>
                <option value="activate">Activate</option>
                <option value="deactivate">Deactivate</option>
                <option value="increase_price_percent">Increase price by %</option>
                <option value="decrease_price_percent">Decrease price by %</option>
                <option value="set_quantity_zero">Set quantity to 0</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">Percentage</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={bulkPercentage}
                onChange={(event) => {
                  setBulkPercentage(event.target.value);
                  setPendingBulkAction(null);
                  setBulkFormError(null);
                }}
                disabled={
                  bulkAction !== "increase_price_percent" && bulkAction !== "decrease_price_percent"
                }
                placeholder="10"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-relay-text placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#5f8fff]/40 disabled:opacity-40"
              />
            </label>

            <button
              onClick={handleReviewBulkAction}
              className="px-4 py-3 rounded-2xl bg-[#5f8fff] text-white text-sm font-semibold hover:bg-[#7ca6ff] transition-colors"
            >
              Review Action
            </button>
          </div>

          {bulkFormError && <p className="text-sm text-red-300">{bulkFormError}</p>}

          {pendingBulkAction && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 space-y-3">
              <p className="text-relay-text font-semibold">Confirm bulk update</p>
              <p className="text-sm text-white/70">
                {getBulkConfirmationCopy(
                  pendingBulkAction.action,
                  pendingBulkAction.percentage,
                  selectedListingIds.length,
                  selectedVariantIds.length
                )}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleApplyBulkAction}
                  disabled={bulkApplying}
                  className="px-4 py-2 rounded-full bg-[#5f8fff] text-white text-sm font-semibold hover:bg-[#7ca6ff] transition-colors disabled:opacity-50"
                >
                  {bulkApplying ? "Applying..." : "Confirm Bulk Action"}
                </button>
                <button
                  onClick={() => setPendingBulkAction(null)}
                  className="px-4 py-2 rounded-full border border-white/10 bg-white/[0.04] text-sm text-white/70 hover:bg-white/[0.08] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {bulkResult && (
        <div className="relay-card p-4 sm:p-5 space-y-3">
          <p className="text-relay-text font-semibold">Bulk update summary</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Metric label="Updated" value={`${bulkResult.updatedCount}`} />
            <Metric label="Skipped" value={`${bulkResult.skippedCount}`} />
            <Metric label="Errors" value={`${bulkResult.errors.length}`} />
          </div>
          {bulkResult.errors.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 space-y-2">
              {bulkResult.errors.map((error, index) => (
                <p key={`${error}-${index}`} className="text-sm text-white/70">
                  {error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {filteredListings.length === 0 ? (
        <div className="relay-card p-12 text-center">
          <p className="text-relay-text mb-2">No inventory matched that search or filter.</p>
          <p className="text-relay-subtle text-sm">
            Try another SKU or product keyword, or switch filters to see more items.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByBrand.map(([brand, brandListings]) => (
            <div key={brand} className="space-y-3">
              <button
                onClick={() => toggleBrand(brand)}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronRight
                    size={18}
                    className={`text-white/40 transition-transform ${expandedBrands.has(brand) ? "rotate-90" : ""}`}
                  />
                  <span className="text-[#f5f7fb] font-semibold">{brand}</span>
                  <span className="text-white/40 text-sm">
                    {brandListings.length} listing{brandListings.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </button>

              {expandedBrands.has(brand) && (
                <div className="space-y-4 pl-2">
                  {brandListings.map((listing) => {
                    const badge = STATUS_BADGES[listing.status];
                    const isExpanded = expandedListingId === listing.id;
                    const selectedVariantCount = listing.variants.filter(
                      (variant) => variant.id && selectedVariantIds.includes(variant.id)
                    ).length;

                    return (
                      <div key={listing.id} className="relay-card p-0 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/8 bg-white/[0.02]">
                  <label className="inline-flex items-center gap-3 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={selectedListingIds.includes(listing.id)}
                      onChange={() => handleToggleListingSelection(listing.id)}
                      className="h-4 w-4 rounded border-white/20 bg-transparent text-[#5f8fff] focus:ring-[#5f8fff]"
                    />
                    Select listing
                  </label>

                  {selectedVariantCount > 0 && (
                    <span className="text-xs text-white/45">
                      {selectedVariantCount} variant{selectedVariantCount === 1 ? "" : "s"} selected
                    </span>
                  )}
                </div>

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
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                        <div className="min-w-0">
                          <div className="mb-2">
                            <h2
                              className={`font-semibold leading-tight text-relay-text truncate xl:whitespace-nowrap ${getListingTitleClassName(
                                listing.displayName
                              )}`}
                              title={listing.displayName}
                            >
                              {listing.displayName}
                            </h2>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`${badge.color} border px-3 py-1 rounded-full text-xs font-semibold`}>
                              {badge.label}
                            </span>
                            {listing.inventory_review_status === "legacy_used_photo_review_required" && (
                              <span className="border border-amber-500/25 bg-amber-500/15 px-3 py-1 rounded-full text-xs font-semibold text-amber-300">
                                Seller Review Required
                              </span>
                            )}
                            {listing.activeQuantity > 0 && listing.activeQuantity <= LOW_STOCK_THRESHOLD && (
                              <span className="border border-amber-500/25 bg-amber-500/15 px-3 py-1 rounded-full text-xs font-semibold text-amber-300">
                                Low Stock
                              </span>
                            )}
                          </div>
                          {listing.inventory_review_status === "legacy_used_photo_review_required" && (
                            <p className="mb-2 text-sm text-amber-200/85">
                              {listing.inventory_review_notes ||
                                "Legacy used inventory was removed from checkout until each used pair has its own condition photo."}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/55">
                            <span>SKU: {listing.displaySku || "Custom / Manual"}</span>
                            <span>
                              {listing.listing_type === "sku" ? "Catalog Listing" : "Manual Listing"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap xl:flex-nowrap gap-2 xl:shrink-0 xl:self-start">
                          <Link
                            href={`/listing/${listing.id}`}
                            className="px-3 py-2 bg-[#5f8fff]/20 text-[#7ca6ff] hover:bg-[#5f8fff]/30 text-xs xl:text-sm font-medium rounded-full transition-colors border border-[#5f8fff]/30 inline-flex items-center gap-2 whitespace-nowrap"
                          >
                            <Eye size={14} />
                            View
                          </Link>
                          <Link
                            href={`/edit-listing/${listing.id}`}
                            className="px-3 py-2 bg-white/[0.04] text-white/75 hover:bg-white/[0.08] text-xs xl:text-sm font-medium rounded-full transition-colors border border-white/10 inline-flex items-center gap-2 whitespace-nowrap"
                          >
                            <Pencil size={14} />
                            Edit
                          </Link>
                          {listing.status !== "removed" && (
                            <button
                              onClick={() => handleToggleStatus(listing.id, listing.status)}
                              disabled={actionLoading === listing.id}
                              className="px-3 py-2 bg-white/[0.04] text-white/75 hover:bg-white/[0.08] text-xs xl:text-sm font-medium rounded-full transition-colors border border-white/10 disabled:opacity-50 whitespace-nowrap"
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
                              <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap xl:justify-end">
                                <span className="text-red-300 text-[11px] xl:text-xs whitespace-nowrap">Delete permanently?</span>
                                <button
                                  onClick={() => handleDelete(listing.id)}
                                  disabled={actionLoading === listing.id}
                                  className="px-3 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 text-xs xl:text-sm font-medium rounded-full transition-colors border border-red-500/30 disabled:opacity-50 whitespace-nowrap"
                                >
                                  {actionLoading === listing.id ? "Removing..." : "Confirm"}
                                </button>
                                <button
                                  onClick={() => setShowDeleteConfirm(null)}
                                  className="px-3 py-2 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] text-xs xl:text-sm font-medium rounded-full transition-colors border border-white/10 whitespace-nowrap"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowDeleteConfirm(listing.id)}
                                className="px-3 py-2 bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs xl:text-sm font-medium rounded-full transition-colors border border-red-500/25 inline-flex items-center gap-2 whitespace-nowrap"
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
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex items-start gap-3">
                                {variant.id && (
                                  <input
                                    type="checkbox"
                                    checked={selectedVariantIds.includes(variant.id)}
                                    onChange={() => handleToggleVariantSelection(variant.id!)}
                                    className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-[#5f8fff] focus:ring-[#5f8fff]"
                                  />
                                )}

                                <div>
                                  <p className="text-relay-text font-semibold">
                                    Size {variant.size} · {variant.condition === "used" ? "Used" : "New"}
                                  </p>
                                  <p className="text-sm text-white/50 mt-1">
                                    {variant.isActive && variant.quantity > 0
                                      ? "Variant available for purchase"
                                      : "Variant unavailable for purchase"}
                                  </p>
                                </div>
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

                            {variant.id ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
                                <label className="space-y-2">
                                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                                    Price
                                  </span>
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={variantDrafts[variant.id]?.price ?? String(variant.price)}
                                    onChange={(event) =>
                                      updateVariantDraft(variant.id!, { price: event.target.value })
                                    }
                                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-relay-text focus:outline-none focus:ring-2 focus:ring-[#5f8fff]/40"
                                  />
                                </label>

                                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                                  <label className="space-y-2">
                                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                                      Quantity
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={variantDrafts[variant.id]?.quantity ?? String(variant.quantity)}
                                      onChange={(event) =>
                                        updateVariantDraft(variant.id!, { quantity: event.target.value })
                                      }
                                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-relay-text focus:outline-none focus:ring-2 focus:ring-[#5f8fff]/40"
                                    />
                                  </label>

                                  <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-relay-text">
                                    <input
                                      type="checkbox"
                                      checked={variantDrafts[variant.id]?.isActive ?? variant.isActive}
                                      onChange={(event) =>
                                        updateVariantDraft(variant.id!, { isActive: event.target.checked })
                                      }
                                      className="h-4 w-4 rounded border-white/20 bg-transparent text-[#5f8fff] focus:ring-[#5f8fff]"
                                    />
                                    Active
                                  </label>
                                </div>

                                <button
                                  onClick={() => handleSaveVariant(listing.id, variant)}
                                  disabled={savingVariantId === variant.id}
                                  className="px-4 py-3 rounded-2xl bg-[#5f8fff] text-white text-sm font-semibold hover:bg-[#7ca6ff] transition-colors disabled:opacity-50"
                                >
                                  {savingVariantId === variant.id ? "Saving..." : "Save Variant"}
                                </button>
                              </div>
                            ) : (
                              <p className="text-sm text-white/45">
                                This legacy variant cannot be edited inline until it has a normalized variant record.
                              </p>
                            )}

                            {variant.id && variantMessages[variant.id] && (
                              <p
                                className={`text-sm ${
                                  variantMessages[variant.id].type === "error"
                                    ? "text-red-300"
                                    : "text-emerald-300"
                                }`}
                              >
                                {variantMessages[variant.id].message}
                              </p>
                            )}
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
          ))}
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

function getListingTitleClassName(displayName: string) {
  if (displayName.length > 90) {
    return "text-sm xl:text-base";
  }

  if (displayName.length > 70) {
    return "text-base xl:text-lg";
  }

  if (displayName.length > 48) {
    return "text-lg xl:text-xl";
  }

  return "text-xl";
}

function getSortablePrice(price: number) {
  return price > 0 ? price : Number.MAX_SAFE_INTEGER;
}

function formatInventoryListings(listings: Listing[]): InventoryListingRow[] {
  const dedupedListings = dedupeSkuListings(listings);

  return dedupedListings.map((listing) => {
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
        condition: variant.condition,
        isActive: variant.isActive,
      })),
    } satisfies InventoryListingRow;
  });
}

function buildVariantDrafts(listings: InventoryListingRow[]) {
  return listings.reduce<Record<string, VariantDraft>>((drafts, listing) => {
    for (const variant of listing.variants) {
      if (!variant.id) {
        continue;
      }

      drafts[variant.id] = {
        price: String(variant.price),
        quantity: String(variant.quantity),
        isActive: variant.isActive,
      };
    }

    return drafts;
  }, {});
}

function getSelectionSummary(selectedListingCount: number, selectedVariantCount: number) {
  const parts = [];

  if (selectedListingCount > 0) {
    parts.push(`${selectedListingCount} listing${selectedListingCount === 1 ? "" : "s"}`);
  }

  if (selectedVariantCount > 0) {
    parts.push(`${selectedVariantCount} variant${selectedVariantCount === 1 ? "" : "s"}`);
  }

  return `${parts.join(" and ")} selected. Listing selections apply to every variant under that listing.`;
}

function getBulkConfirmationCopy(
  action: Exclude<BulkInventoryAction, "">,
  percentage: number | undefined,
  selectedListingCount: number,
  selectedVariantCount: number
) {
  const targetSummary = getSelectionSummary(selectedListingCount, selectedVariantCount);

  switch (action) {
    case "activate":
      return `Activate the selected inventory. ${targetSummary}`;
    case "deactivate":
      return `Deactivate the selected inventory. ${targetSummary}`;
    case "increase_price_percent":
      return `Increase selected prices by ${percentage}%. ${targetSummary}`;
    case "decrease_price_percent":
      return `Decrease selected prices by ${percentage}%. ${targetSummary}`;
    case "set_quantity_zero":
      return `Set the selected inventory quantities to 0 and make them unavailable for purchase. ${targetSummary}`;
    default:
      return targetSummary;
  }
}
