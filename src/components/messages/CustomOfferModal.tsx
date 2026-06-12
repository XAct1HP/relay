"use client";

import { useState, useEffect } from "react";
import { X, DollarSign, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";

interface ListingOption {
  id: string;
  name: string;
  sku?: string | null;
  sizes: { id?: string; size: string; price: number; quantity: number }[];
}

const RELAY_FEE_PERCENTAGE = 0.01; // 1% platform fee
const STRIPE_FEE_PERCENTAGE = 0.03; // 3% Stripe fee
const STRIPE_FEE_FIXED = 0.30; // $0.30 Stripe fixed fee

export function CustomOfferModal({
  onClose,
  conversationId,
  recipientName,
  onOfferSent,
}: {
  onClose: () => void;
  conversationId: string;
  recipientName: string;
  onOfferSent: (conversationId: string, offerMessage: any) => void;
}) {
  const { currentUser } = useAuth();
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [offerPrice, setOfferPrice] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch the seller's own active listings
  useEffect(() => {
    async function fetchMyListings() {
      if (!currentUser?.id) return;
      const supabase = createClient();

      const { data, error } = await supabase
        .from("listings")
        .select("id, brand, model, nickname, sku, sizes, listing_variants(id, size, price, quantity, is_active)")
        .eq("seller_id", currentUser!.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (data) {
        const formatted: ListingOption[] = data.map((listing: any) => ({
          id: listing.id,
          name: `${listing.brand} ${listing.model}${listing.nickname ? ` "${listing.nickname}"` : ""}${listing.sku ? ` [SKU ${listing.sku}]` : ""}`,
          sku: listing.sku || null,
          sizes: ((listing.listing_variants as any[])?.length
            ? (listing.listing_variants as any[])
                .filter((variant: any) => variant.is_active !== false)
                .map((variant: any) => ({
                  id: variant.id,
                  size: variant.size?.toString() || "",
                  price: Number(variant.price) || 0,
                  quantity: variant.quantity || 0,
                }))
            : (listing.sizes as any[])?.map((s: any) => ({
                size: s.size?.toString() || "",
                price: s.price || 0,
                quantity: s.quantity || 0,
              })) || []
          ).filter((s: any) => s.size && s.quantity > 0),
        }));
        setListings(formatted);
      }
      setLoadingListings(false);
    }

    fetchMyListings();
  }, [currentUser?.id]);

  const selectedListing = listings.find((l) => l.id === selectedListingId);
  const availableSizes = selectedListing?.sizes || [];
  const selectedSizeData = availableSizes.find((s) => s.size === selectedSize);
  const originalPrice = selectedSizeData?.price || 0;

  // Calculate fee breakdown
  const offerPriceNum = parseFloat(offerPrice) || 0;
  const relayFee = offerPriceNum * RELAY_FEE_PERCENTAGE;
  const stripeFee = offerPriceNum * STRIPE_FEE_PERCENTAGE + STRIPE_FEE_FIXED;
  const sellerEarnings = offerPriceNum - relayFee - stripeFee;

  const canSubmit =
    selectedListingId &&
    selectedSize &&
    offerPrice &&
    offerPriceNum > 0 &&
    offerPriceNum < originalPrice;

  const handleSubmit = async () => {
    if (!canSubmit || !currentUser?.id || !selectedListing) return;
    if (!currentUser.offers_enabled) {
      alert("Enable offers in seller settings before sending custom offers.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/offers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          conversationId,
          listingId: selectedListingId,
          listingVariantId: selectedSizeData?.id || null,
          size: selectedSize,
          offerPrice: offerPriceNum,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send offer.");
      }

      if (data.message) {
        onOfferSent(conversationId, data.message);
      }

      onClose();
    } catch (error: any) {
      console.error("Error sending offer:", error);
      alert(error?.message || "Failed to send offer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="relay-card p-6 w-full max-w-md space-y-6 rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-relay-text">Send Custom Offer</h2>
              <p className="text-sm text-white/60 mt-1">
                to {recipientName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Listing Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-relay-text mb-2">
                Select Listing
              </label>
              {loadingListings ? (
                <div className="text-sm text-white/40 bg-white/5 rounded-xl p-4 border border-white/10">
                  Loading your listings...
                </div>
              ) : listings.length === 0 ? (
                <div className="text-sm text-white/40 bg-white/5 rounded-xl p-4 border border-white/10">
                  You have no active listings to offer.
                </div>
              ) : (
                <select
                  value={selectedListingId}
                  onChange={(e) => {
                    setSelectedListingId(e.target.value);
                    setSelectedSize("");
                    setOfferPrice("");
                  }}
                  className="relay-select"
                >
                  <option value="">Choose a listing...</option>
                  {listings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Size Dropdown */}
            {selectedListing && (
              <div>
                <label className="block text-sm font-semibold text-relay-text mb-2">
                  Size
                </label>
                <select
                  value={selectedSize}
                  onChange={(e) => {
                    setSelectedSize(e.target.value);
                    setOfferPrice("");
                  }}
                  className="relay-select"
                >
                  <option value="">Choose a size...</option>
                  {availableSizes.map((s) => (
                    <option key={s.size} value={s.size}>
                      Size {s.size} - ${s.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Original Price Display */}
            {selectedSizeData && (
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Listed Price (Size {selectedSize})</span>
                  <span className="text-sm font-semibold text-relay-text">
                    {"$"}{originalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Custom Offer Price */}
            <div>
              <label className="block text-sm font-semibold text-relay-text mb-2">
                Custom Offer Price
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="number"
                  placeholder="0.00"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  className="relay-input"
                  style={{ paddingLeft: "2.5rem" }}
                  step="0.01"
                  min="0"
                  max={originalPrice || undefined}
                />
              </div>
              {selectedSizeData && offerPriceNum >= originalPrice && offerPriceNum > 0 && (
                <p className="text-xs text-red-400 mt-1">
                  Offer must be lower than the listed price
                </p>
              )}
            </div>

            {/* Fee Breakdown */}
            {selectedSizeData && offerPriceNum > 0 && (
              <div className="bg-relay-accent-strong/10 border border-relay-accent-strong/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Offer Price</span>
                  <span className="text-white/80">{"$"}{offerPriceNum.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Relay Fee (1%)</span>
                  <span className="text-white/60">-{"$"}{relayFee.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Stripe Fee (3% + $0.30)</span>
                  <span className="text-white/60">-{"$"}{stripeFee.toFixed(2)}</span>
                </div>
                <div className="border-t border-relay-accent/20 pt-2 flex items-center justify-between">
                  <span className="font-semibold text-sm text-relay-accent">You earn</span>
                  <span className="font-semibold text-sm text-relay-accent">
                    {"$"}{Math.max(0, sellerEarnings).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 relay-button-secondary">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className={`flex-1 relay-button-accent flex items-center justify-center gap-2 ${
                !canSubmit || isSubmitting ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <Tag className="w-4 h-4" />
              {isSubmitting ? "Sending..." : "Send Offer"}
            </button>
          </div>

          {/* Helper text */}
          <p className="text-xs text-white/40 text-center">
            The buyer will receive this offer and can accept or decline
          </p>
        </div>
      </div>
    </>
  );
}
