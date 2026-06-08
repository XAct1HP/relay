"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APPROX_SIZINGS, BOX_CONDITIONS, BRANDS, CONDITIONS, SHOE_SIZES } from "@/lib/constants";
import { buildLegacySizes, fetchListingVariants, isManualListingBrand, normalizeSku, replaceListingVariants } from "@/lib/listings";
import type { Listing, ListingVariant, ListingUsedItem } from "@/types";
import type { UsedInventoryCondition } from "@/lib/inventory";
import { calculateFees, formatCurrency } from "@/lib/utils";
import { updateSkuListingInventoryAction } from "@/app/edit-listing/[id]/actions";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  DollarSign,
  Plus,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";

interface ManualSizeRow {
  id: string;
  size: string;
  price: number;
  quantity: number;
}

interface CatalogDsRow {
  id: string;
  size: string;
  price: number;
  quantity: number;
}

interface CatalogUsedRow {
  id: string;
  persistedId?: string;
  size: string;
  price: number;
  condition: UsedInventoryCondition;
  photoUrl: string;
  newPhotoFile: File | null;
}

const USED_PAIR_CONDITION_OPTIONS: UsedInventoryCondition[] = [
  "like_new",
  "used_excellent",
  "used_good",
  "used_fair",
];

function createRowId() {
  return Math.random().toString(36).slice(2);
}

function createManualSizeRow(): ManualSizeRow {
  return {
    id: createRowId(),
    size: "",
    price: 0,
    quantity: 1,
  };
}

function createCatalogDsRow(): CatalogDsRow {
  return {
    id: createRowId(),
    size: "",
    price: 0,
    quantity: 1,
  };
}

function createCatalogUsedRow(): CatalogUsedRow {
  return {
    id: createRowId(),
    size: "",
    price: 0,
    condition: "used_good",
    photoUrl: "",
    newPhotoFile: null,
  };
}

function getCatalogListingCondition(
  dsRows: CatalogDsRow[],
  usedRows: CatalogUsedRow[]
): "new" | "used_good" | "mixed" | "" {
  if (dsRows.length > 0 && usedRows.length > 0) {
    return "mixed";
  }

  if (usedRows.length > 0) {
    return "used_good";
  }

  if (dsRows.length > 0) {
    return "new";
  }

  return "";
}

function getCatalogInventoryLabel(condition: "new" | "used_good" | "mixed" | "") {
  if (condition === "mixed") {
    return "DS + Used";
  }

  if (condition === "used_good") {
    return "Used";
  }

  if (condition === "new") {
    return "DS / New";
  }

  return "Not set";
}

function getUsedConditionLabel(value: UsedInventoryCondition) {
  return CONDITIONS[value].label;
}

async function uploadListingPhoto(file: File): Promise<{ url: string } | { error: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/listings/upload-photo", {
    method: "POST",
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

  if (!response.ok || !data?.url) {
    return {
      error: data?.error || "Failed to upload photo.",
    };
  }

  return { url: data.url };
}

export default function EditListingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [legacyUsedRowsDetected, setLegacyUsedRowsDetected] = useState(false);

  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [modelName, setModelName] = useState("");
  const [nickname, setNickname] = useState("");
  const [condition, setCondition] = useState("");
  const [boxCondition, setBoxCondition] = useState("");
  const [approximateSizing, setApproximateSizing] = useState("");
  const [sizes, setSizes] = useState<ManualSizeRow[]>([]);
  const [catalogDsRows, setCatalogDsRows] = useState<CatalogDsRow[]>([]);
  const [catalogUsedRows, setCatalogUsedRows] = useState<CatalogUsedRow[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchListing() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("listings")
        .select("*, listing_used_items(id, size, price, quantity, condition, condition_photo_url, is_active)")
        .eq("id", params.id)
        .single();

      if (error || !data) {
        console.error("Error fetching listing:", error);
        setLoading(false);
        return;
      }

      if (data.seller_id !== currentUser?.id) {
        router.push("/my-listings");
        return;
      }

      const listing = data as Listing;
      setBrand(listing.brand);
      setSku(listing.sku || "");
      setModelName(listing.model);
      setNickname(listing.nickname || "");
      setCondition(listing.condition);
      setBoxCondition(listing.box_condition);
      setApproximateSizing(listing.approx_sizing || "");
      setDescription(listing.description || "");
      setExistingImages(listing.images || []);

      const variantRows = await fetchListingVariants(supabase, params.id);
      const typedVariantRows = variantRows as ListingVariant[];
      const dsRows = typedVariantRows
        .filter((row) => row.condition !== "used" && row.is_active !== false)
        .map((row) => ({
          id: row.id || createRowId(),
          size: row.size?.toString() || "",
          price: Number(row.price) || 0,
          quantity: Number(row.quantity) || 1,
        }));

      const usedItemRows = (((listing.listing_used_items as ListingUsedItem[] | undefined) || []) as ListingUsedItem[])
        .filter((row) => row.is_active !== false)
        .map((row) => ({
          id: createRowId(),
          persistedId: row.id,
          size: row.size,
          price: Number(row.price) || 0,
          condition: row.condition,
          photoUrl: row.condition_photo_url,
          newPhotoFile: null,
        }));

      const legacyUsedRows = typedVariantRows
        .filter((row) => row.condition === "used" && row.is_active !== false)
        .flatMap((row) =>
          Array.from({ length: Math.max(1, Number(row.quantity) || 1) }, () => ({
            id: createRowId(),
            size: row.size?.toString() || "",
            price: Number(row.price) || 0,
            condition: "used_good" as UsedInventoryCondition,
            photoUrl: "",
            newPhotoFile: null,
          }))
        );

      setCatalogDsRows(dsRows);
      setCatalogUsedRows([...usedItemRows, ...legacyUsedRows]);
      setLegacyUsedRowsDetected(legacyUsedRows.length > 0);

      const sourceRows = typedVariantRows.length > 0 ? typedVariantRows : (((listing.sizes as any[]) || []) as any[]);
      setSizes(
        sourceRows.map((row: any, index: number) => ({
          id: row.id || `existing-${index}`,
          size: row.size?.toString() || "",
          price: Number(row.price) || 0,
          quantity: Number(row.quantity) || 1,
        }))
      );

      setLoading(false);
    }

    if (currentUser?.id) {
      fetchListing();
    } else if (currentUser === null) {
      setLoading(false);
    }
  }, [currentUser?.id, params.id, router]);

  const isManualListing = isManualListingBrand(brand);
  const catalogListingCondition = getCatalogListingCondition(catalogDsRows, catalogUsedRows);
  const isSkuInventoryValid =
    (catalogDsRows.length > 0 || catalogUsedRows.length > 0) &&
    catalogDsRows.every((row) => row.size && row.price > 0 && row.quantity > 0) &&
    catalogUsedRows.every((row) => row.size && row.price > 0 && row.photoUrl);

  const addSize = () => {
    setSizes((prev) => [...prev, createManualSizeRow()]);
  };

  const updateSize = (id: string, field: keyof Omit<ManualSizeRow, "id">, value: string | number) => {
    setSizes((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeSize = (id: string) => {
    setSizes((prev) => prev.filter((row) => row.id !== id));
  };

  const addCatalogDsRow = () => {
    setCatalogDsRows((prev) => [...prev, createCatalogDsRow()]);
  };

  const updateCatalogDsRow = (
    id: string,
    field: keyof Omit<CatalogDsRow, "id">,
    value: string | number
  ) => {
    setCatalogDsRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeCatalogDsRow = (id: string) => {
    setCatalogDsRows((prev) => prev.filter((row) => row.id !== id));
  };

  const addCatalogUsedRow = () => {
    setCatalogUsedRows((prev) => [...prev, createCatalogUsedRow()]);
  };

  const updateCatalogUsedRow = (
    id: string,
    field: "size" | "price" | "condition",
    value: string | number
  ) => {
    setCatalogUsedRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const updateCatalogUsedPhoto = (id: string, file: File | null) => {
    setCatalogUsedRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              photoUrl: file ? URL.createObjectURL(file) : "",
              newPhotoFile: file,
            }
          : row
      )
    );
  };

  const removeCatalogUsedRow = (id: string) => {
    setCatalogUsedRows((prev) => prev.filter((row) => row.id !== id));
  };

  const removeExistingImage = (index: number) => {
    setExistingImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleNewPhotoUpload = async (files: FileList | null) => {
    if (!files || !currentUser?.id) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") || existingImages.length >= 10) continue;

      const uploadResult = await uploadListingPhoto(file);

      if ("error" in uploadResult) {
        console.error("Upload error:", uploadResult.error);
        continue;
      }

      setExistingImages((prev) => [...prev, uploadResult.url]);
    }
  };

  const handleSave = async () => {
    if (!currentUser?.id) return;
    setSaving(true);

    try {
      const supabase = createClient();
      const normalizedSku = normalizeSku(sku);

      if (!isManualListing && !normalizedSku) {
        alert("SKU is required for standard sneaker listings.");
        return;
      }

      if (isManualListing) {
        const legacySizes = buildLegacySizes(
          sizes.map((row) => ({
            size: row.size,
            price: row.price,
            quantity: row.quantity,
          }))
        );

        const { error } = await supabase
          .from("listings")
          .update({
            sku: null,
            brand,
            model: modelName,
            nickname: nickname || null,
            condition,
            box_condition: boxCondition,
            approx_sizing: approximateSizing,
            description,
            images: existingImages,
            sizes: legacySizes,
          })
          .eq("id", params.id)
          .eq("seller_id", currentUser.id);

        if (error) {
          throw error;
        }

        await replaceListingVariants(
          supabase,
          params.id,
          sizes.map((row) => ({
            size: row.size,
            price: row.price,
            quantity: row.quantity,
          }))
        );

        router.push("/my-listings");
        return;
      }

      if (!isSkuInventoryValid) {
        alert("Complete every DS/new row and add a unique condition photo for every used pair before saving.");
        return;
      }

      const uploadedUsedItems: Array<{
        id?: string;
        size: string;
        price: number;
        condition: UsedInventoryCondition;
        conditionPhotoUrl: string;
      }> = [];

      for (const usedRow of catalogUsedRows) {
        if (!usedRow.photoUrl) {
          alert("Every used pair needs its own condition photo before saving.");
          return;
        }

        let conditionPhotoUrl = usedRow.photoUrl;
        if (usedRow.newPhotoFile) {
          const uploadResult = await uploadListingPhoto(usedRow.newPhotoFile);
          if ("error" in uploadResult) {
            console.error("Upload error:", uploadResult.error);
            alert(`Photo upload failed: ${uploadResult.error}`);
            return;
          }

          conditionPhotoUrl = uploadResult.url;
        }

        uploadedUsedItems.push({
          id: usedRow.persistedId,
          size: usedRow.size,
          price: usedRow.price,
          condition: usedRow.condition,
          conditionPhotoUrl,
        });
      }

      const result = await updateSkuListingInventoryAction({
        listingId: params.id,
        sku: sku,
        brand,
        model: modelName,
        nickname: nickname || undefined,
        description,
        images: existingImages,
        boxCondition: boxCondition as "perfect" | "good" | "damaged" | "no_box",
        approximateSizing: approximateSizing as "lightweight" | "normal" | "heavy",
        variants: catalogDsRows.map((row) => ({
          size: row.size,
          price: row.price,
          quantity: row.quantity,
        })),
        usedItems: uploadedUsedItems,
      });

      if (!result.success) {
        alert(result.error);
        return;
      }

      router.push("/my-listings");
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="relay-empty text-center">Loading listing...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="mb-8 flex items-center gap-4">
        <button
          onClick={() => router.push("/my-listings")}
          className="p-2 rounded-lg hover:bg-white/[0.08] transition-colors text-white/60 hover:text-relay-text"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="relay-eyebrow text-relay-accent">EDIT</div>
          <h1 className="relay-title text-relay-text mt-1">Edit Listing</h1>
        </div>
      </div>

      <div className="relay-card p-8 space-y-8">
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-relay-text border-b border-white/10 pb-3">Shoe Details</h2>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Brand</label>
            <div className="relative">
              <select value={brand} onChange={(event) => setBrand(event.target.value)} className="relay-select pr-10 appearance-none">
                <option value="">Select a brand...</option>
                {BRANDS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
            </div>
          </div>

          {!isManualListing && (
            <div>
              <label className="block text-sm font-medium text-relay-text mb-2">SKU</label>
              <input
                type="text"
                value={sku}
                onChange={(event) => setSku(event.target.value.toUpperCase())}
                className="relay-input"
                placeholder="e.g., DZ5485-612"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Model Name</label>
            <input type="text" value={modelName} onChange={(event) => setModelName(event.target.value)} className="relay-input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Nickname (Optional)</label>
            <input type="text" value={nickname} onChange={(event) => setNickname(event.target.value)} className="relay-input" />
          </div>

          {isManualListing ? (
            <div>
              <label className="block text-sm font-medium text-relay-text mb-2">Shoe Condition</label>
              <div className="relative">
                <select value={condition} onChange={(event) => setCondition(event.target.value)} className="relay-select pr-10 appearance-none">
                  <option value="">Select condition...</option>
                  {Object.entries(CONDITIONS).map(([key, { label, description }]) => (
                    <option key={key} value={key}>{label} - {description}</option>
                  ))}
                </select>
                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-sm font-medium text-relay-text mb-1">Inventory condition is derived from your rows</p>
              <p className="text-xs text-relay-subtle leading-relaxed">
                Current mix: {getCatalogInventoryLabel(catalogListingCondition)}. DS/new rows stay grouped by size and quantity. Used pairs must stay itemized with one photo per pair.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Box Condition</label>
            <div className="relative">
              <select value={boxCondition} onChange={(event) => setBoxCondition(event.target.value)} className="relay-select pr-10 appearance-none">
                <option value="">Select box condition...</option>
                {Object.entries(BOX_CONDITIONS).map(([key, { label, description }]) => (
                  <option key={key} value={key}>{label} - {description}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Approximate Sizing</label>
            <div className="relative">
              <select value={approximateSizing} onChange={(event) => setApproximateSizing(event.target.value)} className="relay-select pr-10 appearance-none">
                <option value="">Select sizing...</option>
                {Object.entries(APPROX_SIZINGS).map(([key, { label, description }]) => (
                  <option key={key} value={key}>{label} - {description}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-relay-text border-b border-white/10 pb-3">
            {isManualListing ? "Sizes & Pricing" : "Inventory"}
          </h2>

          {!isManualListing && legacyUsedRowsDetected && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-200 mb-1">Legacy used inventory needs itemized photos</p>
              <p className="text-xs text-amber-100/80 leading-relaxed">
                Relay split your old used quantity rows into individual used pair drafts below. Add a separate condition photo for each pair before saving.
              </p>
            </div>
          )}

          {isManualListing ? (
            <>
              {sizes.map((sizeRow) => {
                const fees = sizeRow.price ? calculateFees(sizeRow.price) : null;
                return (
                  <div key={sizeRow.id} className="border border-white/5 rounded-xl p-4 bg-white/[0.02]">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-medium text-relay-subtle mb-2">Size</label>
                        <div className="relative">
                          <select value={sizeRow.size} onChange={(event) => updateSize(sizeRow.id, "size", event.target.value)} className="relay-select pr-8 appearance-none">
                            <option value="">Select...</option>
                            {SHOE_SIZES.map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                          </select>
                          <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={16} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-relay-subtle mb-2">Price</label>
                        <div className="relative">
                          <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-relay-subtle" />
                          <input type="number" value={sizeRow.price || ""} onChange={(event) => updateSize(sizeRow.id, "price", parseFloat(event.target.value) || 0)} className="relay-input" style={{ paddingLeft: "2rem" }} min="0" step="0.01" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-relay-subtle mb-2">Qty</label>
                        <div className="flex gap-2">
                          <input type="number" value={sizeRow.quantity || ""} onChange={(event) => updateSize(sizeRow.id, "quantity", parseInt(event.target.value, 10) || 1)} className="relay-input" min="1" />
                          <button type="button" onClick={() => removeSize(sizeRow.id)} className="px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-relay-text">
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                    {fees && sizeRow.price > 0 && (
                      <div className="text-xs space-y-1 pt-3 border-t border-white/5">
                        <div className="flex justify-between text-relay-muted"><span>Relay fee (1%):</span><span>{formatCurrency(fees.platformFee)}</span></div>
                        <div className="flex justify-between text-relay-muted"><span>Stripe fee (3% + $0.30):</span><span>{formatCurrency(fees.stripeFee)}</span></div>
                        <div className="flex justify-between text-emerald-400 font-medium"><span>Your earnings:</span><span>{formatCurrency(fees.sellerEarnings)}</span></div>
                      </div>
                    )}
                  </div>
                );
              })}

              <button type="button" onClick={addSize} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 hover:border-relay-accent/50 hover:bg-relay-accent/5 transition-all text-relay-accent font-medium">
                <Plus size={18} />
                Add Size
              </button>
            </>
          ) : (
            <div className="space-y-8">
              <div className="rounded-2xl border border-relay-accent/20 bg-relay-accent/5 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-relay-accent" />
                  <p className="text-sm font-semibold text-relay-text">Itemized used inventory rules</p>
                </div>
                <div className="space-y-1 text-xs text-relay-subtle leading-relaxed">
                  <p>DS/new rows can use size, quantity, and price.</p>
                  <p>Used rows always represent one physical pair, so quantity is fixed at 1.</p>
                  <p>One used condition photo can never be shared across multiple used pairs.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-relay-text">DS / New Inventory</h3>
                    <p className="text-xs text-relay-subtle mt-1">Grouped inventory by size, quantity, and price.</p>
                  </div>
                  <button type="button" onClick={addCatalogDsRow} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-relay-accent hover:border-relay-accent/50 hover:bg-relay-accent/5 transition-all">
                    <Plus size={16} />
                    Add DS Row
                  </button>
                </div>

                {catalogDsRows.length > 0 ? (
                  <div className="space-y-4">
                    {catalogDsRows.map((row) => {
                      const fees = row.price ? calculateFees(row.price) : null;
                      return (
                        <div key={row.id} className="border border-white/5 rounded-xl p-4 bg-white/[0.02]">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-medium text-relay-subtle mb-2">Size</label>
                              <div className="relative">
                                <select value={row.size} onChange={(event) => updateCatalogDsRow(row.id, "size", event.target.value)} className="relay-select pr-8 appearance-none">
                                  <option value="">Select...</option>
                                  {SHOE_SIZES.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                  ))}
                                </select>
                                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={16} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-relay-subtle mb-2">Price</label>
                              <div className="relative">
                                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-relay-subtle" />
                                <input type="number" value={row.price || ""} onChange={(event) => updateCatalogDsRow(row.id, "price", parseFloat(event.target.value) || 0)} className="relay-input" style={{ paddingLeft: "2rem" }} min="0" step="0.01" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-relay-subtle mb-2">Quantity</label>
                              <div className="flex gap-2">
                                <input type="number" value={row.quantity || ""} onChange={(event) => updateCatalogDsRow(row.id, "quantity", parseInt(event.target.value, 10) || 1)} className="relay-input" min="1" />
                                <button type="button" onClick={() => removeCatalogDsRow(row.id)} className="px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-relay-text">
                                  <X size={18} />
                                </button>
                              </div>
                            </div>
                          </div>
                          {fees && row.price > 0 && (
                            <div className="text-xs space-y-1 pt-3 border-t border-white/5">
                              <div className="flex justify-between text-relay-muted"><span>Relay fee (1%):</span><span>{formatCurrency(fees.platformFee)}</span></div>
                              <div className="flex justify-between text-relay-muted"><span>Stripe fee (3% + $0.30):</span><span>{formatCurrency(fees.stripeFee)}</span></div>
                              <div className="flex justify-between text-emerald-400 font-medium"><span>Your earnings per pair:</span><span>{formatCurrency(fees.sellerEarnings)}</span></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-relay-subtle">
                    No DS/new rows yet.
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-relay-text">Used Pairs</h3>
                    <p className="text-xs text-relay-subtle mt-1">One row per physical pair. Every row needs its own photo.</p>
                  </div>
                  <button type="button" onClick={addCatalogUsedRow} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-relay-accent hover:border-relay-accent/50 hover:bg-relay-accent/5 transition-all">
                    <Plus size={16} />
                    Add Used Pair
                  </button>
                </div>

                {catalogUsedRows.length > 0 ? (
                  <div className="space-y-4">
                    {catalogUsedRows.map((row, index) => {
                      const fees = row.price ? calculateFees(row.price) : null;
                      return (
                        <div key={row.id} className="border border-white/5 rounded-xl p-4 bg-white/[0.02]">
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                              <p className="text-sm font-medium text-relay-text">Used Pair #{index + 1}</p>
                              <p className="text-xs text-relay-subtle mt-1">Quantity is fixed at 1 for used inventory.</p>
                            </div>
                            <button type="button" onClick={() => removeCatalogUsedRow(row.id)} className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-relay-text">
                              <X size={18} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-medium text-relay-subtle mb-2">Size</label>
                              <div className="relative">
                                <select value={row.size} onChange={(event) => updateCatalogUsedRow(row.id, "size", event.target.value)} className="relay-select pr-8 appearance-none">
                                  <option value="">Select...</option>
                                  {SHOE_SIZES.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                  ))}
                                </select>
                                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={16} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-relay-subtle mb-2">Price</label>
                              <div className="relative">
                                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-relay-subtle" />
                                <input type="number" value={row.price || ""} onChange={(event) => updateCatalogUsedRow(row.id, "price", parseFloat(event.target.value) || 0)} className="relay-input" style={{ paddingLeft: "2rem" }} min="0" step="0.01" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-relay-subtle mb-2">Condition</label>
                              <div className="relative">
                                <select value={row.condition} onChange={(event) => updateCatalogUsedRow(row.id, "condition", event.target.value as UsedInventoryCondition)} className="relay-select pr-8 appearance-none">
                                  {USED_PAIR_CONDITION_OPTIONS.map((item) => (
                                    <option key={item} value={item}>{CONDITIONS[item].label}</option>
                                  ))}
                                </select>
                                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={16} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                            <label className="block text-xs font-medium text-relay-subtle mb-2">Condition Photo *</label>
                            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-relay-text hover:border-relay-accent/50 hover:bg-relay-accent/5 transition-all">
                                <Camera size={16} className="text-relay-accent" />
                                {row.photoUrl ? "Replace Photo" : "Upload Photo"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0] || null;
                                    updateCatalogUsedPhoto(row.id, file);
                                    event.currentTarget.value = "";
                                  }}
                                />
                              </label>
                              <p className="text-xs text-relay-subtle leading-relaxed">
                                This photo belongs only to this used pair and cannot be reused for another used row.
                              </p>
                            </div>

                            {row.photoUrl ? (
                              <div className="mt-4 max-w-[220px]">
                                <div className="relative rounded-xl overflow-hidden bg-white/[0.02] border border-white/10 aspect-square">
                                  <img src={row.photoUrl} alt={`Used pair ${index + 1}`} className="w-full h-full object-cover" />
                                  <button type="button" onClick={() => updateCatalogUsedPhoto(row.id, null)} className="absolute top-2 right-2 rounded-lg bg-black/50 p-2 text-white hover:bg-black/70 transition-colors">
                                    <X size={16} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-amber-200">A unique condition photo is required before you can save this used pair.</p>
                            )}
                          </div>

                          {fees && row.price > 0 && (
                            <div className="text-xs space-y-1 pt-4">
                              <div className="flex justify-between text-relay-muted"><span>Relay fee (1%):</span><span>{formatCurrency(fees.platformFee)}</span></div>
                              <div className="flex justify-between text-relay-muted"><span>Stripe fee (3% + $0.30):</span><span>{formatCurrency(fees.stripeFee)}</span></div>
                              <div className="flex justify-between text-emerald-400 font-medium"><span>Your earnings:</span><span>{formatCurrency(fees.sellerEarnings)}</span></div>
                              <div className="pt-1 text-relay-subtle">Condition: {getUsedConditionLabel(row.condition)}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-relay-subtle">
                    No used pairs yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-relay-text border-b border-white/10 pb-3">Photos</h2>

          {isManualListing ? (
            <>
              {existingImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {existingImages.map((url, index) => (
                    <div key={url + index} className="relative group rounded-xl overflow-hidden bg-white/[0.02] border border-white/10 aspect-square">
                      <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                      {index === 0 && (
                        <div className="absolute top-2 left-2">
                          <span className="relay-badge-info text-xs">Cover</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button type="button" onClick={() => removeExistingImage(index)} className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors">
                          <X size={18} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-2 border-dashed rounded-2xl p-6 border-white/20 bg-white/[0.02] hover:border-white/30 transition-all">
                <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={(event) => handleNewPhotoUpload(event.target.files)} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center gap-2 text-center">
                  <Camera size={28} className="text-relay-accent" />
                  <span className="font-medium text-relay-text text-sm">Add more photos</span>
                  <span className="text-xs text-relay-subtle">{existingImages.length} of 10 photos</span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {existingImages.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {existingImages.map((url, index) => (
                    <div key={url + index} className="relative rounded-xl overflow-hidden bg-white/[0.02] border border-white/10 aspect-square">
                      <img src={url} alt={`Listing image ${index + 1}`} className="w-full h-full object-cover" />
                      {index === 0 && (
                        <div className="absolute top-2 left-2">
                          <span className="relay-badge-info text-xs">Primary</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-relay-subtle">
                  No listing-level gallery images are currently stored.
                </div>
              )}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-sm font-medium text-relay-text mb-1">Used pair photos are managed above</p>
                <p className="text-xs text-relay-subtle leading-relaxed">
                  DS/new inventory can keep the shared listing gallery here. Used condition photos must stay attached to individual used rows and cannot be uploaded once for the whole listing.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-relay-text border-b border-white/10 pb-3">Description</h2>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className="relay-textarea" placeholder="Describe the condition, release, sizing notes, or anything buyers should know." />
        </div>

        <div className="flex gap-4 pt-6 border-t border-white/10">
          <button onClick={() => router.push("/my-listings")} className="relay-button-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="relay-button-accent flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <Save size={18} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
