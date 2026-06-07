"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { BRANDS, BOX_CONDITIONS, APPROX_SIZINGS, SHOE_SIZES } from "@/lib/constants";
import { buildLegacySizes, isManualListingBrand, mergeListingVariants } from "@/lib/listings";
import { calculateFees, formatCurrency } from "@/lib/utils";
import { publishCatalogListingAction } from "@/app/sell/actions";
import { Camera, Plus, X, ChevronLeft, ChevronRight as ChevronRightIcon, DollarSign, Package, Check, ChevronRight, ScanSearch, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";
import { normalizeSku } from "../../../lib/sneakers/normalizeSku";

interface SizeRow {
  id: string;
  size: string;
  price: number;
  quantity: number;
  condition: "new" | "used";
}

interface UploadedPhoto {
  id: string;
  url: string;
  file: File;
}

interface LookedUpSneaker {
  id: string;
  sku: string;
  normalized_sku: string;
  brand: string | null;
  name: string | null;
  model: string | null;
  nickname: string | null;
  colorway: string | null;
  gender: string | null;
  release_date: string | null;
  retail_price: number | null;
  description: string | null;
  gallery_images: string[];
  image_url: string | null;
  source: "kicksdb";
}

type SkuLookupResponse =
  | {
      found: true;
      source: "local" | "kicksdb";
      sneaker: LookedUpSneaker;
    }
  | {
      found: false;
      source: null;
      sneaker: null;
    };

type Step = 1 | 2 | 3 | 4;
type ListingMode = "catalog" | "manual";

const STEP_LABELS: Record<ListingMode, string[]> = {
  catalog: ["Catalog Product", "Sizes & Pricing", "Media & Notes", "Review & Publish"],
  manual: ["Shoe Details", "Sizes & Pricing", "Photos & Description", "Review & Publish"],
};

const CATALOG_CONDITION_OPTIONS = [
  { value: "new", label: "New", description: "Relay uses the product gallery images only." },
  { value: "used_good", label: "Used", description: "Add at least one seller photo so buyers can assess condition." },
  { value: "mixed", label: "New + Used", description: "Set the condition for each size row in the next step." },
] as const;

const MANUAL_CONDITION_OPTIONS = [
  { value: "new", label: "New", description: "Never worn, original box and tags" },
  { value: "used_good", label: "Used", description: "Wear is visible, but the pair remains sellable." },
] as const;

function getConditionDisplayLabel(value: string): string {
  if (value === "new") {
    return "New";
  }

  if (value === "mixed") {
    return "New + Used";
  }

  return value ? "Used" : "";
}

function getVariantConditionLabel(value: "new" | "used"): string {
  return value === "used" ? "Used" : "New";
}

function getDefaultVariantCondition(listingCondition: string): "new" | "used" {
  return listingCondition === "used_good" ? "used" : "new";
}

function getConditionPhotoLimitMessage(): string {
  return "Used and mixed catalog listings require exactly 1 seller condition photo.";
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

export default function SellPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [isPublishing, setIsPublishing] = useState(false);
  const [listingMode, setListingMode] = useState<ListingMode>("catalog");
  const [skuLookupLoading, setSkuLookupLoading] = useState(false);
  const [skuLookupMessage, setSkuLookupMessage] = useState<string | null>(null);
  const [skuLookupSource, setSkuLookupSource] = useState<"local" | "kicksdb" | null>(null);

  // Step 1: Shoe Details
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [modelName, setModelName] = useState("");
  const [catalogModel, setCatalogModel] = useState("");
  const [nickname, setNickname] = useState("");
  const [colorway, setColorway] = useState("");
  const [gender, setGender] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [lookupGalleryImages, setLookupGalleryImages] = useState<string[]>([]);
  const [lookupImageUrl, setLookupImageUrl] = useState("");
  const [lookedUpSneakerId, setLookedUpSneakerId] = useState<string | null>(null);
  const [lastLookedUpNormalizedSku, setLastLookedUpNormalizedSku] = useState<string | null>(null);
  const [condition, setCondition] = useState("");
  const [boxCondition, setBoxCondition] = useState("");
  const [approximateSizing, setApproximateSizing] = useState("");

  // Step 2: Sizes & Pricing
  const [sizes, setSizes] = useState<SizeRow[]>([]);

  // Step 3: Photos & Description
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [draggedPhotos, setDraggedPhotos] = useState<{ [key: string]: number }>({});
  const [description, setDescription] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // UI State
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishedNeedsReview, setPublishedNeedsReview] = useState(false);
  const [publishedWasMerged, setPublishedWasMerged] = useState(false);
  const dragOverCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCatalogListing = listingMode === "catalog";
  const isManualListing = listingMode === "manual";
  const requiresReview = isManualListing && isManualListingBrand(brand);
  const currentStepLabels = STEP_LABELS[listingMode];

  // Step 1 Validation
  const normalizedSku = normalizeSku(sku);
  const linkedSneakerId = lastLookedUpNormalizedSku === normalizedSku ? lookedUpSneakerId : null;
  const activeLookupGalleryImages = lastLookedUpNormalizedSku === normalizedSku ? lookupGalleryImages : [];
  const activeLookupImageUrl = lastLookedUpNormalizedSku === normalizedSku ? lookupImageUrl : "";
  const isUsedCatalogListing = isCatalogListing && condition === "used_good";
  const isMixedCatalogListing = isCatalogListing && condition === "mixed";
  const shouldUseSellerPhotos = isManualListing || isUsedCatalogListing || isMixedCatalogListing;
  const maxSellerPhotoCount = isCatalogListing && (isUsedCatalogListing || isMixedCatalogListing) ? 1 : 10;
  const hasUnusedSellerPhotos = isCatalogListing && condition === "new" && photos.length > 0;
  const isStep1Valid =
    condition &&
    boxCondition &&
    approximateSizing &&
    !!modelName &&
    !!brand &&
    (isCatalogListing ? !!normalizedSku : true);

  // Step 2 Validation
  const isStep2Valid =
    sizes.length > 0 &&
    sizes.every((s) => s.size && s.price > 0 && s.quantity > 0 && (!isMixedCatalogListing || Boolean(s.condition)));

  // Step 3 Validation
  const isStep3Valid =
    description.trim().length >= 4 &&
    (isManualListing
      ? photos.length > 0
      : isUsedCatalogListing || isMixedCatalogListing
      ? photos.length === 1
      : true);

  const handleNextStep = () => {
    if (currentStep === 1 && isStep1Valid) {
      setCurrentStep(2);
    } else if (currentStep === 2 && isStep2Valid) {
      setCurrentStep(3);
    } else if (currentStep === 3 && isStep3Valid) {
      setCurrentStep(4);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  const switchListingMode = (nextMode: ListingMode) => {
    setListingMode(nextMode);
    setCurrentStep(1);
    setSkuLookupMessage(null);
    setSkuLookupSource(null);
    setPublishSuccess(false);
    setPublishedWasMerged(false);

    if (nextMode === "catalog") {
      if (isManualListingBrand(brand)) {
        setBrand("");
      }
    } else {
      setSku("");
      setCatalogModel("");
      setColorway("");
      setGender("");
      setReleaseDate("");
      setRetailPrice("");
      setLookupGalleryImages([]);
      setLookupImageUrl("");
      setLookedUpSneakerId(null);
      setLastLookedUpNormalizedSku(null);
      if (!brand) {
        setBrand("Custom");
      }
    }
  };

  const handleLookupSku = async () => {
    if (!normalizedSku) {
      setSkuLookupMessage("Enter a valid SKU to look up this sneaker.");
      return;
    }

    setSkuLookupLoading(true);
    setSkuLookupMessage(null);
    setSkuLookupSource(null);

    try {
      const response = await fetch(`/api/sneakers/lookup?sku=${encodeURIComponent(sku)}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as SkuLookupResponse | { error?: string };

      if (!response.ok) {
        setSkuLookupMessage(data && "error" in data && data.error ? data.error : "Failed to look up that SKU.");
        return;
      }

      if (!("found" in data) || !data.found || !data.sneaker) {
        setLookupGalleryImages([]);
        setLookupImageUrl("");
        setLookedUpSneakerId(null);
        setLastLookedUpNormalizedSku(normalizedSku);
        setSkuLookupSource(null);
        setSkuLookupMessage("We could not find that SKU. You can still create the listing manually.");
        return;
      }

      const { sneaker, source } = data;

      setSku(sneaker.sku || normalizedSku);
      setBrand(sneaker.brand || "");
      setModelName(sneaker.name || sneaker.model || "");
      setCatalogModel(sneaker.model || "");
      setNickname(sneaker.nickname || "");
      setColorway(sneaker.colorway || "");
      setGender(sneaker.gender || "");
      setReleaseDate(sneaker.release_date || "");
      setRetailPrice(sneaker.retail_price !== null && sneaker.retail_price !== undefined ? String(sneaker.retail_price) : "");
      setDescription(sneaker.description || "");
      setLookupGalleryImages(Array.isArray(sneaker.gallery_images) ? sneaker.gallery_images.filter(Boolean) : []);
      setLookupImageUrl(sneaker.image_url || "");
      setLookedUpSneakerId(sneaker.id);
      setLastLookedUpNormalizedSku(sneaker.normalized_sku || normalizedSku);
      setSkuLookupSource(source);
      setSkuLookupMessage(
        source === "local"
          ? "Sneaker details loaded from Relay's local catalog."
          : "Sneaker details loaded and saved to Relay's catalog."
      );
    } catch (error) {
      console.error("SKU lookup error:", error);
      setSkuLookupMessage("Failed to look up that SKU. You can still create the listing manually.");
    } finally {
      setSkuLookupLoading(false);
    }
  };

  const handleSkuChange = (value: string) => {
    const nextNormalizedSku = normalizeSku(value);

    setSku(value.toUpperCase());

    if (nextNormalizedSku !== lastLookedUpNormalizedSku) {
      setLookedUpSneakerId(null);
      setSkuLookupSource(null);
    }

    if (skuLookupMessage && nextNormalizedSku !== normalizedSku) {
      setSkuLookupMessage(null);
    }
  };

  // Size Management
  const addSize = () => {
    setSizes([
      ...sizes,
      {
        id: Math.random().toString(),
        size: "",
        price: 0,
        quantity: 1,
        condition: getDefaultVariantCondition(condition),
      },
    ]);
  };

  const updateSize = (id: string, field: string, value: any) => {
    setSizes(sizes.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const removeSize = (id: string) => {
    setSizes(sizes.filter(s => s.id !== id));
  };

  // Photo Management
  const handlePhotoUpload = (files: FileList | null) => {
    if (!files) return;

    if (maxSellerPhotoCount === 1 && files.length > 1) {
      alert(getConditionPhotoLimitMessage());
    }

    const availableSlots = Math.max(maxSellerPhotoCount - photos.length, 0);
    if (availableSlots <= 0) {
      alert(maxSellerPhotoCount === 1 ? getConditionPhotoLimitMessage() : "You have reached the photo limit for this listing.");
      return;
    }

    const newPhotos: UploadedPhoto[] = [];
    Array.from(files).forEach(file => {
      if (file.type.startsWith("image/") && newPhotos.length < availableSlots) {
        const url = URL.createObjectURL(file);
        newPhotos.push({
          id: Math.random().toString(),
          url,
          file,
        });
      }
    });

    if (newPhotos.length > 0) {
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dragOverCounter.current++;
  };

  const handleDragLeave = (e: React.DragEvent) => {
    dragOverCounter.current--;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragOverCounter.current = 0;
    handlePhotoUpload(e.dataTransfer.files);
  };

  const removePhoto = (id: string) => {
    setPhotos(photos.filter(p => p.id !== id));
  };

  const handlePhotoReorder = (fromIndex: number, toIndex: number) => {
    const newPhotos = [...photos];
    const [movedPhoto] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, movedPhoto);
    setPhotos(newPhotos);
  };

  const handlePublish = async () => {
    if (!currentUser?.id) {
      alert("You must be logged in to publish a listing");
      return;
    }

    setIsPublishing(true);

    try {
      const supabase = createClient();

      // Upload photos to storage
      const imageUrls: string[] = [];
      const uploadErrors: string[] = [];
      if (photos.length > 0) {
        for (const photo of photos) {
          const uploadResult = await uploadListingPhoto(photo.file);

          if ("error" in uploadResult) {
            console.error("Upload error:", uploadResult.error);
            uploadErrors.push(uploadResult.error);
            continue;
          }

          imageUrls.push(uploadResult.url);
        }
      }

      if (uploadErrors.length > 0) {
        alert(`Photo upload failed: ${uploadErrors[0]}`);
        return;
      }

      if (shouldUseSellerPhotos && photos.length > 0 && imageUrls.length !== photos.length) {
        alert("Not all seller photos finished uploading. Please try again before publishing.");
        return;
      }

      if ((isUsedCatalogListing || isMixedCatalogListing) && imageUrls.length === 0) {
        alert("At least one seller condition photo must upload successfully before publishing.");
        return;
      }

      const catalogImageUrls = activeLookupGalleryImages.length > 0
        ? activeLookupGalleryImages
        : activeLookupImageUrl
        ? [activeLookupImageUrl]
        : [];
      const finalImageUrls = isCatalogListing
        ? condition === "new"
          ? catalogImageUrls
          : [...catalogImageUrls, ...imageUrls.filter((url) => !catalogImageUrls.includes(url))]
        : imageUrls;

      if (isCatalogListing) {
        const result = await publishCatalogListingAction({
          sku: sku,
          sneakerId: linkedSneakerId,
          brand,
          model: modelName,
          catalogModel,
          nickname: nickname || undefined,
          colorway: colorway || undefined,
          gender: gender || undefined,
          releaseDate: releaseDate || undefined,
          retailPrice: retailPrice ? Number(retailPrice) : null,
          galleryImages: catalogImageUrls,
          imageUrl: activeLookupImageUrl || null,
          description,
          images: finalImageUrls,
          condition: condition as "new" | "used_good" | "mixed",
          boxCondition: boxCondition as "perfect" | "good" | "damaged" | "no_box",
          approximateSizing: approximateSizing as "lightweight" | "normal" | "heavy",
          variants: sizes.map((s) => ({
            size: s.size,
            price: s.price,
            quantity: s.quantity,
            condition: isMixedCatalogListing ? s.condition : getDefaultVariantCondition(condition),
          })),
        });

        if (!result.success) {
          alert(result.error);
          return;
        }

        setPublishedWasMerged(result.merged);
      } else {
        const legacySizes = buildLegacySizes(
          sizes.map((s) => ({
            size: s.size,
            price: s.price,
            quantity: s.quantity,
            condition: isMixedCatalogListing ? s.condition : getDefaultVariantCondition(condition),
          }))
        );

        const { data, error } = await supabase
          .from("listings")
          .insert({
            seller_id: currentUser!.id,
            brand,
            model: modelName,
            nickname: nickname || null,
            condition,
            box_condition: boxCondition,
            approx_sizing: approximateSizing,
            description,
            images: finalImageUrls,
            sizes: legacySizes,
            sku: normalizedSku || null,
            sneaker_id: linkedSneakerId,
            status: requiresReview ? "pending_review" : "active",
          })
          .select()
          .single();

        if (error || !data) {
          console.error("Database error:", error);
          alert("Failed to publish listing. Please try again.");
          return;
        }

        await mergeListingVariants(
          supabase,
          data.id,
          sizes.map((s) => ({
            size: s.size,
            price: s.price,
            quantity: s.quantity,
          }))
        );
        setPublishedWasMerged(false);
      }

      // Success
      setPublishedNeedsReview(requiresReview);
      setPublishSuccess(true);
    } catch (error) {
      console.error("Publish error:", error);
      alert("An error occurred while publishing your listing");
    } finally {
      setIsPublishing(false);
    }
  };

  const resetForm = () => {
    setListingMode("catalog");
    setBrand("");
    setSku("");
    setModelName("");
    setCatalogModel("");
    setNickname("");
    setColorway("");
    setGender("");
    setReleaseDate("");
    setRetailPrice("");
    setLookupGalleryImages([]);
    setLookupImageUrl("");
    setLookedUpSneakerId(null);
    setLastLookedUpNormalizedSku(null);
    setCondition("");
    setBoxCondition("");
    setApproximateSizing("");
    setSizes([]);
    setPhotos([]);
    setDescription("");
    setAdditionalNotes("");
    setCurrentStep(1);
    setPublishSuccess(false);
    setPublishedWasMerged(false);
    setSkuLookupMessage(null);
    setSkuLookupSource(null);
  };

  // Calculate total potential earnings
  const totalEarnings = sizes.reduce((sum, size) => {
    if (size.price && size.quantity) {
      const fees = calculateFees(size.price);
      return sum + fees.sellerEarnings * size.quantity;
    }
    return sum;
  }, 0);

  if (publishSuccess) {
    return (
      <div className="max-w-2xl mx-auto">
          <div className="relay-card p-12 text-center">
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${publishedNeedsReview ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
                <Check size={32} className={publishedNeedsReview ? 'text-amber-400' : 'text-emerald-400'} />
              </div>
            </div>
            <h2 className="relay-title text-relay-text mb-2">
              {publishedNeedsReview
                ? "Listing Submitted for Review"
                : publishedWasMerged
                ? "Listing Updated"
                : "Listing Published!"}
            </h2>
            <p className="text-relay-muted mb-8">
              {publishedNeedsReview
                ? 'Your listing has been submitted and is pending admin approval. You\'ll be notified once it\'s reviewed and goes live on the marketplace.'
                : publishedWasMerged
                ? "We found an existing listing for this SKU and merged your new sizes, quantities, and prices into it."
                : 'Your shoe listing is now live on Relay. Buyers can start viewing and purchasing.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => router.push("/my-listings")}
                className="relay-button-accent"
              >
                View Listing
              </button>
              <button
                onClick={resetForm}
                className="relay-button-secondary"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <div className="relay-eyebrow text-relay-accent">NEW LISTING</div>
          <h1 className="relay-title text-relay-text mt-2">Sell Your Shoes</h1>
          <p className="text-relay-subtle mt-3 max-w-2xl">
            Choose a catalog sneaker listing for SKU-based inventory, or keep the existing manual flow for customs and non-standard products.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => switchListingMode("catalog")}
            className={`text-left rounded-2xl border p-5 transition-all ${
              isCatalogListing
                ? "border-relay-accent bg-relay-accent/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-relay-accent/15 text-relay-accent flex items-center justify-center">
                <ScanSearch size={20} />
              </div>
              <div>
                <h2 className="text-relay-text font-semibold">Catalog Sneaker Listing</h2>
                <p className="text-xs text-relay-subtle">SKU-first inventory</p>
              </div>
            </div>
            <p className="text-sm text-relay-muted leading-relaxed">
              Enter a SKU, look up sneaker metadata, and list multiple sizes with separate prices and quantities. Photos are optional when a catalog image is available.
            </p>
          </button>

          <button
            type="button"
            onClick={() => switchListingMode("manual")}
            className={`text-left rounded-2xl border p-5 transition-all ${
              isManualListing
                ? "border-relay-accent bg-relay-accent/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-white/10 text-relay-text flex items-center justify-center">
                <Camera size={20} />
              </div>
              <div>
                <h2 className="text-relay-text font-semibold">Custom / Manual Listing</h2>
                <p className="text-xs text-relay-subtle">Photo-led product setup</p>
              </div>
            </div>
            <p className="text-sm text-relay-muted leading-relaxed">
              Preserve the current upload flow for customs, independent brands, or any item that is not tied to a standard sneaker catalog SKU.
            </p>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex justify-between mb-6">
            {currentStepLabels.map((label, index) => {
              const stepNum = (index + 1) as Step;
              const isActive = stepNum === currentStep;
              const isCompleted = stepNum < currentStep;

              return (
                <div key={stepNum} className="flex-1 flex items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                      isActive
                        ? "bg-relay-accent-strong text-white"
                        : isCompleted
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-white/5 text-relay-muted border border-white/10"
                    }`}
                  >
                    {isCompleted ? <Check size={20} /> : stepNum}
                  </div>
                  <div className={`hidden sm:block text-xs font-medium ml-2 ${isActive ? "text-relay-accent" : "text-relay-subtle"}`}>
                    {label}
                  </div>
                  {index < currentStepLabels.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-2 rounded-full ${
                        isCompleted ? "bg-emerald-500/30" : "bg-white/10"
                      }`}
                    ></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Container */}
        <div className="relay-card p-4 sm:p-8">
          {/* Step 1: Shoe Details */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {isCatalogListing ? (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-relay-accent/20 bg-relay-accent/5 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={16} className="text-relay-accent" />
                      <p className="text-sm font-semibold text-relay-text">SKU Lookup</p>
                    </div>
                    <p className="text-sm text-relay-muted leading-relaxed">
                      Enter a sneaker SKU to look up catalog details in Relay. You can edit every filled field before you publish.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-relay-text mb-2">SKU *</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        placeholder="e.g., DZ5485-612"
                        value={sku}
                        onChange={(e) => handleSkuChange(e.target.value)}
                        className="relay-input flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleLookupSku}
                        disabled={!normalizedSku || skuLookupLoading}
                        className="relay-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {skuLookupLoading ? "Looking up..." : "Lookup SKU"}
                      </button>
                    </div>
                    <p className="text-xs text-relay-subtle mt-1">
                      Relay uses SKU to keep one listing per seller for each sneaker.
                    </p>
                    {skuLookupMessage && (
                      <p className={`text-xs mt-2 ${skuLookupSource ? "text-emerald-400" : "text-relay-accent"}`}>
                        {skuLookupMessage}
                      </p>
                    )}
                  </div>

                  {activeLookupGalleryImages.length > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                      <p className="text-sm font-medium text-relay-text mb-3">Gallery Preview</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {activeLookupGalleryImages.map((imageUrl, index) => (
                          <img
                            key={imageUrl}
                            src={imageUrl}
                            alt={`${modelName || "Sneaker preview"} ${index + 1}`}
                            className="w-full aspect-square rounded-xl object-cover border border-white/10 bg-white/[0.02]"
                          />
                        ))}
                      </div>
                      <div className="text-xs text-relay-subtle leading-relaxed mt-3">
                        <p>Relay uses these product gallery photos for catalog listings and excludes 360 spins.</p>
                        <p className="mt-2">
                          {linkedSneakerId
                            ? "This listing will be linked to a saved sneaker record."
                            : "If you edit the SKU, run the lookup again before publishing to relink the sneaker record."}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-relay-text mb-2">Brand *</label>
                      <input
                        type="text"
                        placeholder="Auto-filled from SKU lookup"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        className="relay-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-relay-text mb-2">Product Title / Name *</label>
                      <input
                        type="text"
                        placeholder="Auto-filled from SKU lookup"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        className="relay-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-relay-text mb-2">Model</label>
                      <input
                        type="text"
                        placeholder="e.g., Dunk Low, AJ4, 990v6"
                        value={catalogModel}
                        onChange={(e) => setCatalogModel(e.target.value)}
                        className="relay-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-relay-text mb-2">Nickname</label>
                      <input
                        type="text"
                        placeholder="e.g., Panda, Bred, Chicago"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="relay-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-relay-text mb-2">Colorway</label>
                      <input
                        type="text"
                        placeholder="e.g., White / Black"
                        value={colorway}
                        onChange={(e) => setColorway(e.target.value)}
                        className="relay-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-relay-text mb-2">Gender</label>
                      <input
                        type="text"
                        placeholder="e.g., Men, Women, GS"
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="relay-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-relay-text mb-2">Release Date</label>
                      <input
                        type="date"
                        value={releaseDate}
                        onChange={(e) => setReleaseDate(e.target.value)}
                        className="relay-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-relay-text mb-2">Retail Price</label>
                      <div className="relative">
                        <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-relay-subtle" />
                        <input
                          type="number"
                          placeholder="0.00"
                          value={retailPrice}
                          onChange={(e) => setRetailPrice(e.target.value)}
                          className="relay-input"
                          style={{ paddingLeft: "2rem" }}
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-relay-text mb-2">Brand</label>
                  <div className="relative">
                    <select
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="relay-select pr-10 appearance-none"
                    >
                      <option value="">Select a brand...</option>
                      <optgroup label="Special Categories">
                        <option value="Individual Brand">Individual Brand</option>
                        <option value="Custom">Custom</option>
                      </optgroup>
                      <optgroup label="Brands">
                        {BRANDS.filter(b => b !== 'Individual Brand' && b !== 'Custom').map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </optgroup>
                    </select>
                    <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                  </div>
                  {requiresReview && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-amber-300 text-sm font-medium mb-1">Admin Approval Required</p>
                      <p className="text-amber-200/60 text-xs leading-relaxed">
                        {brand === 'Individual Brand'
                          ? 'Listings for individual/independent brands are exempt from third-party authentication. Your listing will be reviewed by Relay admin before going live on the marketplace.'
                          : 'Custom-made shoes are unique and cannot go through standard authentication. Your listing will be reviewed by Relay admin before going live on the marketplace.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {isManualListing && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-relay-text mb-2">Model Name *</label>
                    <input
                      type="text"
                      placeholder="e.g., Air Jordan 1 Retro High OG"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="relay-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-relay-text mb-2">Nickname (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., Chicago, Bred, etc."
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="relay-input"
                    />
                  </div>
                </>
              )}

              {isCatalogListing && (
                <div>
                  <label className="block text-sm font-medium text-relay-text mb-2">Catalog Description *</label>
                  <textarea
                    placeholder="Add selling notes, condition notes, or any context for this SKU listing."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="relay-textarea"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Shoe Condition *</label>
                <div className="relative">
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="relay-select pr-10 appearance-none"
                  >
                    <option value="">Select condition...</option>
                    {(isCatalogListing ? CATALOG_CONDITION_OPTIONS : MANUAL_CONDITION_OPTIONS).map(({ value, label, description }) => (
                      <option key={value} value={value}>
                        {label} - {description}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                </div>
                {isCatalogListing && condition === "new" && (
                  <p className="text-xs text-relay-subtle mt-2">
                    New catalog listings use the product gallery images only.
                  </p>
                )}
                {isCatalogListing && condition === "used_good" && (
                  <p className="text-xs text-relay-subtle mt-2">
                    Used catalog listings must include at least one seller photo so buyers can judge condition.
                  </p>
                )}
                {isCatalogListing && condition === "mixed" && (
                  <p className="text-xs text-relay-subtle mt-2">
                    Mixed catalog listings let you split each size row between new and used pairs on the next step.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Box Condition *</label>
                <div className="relative">
                  <select
                    value={boxCondition}
                    onChange={(e) => setBoxCondition(e.target.value)}
                    className="relay-select pr-10 appearance-none"
                  >
                    <option value="">Select box condition...</option>
                    {Object.entries(BOX_CONDITIONS).map(([key, { label, description }]) => (
                      <option key={key} value={key}>
                        {label} - {description}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Approximate Sizing *</label>
                <div className="relative">
                  <select
                    value={approximateSizing}
                    onChange={(e) => setApproximateSizing(e.target.value)}
                    className="relay-select pr-10 appearance-none"
                  >
                    <option value="">Select sizing...</option>
                    {Object.entries(APPROX_SIZINGS).map(([key, { label, description }]) => (
                      <option key={key} value={key}>
                        {label} - {description}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Sizes & Pricing */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <p className="text-relay-muted text-sm mb-4">
                  {isMixedCatalogListing
                    ? "Add each size/condition variant with its own price and quantity."
                    : "Add each size you have available with its price and quantity."}
                </p>
              </div>

              {sizes.length > 0 && (
                <div className="space-y-6">
                  {sizes.map((sizeRow) => {
                    const fees = sizeRow.price ? calculateFees(sizeRow.price) : null;
                    return (
                      <div key={sizeRow.id} className="border border-white/5 rounded-xl p-4 bg-white/[0.02]">
                        <div className={`grid grid-cols-1 ${isMixedCatalogListing ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-4 mb-4`}>
                          {/* Size Dropdown */}
                          <div>
                            <label className="block text-xs font-medium text-relay-subtle mb-2">Size</label>
                            <div className="relative">
                              <select
                                value={sizeRow.size}
                                onChange={(e) => updateSize(sizeRow.id, "size", e.target.value)}
                                className="relay-select pr-8 appearance-none"
                              >
                                <option value="">Select...</option>
                                {SHOE_SIZES.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={16} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                            </div>
                          </div>

                          {isMixedCatalogListing && (
                            <div>
                              <label className="block text-xs font-medium text-relay-subtle mb-2">Condition</label>
                              <div className="relative">
                                <select
                                  value={sizeRow.condition}
                                  onChange={(e) => updateSize(sizeRow.id, "condition", e.target.value as "new" | "used")}
                                  className="relay-select pr-8 appearance-none"
                                >
                                  <option value="new">New</option>
                                  <option value="used">Used</option>
                                </select>
                                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={16} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                              </div>
                            </div>
                          )}

                          {/* Price Input */}
                          <div>
                            <label className="block text-xs font-medium text-relay-subtle mb-2">Price</label>
                            <div className="relative">
                              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-relay-subtle" />
                              <input
                                type="number"
                                placeholder="0.00"
                                value={sizeRow.price || ""}
                                onChange={(e) => updateSize(sizeRow.id, "price", parseFloat(e.target.value) || 0)}
                                className="relay-input"
                                style={{ paddingLeft: '2rem' }}
                                min="0"
                                step="0.01"
                              />
                            </div>
                          </div>

                          {/* Quantity Input */}
                          <div>
                            <label className="block text-xs font-medium text-relay-subtle mb-2">Qty</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder="1"
                                value={sizeRow.quantity || ""}
                                onChange={(e) => updateSize(sizeRow.id, "quantity", parseInt(e.target.value) || 1)}
                                className="relay-input"
                                min="1"
                              />
                              <button
                                onClick={() => removeSize(sizeRow.id)}
                                className="px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-relay-text"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {isMixedCatalogListing && (
                          <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-relay-text">
                            {getVariantConditionLabel(sizeRow.condition)} pair
                          </div>
                        )}

                        {/* Fee Breakdown */}
                        {fees && sizeRow.price > 0 && (
                          <div className="text-xs space-y-1 pt-3 border-t border-white/5">
                            <div className="flex justify-between text-relay-muted">
                              <span>Relay fee (1%):</span>
                              <span>{formatCurrency(fees.platformFee)}</span>
                            </div>
                            <div className="flex justify-between text-relay-muted">
                              <span>Stripe fee (3% + $0.30):</span>
                              <span>{formatCurrency(fees.stripeFee)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-400 font-medium">
                              <span>Your earnings:</span>
                              <span>{formatCurrency(fees.sellerEarnings)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={addSize}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 hover:border-relay-accent/50 hover:bg-relay-accent/5 transition-all text-relay-accent font-medium"
              >
                <Plus size={18} />
                {isMixedCatalogListing ? "Add Size Variant" : "Add Size"}
              </button>
            </div>
          )}

          {/* Step 3: Photos & Description */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {isCatalogListing && activeLookupGalleryImages.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-relay-text mb-3">Product Gallery Images</label>
                  <div className="mb-3 p-3 rounded-lg bg-white/[0.03] border border-white/10">
                    <p className="text-sm text-relay-text font-medium mb-1">Catalog images for this SKU</p>
                    <p className="text-xs text-relay-subtle leading-relaxed">
                      Relay uses these standard product views and ignores the 360 image set.
                      {condition === "new"
                        ? " For new pairs, these will be the only listing photos."
                        : condition === "mixed"
                        ? " For mixed listings, these support your seller condition photos."
                        : " For used pairs, these are included alongside your condition photos."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {activeLookupGalleryImages.map((imageUrl, index) => (
                      <div
                        key={imageUrl}
                        className="relative rounded-xl overflow-hidden bg-white/[0.02] border border-white/10 aspect-square"
                      >
                        <img
                          src={imageUrl}
                          alt={`Catalog gallery ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {index === 0 && (
                          <div className="absolute top-2 left-2">
                            <span className="relay-badge-info text-xs">Primary</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(isManualListing || isUsedCatalogListing || isMixedCatalogListing) && (
                <div>
                  <label className="block text-sm font-medium text-relay-text mb-3">
                    {isUsedCatalogListing || isMixedCatalogListing ? "Seller Condition Photos *" : "Photos *"}
                  </label>
                  {(isUsedCatalogListing || isMixedCatalogListing) && (
                    <div className="mb-3 p-3 rounded-lg bg-white/[0.03] border border-white/10">
                      <p className="text-sm text-relay-text font-medium mb-1">Exactly one real seller photo is required</p>
                      <p className="text-xs text-relay-subtle leading-relaxed">
                        Buyers need to see the actual condition of any pre-owned pairs. This seller photo will appear before the gallery images in the listing.
                      </p>
                    </div>
                  )}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-2xl p-8 transition-all ${
                      dragOverCounter.current > 0
                        ? "border-relay-accent bg-relay-accent/5"
                        : "border-white/20 bg-white/[0.02] hover:border-white/30"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple={maxSellerPhotoCount > 1}
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e.target.files)}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 text-center"
                    >
                      <Camera size={32} className="text-relay-accent" />
                      <span className="font-medium text-relay-text">
                        Drag & drop photos or click to upload
                      </span>
                      <span className="text-sm text-relay-subtle">
                        {maxSellerPhotoCount === 1
                          ? "Upload exactly 1 condition photo."
                          : "Up to 10 photos. First uploaded photo is shown first."}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {isCatalogListing && condition === "new" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-sm font-medium text-relay-text mb-1">No seller photos needed for new pairs</p>
                  <p className="text-xs text-relay-subtle leading-relaxed">
                    Relay will publish this new catalog listing with the gallery images only.
                  </p>
                </div>
              )}
              {hasUnusedSellerPhotos && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium text-amber-200 mb-1">Uploaded seller photos will be ignored for a new listing</p>
                  <p className="text-xs text-amber-100/80 leading-relaxed">
                    Switch back to Used if you want these seller photos to appear in the final listing.
                  </p>
                </div>
              )}

              {/* Photo Grid */}
              {photos.length > 0 && shouldUseSellerPhotos && (
                <div>
                  <p className="text-sm text-relay-muted mb-3">
                    {photos.length} of {maxSellerPhotoCount} uploaded photos {maxSellerPhotoCount === 1
                      ? "(condition photo)"
                      : photos.length === 1
                      ? "(first seller photo)"
                      : "(first photo appears first)"}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="relative group rounded-xl overflow-hidden bg-white/[0.02] border border-white/10 aspect-square"
                      >
                        <img
                          src={photo.url}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />

                        {/* Cover Badge */}
                        {index === 0 && !isUsedCatalogListing && !isMixedCatalogListing && (
                          <div className="absolute top-2 left-2">
                            <span className="relay-badge-info text-xs">Cover</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          {index > 0 && (
                            <button
                              onClick={() => handlePhotoReorder(index, index - 1)}
                              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                              title="Move left"
                            >
                              <ChevronLeft size={18} className="text-white" />
                            </button>
                          )}
                          <button
                            onClick={() => removePhoto(photo.id)}
                            className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
                          >
                            <X size={18} className="text-red-400" />
                          </button>
                          {index < photos.length - 1 && (
                            <button
                              onClick={() => handlePhotoReorder(index, index + 1)}
                              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                              title="Move right"
                            >
                              <ChevronRightIcon size={18} className="text-white" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">
                  {isCatalogListing ? "Catalog Description *" : "Description *"}
                </label>
                <textarea
                  placeholder={
                    isCatalogListing
                      ? "Describe the product, release, sizing notes, or any seller-specific details for this SKU."
                      : "Describe the condition, any defects, original packaging, etc. (minimum 4 characters)"
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  minLength={4}
                  rows={4}
                  className="relay-textarea"
                />
                <p className="text-xs text-relay-subtle mt-1">
                  {description.length} characters (minimum 4)
                </p>
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Additional Notes (Optional)</label>
                <textarea
                  placeholder={isCatalogListing ? "Any extra selling notes for this catalog listing..." : "Any other details about the shoes..."}
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  rows={3}
                  className="relay-textarea"
                />
              </div>
            </div>
          )}

          {/* Step 4: Review & Publish */}
          {currentStep === 4 && (
            <div className="space-y-8">
              {requiresReview && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-300 text-sm font-semibold mb-1">This listing requires admin approval</p>
                  <p className="text-amber-200/60 text-xs leading-relaxed">
                    Because this is {brand === 'Individual Brand' ? 'an individual brand' : 'a custom shoe'} listing, it will be submitted for review instead of going live immediately. A Relay admin will review your listing details and approve or reject it.
                  </p>
                </div>
              )}
              {/* Shoe Details Summary */}
              <div>
                <h3 className="text-sm font-semibold text-relay-text mb-4 flex items-center gap-2">
                  <Package size={16} className="text-relay-accent" />
                  {isCatalogListing ? "Catalog Product" : "Shoe Details"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">Listing Type</p>
                    <p className="text-relay-text font-medium">{isCatalogListing ? "Catalog sneaker listing" : "Custom / manual listing"}</p>
                  </div>
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">SKU</p>
                    <p className="text-relay-text font-medium">{isCatalogListing ? normalizedSku : "Not used"}</p>
                  </div>
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">Brand</p>
                    <p className="text-relay-text font-medium">{brand}</p>
                  </div>
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">{isCatalogListing ? "Product Title" : "Model"}</p>
                    <p className="text-relay-text font-medium">{modelName}</p>
                  </div>
                  {isCatalogListing && catalogModel && (
                    <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                      <p className="text-relay-subtle mb-1">Model</p>
                      <p className="text-relay-text font-medium">{catalogModel}</p>
                    </div>
                  )}
                  {nickname && (
                    <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                      <p className="text-relay-subtle mb-1">Nickname</p>
                      <p className="text-relay-text font-medium">{nickname}</p>
                    </div>
                  )}
                  {isCatalogListing && colorway && (
                    <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                      <p className="text-relay-subtle mb-1">Colorway</p>
                      <p className="text-relay-text font-medium">{colorway}</p>
                    </div>
                  )}
                  {isCatalogListing && gender && (
                    <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                      <p className="text-relay-subtle mb-1">Gender</p>
                      <p className="text-relay-text font-medium">{gender}</p>
                    </div>
                  )}
                  {isCatalogListing && releaseDate && (
                    <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                      <p className="text-relay-subtle mb-1">Release Date</p>
                      <p className="text-relay-text font-medium">{releaseDate}</p>
                    </div>
                  )}
                  {isCatalogListing && retailPrice && (
                    <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                      <p className="text-relay-subtle mb-1">Retail Price</p>
                      <p className="text-relay-text font-medium">{formatCurrency(Number(retailPrice) || 0)}</p>
                    </div>
                  )}
                  {isCatalogListing && linkedSneakerId && (
                    <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                      <p className="text-relay-subtle mb-1">Linked Sneaker Record</p>
                      <p className="text-relay-text font-medium">Saved to Relay catalog</p>
                    </div>
                  )}
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">Shoe Condition</p>
                    <p className="text-relay-text font-medium">
                      {getConditionDisplayLabel(condition) || condition}
                    </p>
                  </div>
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">Box Condition</p>
                    <p className="text-relay-text font-medium">
                      {Object.values(BOX_CONDITIONS).find(c => Object.keys(BOX_CONDITIONS).find(k => k === boxCondition) === boxCondition)?.label || boxCondition}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sizes & Pricing Summary */}
              <div>
                <h3 className="text-sm font-semibold text-relay-text mb-4 flex items-center gap-2">
                  <DollarSign size={16} className="text-relay-accent" />
                  Sizes & Pricing
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2 px-3 text-relay-subtle font-medium">Size</th>
                        {isMixedCatalogListing && (
                          <th className="text-left py-2 px-3 text-relay-subtle font-medium">Condition</th>
                        )}
                        <th className="text-left py-2 px-3 text-relay-subtle font-medium">Price</th>
                        <th className="text-left py-2 px-3 text-relay-subtle font-medium">Qty</th>
                        <th className="text-right py-2 px-3 text-relay-subtle font-medium">Your Earnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sizes.map(sizeRow => {
                        const fees = calculateFees(sizeRow.price);
                        return (
                          <tr key={sizeRow.id} className="border-b border-white/5">
                            <td className="py-3 px-3 text-relay-text font-medium">Size {sizeRow.size}</td>
                            {isMixedCatalogListing && (
                              <td className="py-3 px-3 text-relay-text">{getVariantConditionLabel(sizeRow.condition)}</td>
                            )}
                            <td className="py-3 px-3 text-relay-text">{formatCurrency(sizeRow.price)}</td>
                            <td className="py-3 px-3 text-relay-text">{sizeRow.quantity}</td>
                            <td className="py-3 px-3 text-emerald-400 font-medium text-right">
                              {formatCurrency(fees.sellerEarnings * sizeRow.quantity)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Photos Summary */}
              {photos.length > 0 && shouldUseSellerPhotos && (
                <div>
                  <h3 className="text-sm font-semibold text-relay-text mb-4 flex items-center gap-2">
                    <Camera size={16} className="text-relay-accent" />
                    {isUsedCatalogListing || isMixedCatalogListing ? `Seller Condition Photos (${photos.length})` : `Photos (${photos.length})`}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="relative rounded-lg overflow-hidden bg-white/[0.02] border border-white/10 aspect-square"
                      >
                        <img
                          src={photo.url}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {index === 0 && !isUsedCatalogListing && !isMixedCatalogListing && (
                          <div className="absolute top-1 left-1">
                            <span className="relay-badge-info text-xs">Cover</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hasUnusedSellerPhotos && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium text-amber-200 mb-1">Seller photos are currently excluded</p>
                  <p className="text-xs text-amber-100/80">
                    Because this listing is marked New, Relay will publish only the gallery images.
                  </p>
                </div>
              )}
              {isCatalogListing && condition === "new" && activeLookupGalleryImages.length > 0 && (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-sm font-medium text-relay-text mb-1">New catalog listing will use gallery photos only</p>
                  <p className="text-xs text-relay-subtle">
                    These standard product photos become the full listing image set for new pairs.
                  </p>
                </div>
              )}
              {isCatalogListing && (condition === "used_good" || condition === "mixed") && photos.length === 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium text-amber-200 mb-1">
                    {condition === "mixed"
                      ? "Mixed catalog listings need exactly one seller photo"
                      : "Used catalog listings need exactly one seller photo"}
                  </p>
                  <p className="text-xs text-amber-100/80">
                    Add one real photo so buyers can evaluate the pair&apos;s condition.
                  </p>
                </div>
              )}
              {isCatalogListing && activeLookupGalleryImages.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-relay-text mb-4 flex items-center gap-2">
                    <Sparkles size={16} className="text-relay-accent" />
                    Product Gallery Images
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeLookupGalleryImages.map((imageUrl, index) => (
                      <div
                        key={imageUrl}
                        className="relative rounded-lg overflow-hidden bg-white/[0.02] border border-white/10 aspect-square"
                      >
                        <img
                          src={imageUrl}
                          alt={`${modelName || "Catalog sneaker"} ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {index === 0 && (
                          <div className="absolute top-1 left-1">
                            <span className="relay-badge-info text-xs">Primary</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description Preview */}
              {/* Description Preview */}
              <div>
                <h3 className="text-sm font-semibold text-relay-text mb-2">Description</h3>
                <p className="text-relay-muted text-sm bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  {description}
                </p>
              </div>

              {/* Total Earnings */}
              <div className="border-t border-white/10 pt-6">
                <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-relay-subtle text-sm mb-2">Total Potential Earnings</p>
                  <p className="text-3xl font-bold text-emerald-400">
                    {formatCurrency(totalEarnings)}
                  </p>
                  <p className="text-xs text-relay-subtle mt-2">
                    Based on all sizes and quantities listed
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-4 mt-8 pt-8 border-t border-white/10">
            {currentStep > 1 && (
              <button
                onClick={handlePreviousStep}
                className="relay-button-secondary flex-1"
              >
                Back
              </button>
            )}

            {currentStep < 4 && (
              <button
                onClick={handleNextStep}
                disabled={
                  (currentStep === 1 && !isStep1Valid) ||
                  (currentStep === 2 && !isStep2Valid) ||
                  (currentStep === 3 && !isStep3Valid)
                }
                className="relay-button-accent flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            )}

            {currentStep === 4 && (
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="relay-button-accent flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPublishing ? "Publishing..." : requiresReview ? "Submit for Review" : "Publish Listing"}
              </button>
            )}

            {currentStep === 4 && (
              <button
                onClick={() => setCurrentStep(1)}
                className="relay-button-secondary flex-1"
              >
                Save as Draft
              </button>
            )}
          </div>
        </div>
      </div>
  );
}
