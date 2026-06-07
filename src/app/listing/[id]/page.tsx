"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ShoppingCart,
  MessageSquare,
  Star,
  Shield,
  Truck,
  BadgeCheck,
  Package,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { usePublicTestMode } from "@/hooks/usePublicTestMode";
import { getRelayTestMarketplaceListing } from "@/lib/test-marketplace";
import {
  canBuyerMessageSeller,
  canBuyFromSeller,
  getBuyerMessagingUnavailableReason,
  getVacationModeNotice,
} from "@/lib/seller-availability";
import { Listing } from "@/types";
import useAuth from "@/hooks/useAuth";
import { sanitizeSneakerDescription } from "../../../../lib/sneakers/sanitizeSneakerDescription";

interface SizeInventory {
  id?: string;
  size: string;
  quantity: number;
  price: number;
  condition: "new" | "used";
}

interface ListingDetail {
  id: string;
  brand: string;
  model: string;
  nickname?: string;
  condition: "New" | "Used" | "New + Used";
  boxCondition: "New" | "Good" | "Fair" | "Poor" | "No Box";
  description: string;
  sizes: SizeInventory[];
  images: string[];
  averageRating: number;
  reviewCount: number;
  seller: {
    role: string;
    username: string;
    displayName: string;
    avatar: string;
    isVerified: boolean;
    customerMessagingEnabled: boolean;
    vacationModeEnabled: boolean;
    offersEnabled: boolean;
    totalSales: number;
    rating: number;
    joinedDate: string;
  };
  gradient: string;
}

function getSizeVariantKey(sizeData: SizeInventory) {
  return sizeData.id || `${sizeData.size}-${sizeData.condition}`;
}

export default function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { enabled: testModeEnabled, loading: testModeLoading } = usePublicTestMode();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [isPreviewListing, setIsPreviewListing] = useState(false);

  useEffect(() => {
    if (testModeLoading) {
      return;
    }

    async function fetchListing() {
      const supabase = createClient();
      setLoading(true);
      setIsPreviewListing(false);

      try {
        const { data } = await supabase
          .from("listings")
          .select("*, seller:profiles(*), listing_variants(id, size, quantity, price, condition, is_active)")
          .eq("id", params.id)
          .maybeSingle();

        if (data && data.status !== "removed") {
          const conditions: Record<string, ListingDetail["condition"]> = {
            new: "New",
            like_new: "Used",
            used_excellent: "Used",
            used_good: "Used",
            used_fair: "Used",
            mixed: "New + Used",
          };

          const boxConditions: Record<string, ListingDetail["boxCondition"]> = {
            perfect: "New",
            good: "Good",
            damaged: "Fair",
            no_box: "No Box",
          };

          const gradients: { [key: string]: string } = {
            Nike: "from-red-500/20 to-orange-500/20",
            Adidas: "from-gray-600/20 to-slate-600/20",
            "New Balance": "from-neutral-500/20 to-stone-500/20",
            Jordan: "from-gray-700/20 to-slate-700/20",
            Puma: "from-purple-500/20 to-pink-500/20",
          };

          const variantRows = (data.listing_variants as any[]) || [];
          const sizeSource: Array<{ id?: string; size: any; quantity: number; price: number; condition: "new" | "used" }> = variantRows.length > 0
            ? variantRows
                .filter((variant) => variant.is_active !== false)
                .map((variant) => ({
                  id: variant.id,
                  size: variant.size,
                  quantity: variant.quantity || 0,
                  price: Number(variant.price) || 0,
                  condition: variant.condition === "used" ? "used" : "new",
                }))
            : (data.sizes as any[])?.map((s) => ({
                size: s.size,
                quantity: s.quantity || 0,
                price: Number(s.price) || 0,
                condition: s.condition === "used" ? "used" : data.condition === "mixed" || data.condition?.startsWith("used") ? "used" : "new",
              })) || [];

          const formatted: ListingDetail = {
            id: data.id,
            brand: data.brand,
            model: data.model,
            nickname: data.nickname,
            condition: conditions[data.condition] || "Used",
            boxCondition: boxConditions[data.box_condition] || "No Box",
            description: data.description,
            sizes: sizeSource
              .map((s) => ({
                id: s.id,
                size: String(s.size),
                quantity: s.quantity || 0,
                price: Number(s.price) || 0,
                condition: s.condition,
              }))
              .filter((s) => s.size),
            images: data.images || [],
            averageRating: 4.8,
            reviewCount: 0,
            seller: {
              role: data.seller?.role || "seller",
              username: data.seller?.username || "unknown",
              displayName: data.seller?.display_name || data.seller?.full_name || "Unknown Seller",
              avatar:
                data.seller?.avatar_url ||
                "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
              isVerified: data.seller?.is_verified_seller || false,
              customerMessagingEnabled: data.seller?.customer_messaging_enabled ?? false,
              vacationModeEnabled: data.seller?.vacation_mode_enabled ?? false,
              offersEnabled: data.seller?.offers_enabled ?? false,
              totalSales: 847,
              rating: 4.9,
              joinedDate: new Date(data.seller?.created_at).toLocaleDateString(
                "en-US",
                { year: "numeric", month: "long" }
              ),
            },
            gradient:
              gradients[data.brand] || "from-blue-500/20 to-indigo-500/20",
          };

          setSellerId(data.seller_id);
          setListing(formatted);
          setSelectedVariantId(
            formatted.sizes.find((size) => size.quantity > 0)
              ? getSizeVariantKey(formatted.sizes.find((size) => size.quantity > 0)!)
              : formatted.sizes[0]
              ? getSizeVariantKey(formatted.sizes[0])
              : null
          );
          setIsPreviewListing(false);
          return;
        }

        if (testModeEnabled) {
          const previewListing = getRelayTestMarketplaceListing(params.id);
          if (previewListing) {
            setListing({
              id: previewListing.id,
              brand: previewListing.brand,
              model: previewListing.model,
              nickname: previewListing.nickname,
              condition:
                previewListing.condition === "New"
                  ? "New"
                  : previewListing.condition === "New + Used"
                  ? "New + Used"
                  : "Used",
              boxCondition: previewListing.boxCondition,
              description: previewListing.description,
              sizes: previewListing.sizes.map((size) => ({
                id: size.id,
                size: String(size.size),
                quantity: size.quantity,
                price: size.price,
                condition: size.condition === "used" ? "used" : "new",
              })),
              images: previewListing.images,
              averageRating: 4.8,
              reviewCount: 12,
              seller: {
                role: "seller",
                username: previewListing.seller.username,
                displayName: previewListing.seller.displayName,
                avatar: previewListing.seller.avatar,
                isVerified: previewListing.seller.isVerified,
                customerMessagingEnabled: false,
                vacationModeEnabled: false,
                offersEnabled: false,
                totalSales: previewListing.seller.totalSales,
                rating: previewListing.seller.rating,
                joinedDate: previewListing.seller.joinedDate,
              },
              gradient: previewListing.gradient,
            });
            setSellerId(null);
            setSelectedVariantId(
              previewListing.sizes.find((size) => size.quantity > 0)?.id || previewListing.sizes[0]?.id || null
            );
            setIsPreviewListing(true);
            return;
          }
        }
      } catch (error) {
        console.error("Error fetching listing:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [params.id, testModeEnabled, testModeLoading]);

  const handleMessageSeller = async () => {
    if (!currentUser?.id || !sellerId) {
      router.push("/login");
      return;
    }

    if (currentUser!.id === sellerId) {
      alert("You can't message yourself!");
      return;
    }

    setMessagingLoading(true);
    try {
      const supabase = createClient();

      // Check for existing conversation between these two users about this listing
      const { data: existingConvos } = await supabase
        .from("conversations")
        .select("*")
        .contains("participant_ids", [currentUser!.id, sellerId])
        .eq("listing_id", params.id);

      if (existingConvos && existingConvos.length > 0) {
        router.push("/messages");
        return;
      }

      const buyerMessagingUnavailableReason = currentUser?.role === "seller" || currentUser?.role === "admin"
        ? null
        : getBuyerMessagingUnavailableReason({
            role: listing?.seller.role,
            customerMessagingEnabled: listing?.seller.customerMessagingEnabled,
            vacationModeEnabled: listing?.seller.vacationModeEnabled,
          });

      if (buyerMessagingUnavailableReason) {
        alert(buyerMessagingUnavailableReason);
        return;
      }

      // Create a new conversation
      const { error } = await supabase
        .from("conversations")
        .insert({
          participant_ids: [currentUser!.id, sellerId],
          listing_id: params.id,
          last_message: null,
          last_message_at: new Date().toISOString(),
        });

      if (error) throw error;

      router.push("/messages");
    } catch (error) {
      console.error("Error creating conversation:", error);
      alert("Failed to start conversation. Please try again.");
    } finally {
      setMessagingLoading(false);
    }
  };

  if (loading || testModeLoading) {
    return (
      <div className="relay-empty text-center">Loading...</div>
    );
  }

  if (!listing) {
    return (
      <div className="relay-empty text-center py-12">
        <p>Listing not found</p>
      </div>
    );
  }

  const selectedSizeData = listing.sizes.find((s) => getSizeVariantKey(s) === selectedVariantId) || null;
  const availableSizes = listing.sizes.filter((s) => s.quantity > 0);
  const sellerVacationNotice = getVacationModeNotice();
  const sellerOnVacation = isPreviewListing
    ? false
    : !canBuyFromSeller({
        role: listing.seller.role,
        vacationModeEnabled: listing.seller.vacationModeEnabled,
      });
  const buyerMessagingUnavailableReason = isPreviewListing
    ? "Preview listings do not support messaging."
    : getBuyerMessagingUnavailableReason({
        role: listing.seller.role,
        customerMessagingEnabled: listing.seller.customerMessagingEnabled,
        vacationModeEnabled: listing.seller.vacationModeEnabled,
      });
  const viewerCanMessageSeller =
    !isPreviewListing &&
    (currentUser?.role === "seller" || currentUser?.role === "admin"
      ? true
      : canBuyerMessageSeller({
          role: listing.seller.role,
          customerMessagingEnabled: listing.seller.customerMessagingEnabled,
          vacationModeEnabled: listing.seller.vacationModeEnabled,
        }));
  const lowestAvailablePrice = availableSizes.length > 0
    ? Math.min(...availableSizes.map((s) => s.price))
    : (listing.sizes.length > 0 ? Math.min(...listing.sizes.map((s) => s.price)) : 0);
  const displayPrice = selectedSizeData
    ? `$${selectedSizeData.price}`
    : lowestAvailablePrice > 0
    ? `From $${lowestAvailablePrice}`
    : "Sold out";
  const totalImages = Math.max(listing.images.length, 1);
  const displayDescription =
    sanitizeSneakerDescription(listing.description) ||
    "No additional description was provided for this listing.";

  const handleThumbnailClick = (index: number) => {
    setCurrentImageIndex(index);
  };

  const conditionBadgeColor = {
    New: "bg-emerald-400 text-black border border-emerald-300",
    Used: "bg-amber-300 text-black border border-amber-200",
    "New + Used": "bg-sky-300 text-black border border-sky-200",
  };

  const boxConditionBadgeColor = {
    New: "bg-emerald-400 text-black border border-emerald-300",
    Good: "bg-blue-400/10 text-blue-400 border border-blue-400/20",
    Fair: "bg-amber-400/10 text-amber-400 border border-amber-400/20",
    Poor: "bg-orange-400/10 text-orange-400 border border-orange-400/20",
    "No Box": "bg-red-400/10 text-red-400 border border-red-400/20",
  };

  const hasMultipleImages = listing.images.length > 1;

  return (
    <div>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-8 text-sm text-relay-muted">
          <Link href="/marketplace" className="hover:text-relay-text transition-colors">
            Marketplace
          </Link>
          <ChevronRight size={16} />
          <Link href={`/marketplace?brand=${listing.brand}`} className="hover:text-relay-text transition-colors">
            {listing.brand}
          </Link>
          <ChevronRight size={16} />
          <span className="text-relay-text">{listing.model}</span>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-8 mb-8">
          {/* LEFT COLUMN - IMAGE GALLERY */}
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-start gap-3">
              {hasMultipleImages && (
                <div className="flex w-[64px] flex-shrink-0 flex-col gap-2">
                  {listing.images.map((imageUrl, index) => (
                    <button
                      key={index}
                      onClick={() => handleThumbnailClick(index)}
                      className={`w-[64px] h-[64px] rounded-xl overflow-hidden border-2 transition-all ${
                        currentImageIndex === index
                          ? "border-relay-accent"
                          : "border-white/10 hover:border-white/20"
                      } bg-gradient-to-br ${listing.gradient} flex items-center justify-center cursor-pointer`}
                    >
                      {imageUrl ? (
                        <img src={imageUrl} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-relay-subtle">{index + 1}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Main Image */}
              <div
                className={`relative min-w-0 flex-1 rounded-2xl overflow-hidden bg-gradient-to-br ${listing.gradient} border border-white/10`}
              >
                {listing.images[currentImageIndex] ? (
                  <img
                    src={listing.images[currentImageIndex]}
                    alt={`${listing.brand} ${listing.model} - Image ${currentImageIndex + 1}`}
                    className="block w-full h-auto max-h-[70vh] object-contain"
                  />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center">
                    <div className="text-relay-subtle text-lg">
                      Image {currentImageIndex + 1}
                    </div>
                  </div>
                )}

                {/* Image Counter */}
                {hasMultipleImages && (
                  <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/20">
                    <p className="text-sm font-medium text-relay-text">
                      {currentImageIndex + 1} / {totalImages}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="relay-card p-6 lg:flex-1">
              <h2 className="text-xl font-semibold text-relay-text mb-4">
                Description
              </h2>
              <p className="text-relay-muted leading-relaxed whitespace-pre-wrap">
                {displayDescription}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 mt-6 border-t border-white/10">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={16} className="text-relay-accent" />
                    <p className="text-sm font-semibold text-relay-text">Condition</p>
                  </div>
                  <p className="text-sm text-relay-subtle">
                    {listing.condition === "New"
                      ? "Never worn or used, with original packaging"
                      : listing.condition === "New + Used"
                      ? "This listing includes both brand-new and pre-owned variants. Select the exact variant to review its condition and price."
                      : "Pre-owned pair. Review the seller photos carefully to judge actual condition."}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Package size={16} className="text-relay-accent" />
                    <p className="text-sm font-semibold text-relay-text">Box</p>
                  </div>
                  <p className="text-sm text-relay-subtle">
                    {listing.boxCondition === "Good"
                      ? "Original box included in good condition with minor wear"
                      : listing.boxCondition === "New"
                      ? "Original box included in pristine condition"
                      : listing.boxCondition === "Fair"
                      ? "Original box included with significant wear"
                      : listing.boxCondition === "Poor"
                      ? "Original box included but heavily damaged"
                      : "No original box included"}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Truck size={16} className="text-relay-accent" />
                    <p className="text-sm font-semibold text-relay-text">Sizing</p>
                  </div>
                  <p className="text-sm text-relay-subtle">
                    Men&apos;s US sizing. Fits true to size. Review the selected size and seller notes before purchasing.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - LISTING INFO */}
          <div className="flex h-full flex-col gap-6">
            {/* Brand & Model Info */}
            <div>
              <p className="relay-eyebrow text-relay-accent mb-2">
                {listing.brand}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-relay-text mb-2">
                {listing.model}
              </h1>
              {listing.nickname && (
                <p className="text-white/50 text-lg">{listing.nickname}</p>
              )}
            </div>

            {/* Condition Badges */}
            <div className="flex gap-2 flex-wrap">
              <span
                className={`relay-badge text-xs ${
                  conditionBadgeColor[listing.condition]
                }`}
              >
                {listing.condition}
              </span>
              <span
                className={`relay-badge text-xs ${
                  boxConditionBadgeColor[listing.boxCondition]
                }`}
              >
                Box: {listing.boxCondition}
              </span>
            </div>

            {/* Rating Row */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className={
                      i < Math.floor(listing.averageRating)
                        ? "fill-relay-accent text-relay-accent"
                        : "text-white/20"
                    }
                  />
                ))}
              </div>
              <Link
                href="#"
                className="text-sm text-relay-accent hover:text-relay-accent/80 transition-colors"
              >
                {listing.reviewCount} reviews
              </Link>
            </div>

            {/* SIZE SELECTOR */}
            <div className="relay-card p-6">
              <h2 className="text-sm font-semibold text-relay-text mb-4 uppercase tracking-wide">
                Select Variant
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {listing.sizes.map((sizeData) => (
                  <button
                    key={getSizeVariantKey(sizeData)}
                    onClick={() => setSelectedVariantId(getSizeVariantKey(sizeData))}
                    disabled={sizeData.quantity === 0}
                    className={`inline-flex min-h-[64px] flex-col items-center justify-center rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                      selectedVariantId === getSizeVariantKey(sizeData)
                        ? "border-2 border-relay-accent bg-relay-accent/20 text-relay-accent ring-1 ring-relay-accent/25"
                        : "border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <span>Size {sizeData.size}</span>
                    <span className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/55">
                      {sizeData.condition === "used" ? "Used" : "New"}
                    </span>
                  </button>
                ))}
              </div>
              {selectedSizeData && (
                <p className="text-sm text-relay-muted">
                  {selectedSizeData.quantity} available · {selectedSizeData.condition === "used" ? "Used pair" : "New pair"}
                </p>
              )}
            </div>

            {/* PRICE SECTION */}
            <div className="relay-card p-6">
              <div className="text-3xl font-bold text-relay-text mb-2">
                {displayPrice}
              </div>
              <p className="text-xs text-relay-subtle">
                {isPreviewListing ? "Preview listing for staging test mode" : "1% platform fee included"}
              </p>
            </div>

            {sellerOnVacation && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-semibold text-amber-300">Seller on vacation</p>
                <p className="text-sm text-amber-100/80 mt-1">{sellerVacationNotice}</p>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (!currentUser) {
                    router.push('/auth/login');
                    return;
                  }
                  const variantParam = selectedSizeData?.id
                    ? `&variant=${encodeURIComponent(selectedSizeData.id)}`
                    : "";
                  router.push(`/checkout?listing=${params.id}&size=${encodeURIComponent(selectedSizeData?.size || "")}${variantParam}`);
                }}
                disabled={!selectedSizeData || isPreviewListing || sellerOnVacation}
                className="relay-button-accent w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <ShoppingCart size={20} />
                {isPreviewListing ? "Preview Only" : sellerOnVacation ? "Seller Unavailable" : "Buy Now"}
              </button>
              <button
                onClick={handleMessageSeller}
                disabled={messagingLoading || !viewerCanMessageSeller}
                className="relay-button-secondary w-full py-3 text-base flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <MessageSquare size={20} />
                {!viewerCanMessageSeller
                  ? sellerOnVacation
                    ? "Seller on Vacation"
                    : "Messaging Unavailable"
                  : messagingLoading
                  ? "Opening..."
                  : "Message Seller"}
              </button>
              {!viewerCanMessageSeller && buyerMessagingUnavailableReason && (
                <p className="text-xs text-relay-subtle text-center mt-1">
                  {buyerMessagingUnavailableReason}
                </p>
              )}
              {isPreviewListing && (
                <p className="text-xs text-relay-subtle text-center mt-1">
                  Preview listings are staging-only and let you review the listing page layout without a live checkout flow.
                </p>
              )}
            </div>

            {/* SELLER INFO CARD */}
            {isPreviewListing ? (
              <div className="relay-subcard p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={listing.seller.avatar}
                    alt={listing.seller.displayName}
                    className="w-12 h-12 rounded-full border border-white/10"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-relay-text">
                        {listing.seller.displayName}
                      </p>
                      {listing.seller.isVerified && (
                        <BadgeCheck size={16} className="text-relay-accent flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-relay-subtle">
                      @{listing.seller.username}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-relay-subtle text-xs">Sales</p>
                    <p className="text-relay-text font-semibold text-sm mt-1">
                      {listing.seller.totalSales.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-relay-subtle text-xs">Rating</p>
                    <p className="text-relay-text font-semibold text-sm mt-1">
                      {listing.seller.rating}
                    </p>
                  </div>
                  <div>
                    <p className="text-relay-subtle text-xs">Joined</p>
                    <p className="text-relay-text font-semibold text-sm mt-1">
                      {listing.seller.joinedDate}
                    </p>
                  </div>
                </div>

                <div className="w-full mt-4 relay-button-secondary text-sm text-center opacity-70">
                  Preview Seller Card
                </div>
              </div>
            ) : (
            <Link href={`/profile/${listing.seller.username}`}>
              <div className="relay-subcard p-4 hover:border-white/20 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={listing.seller.avatar}
                    alt={listing.seller.displayName}
                    className="w-12 h-12 rounded-full border border-white/10"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-relay-text">
                        {listing.seller.displayName}
                      </p>
                      {listing.seller.isVerified && (
                        <BadgeCheck size={16} className="text-relay-accent flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-relay-subtle">
                      @{listing.seller.username}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-relay-subtle text-xs">Sales</p>
                    <p className="text-relay-text font-semibold text-sm mt-1">
                      {listing.seller.totalSales.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-relay-subtle text-xs">Rating</p>
                    <p className="text-relay-text font-semibold text-sm mt-1">
                      {listing.seller.rating}
                    </p>
                  </div>
                  <div>
                    <p className="text-relay-subtle text-xs">Joined</p>
                    <p className="text-relay-text font-semibold text-sm mt-1">
                      {listing.seller.joinedDate}
                    </p>
                  </div>
                </div>

                <button className="w-full mt-4 relay-button-secondary text-sm">
                  View Profile
                </button>
              </div>
            </Link>
            )}
          </div>
        </div>
    </div>
  );
}
