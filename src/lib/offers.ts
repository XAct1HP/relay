export interface OfferListingSummary {
  brand?: string | null;
  model?: string | null;
  nickname?: string | null;
  sku?: string | null;
}

export function formatOfferListingName(listing?: OfferListingSummary | null): string {
  if (!listing) {
    return "Custom Offer";
  }

  const productName = [listing.brand, listing.model].filter(Boolean).join(" ").trim();
  const nickname = listing.nickname ? ` "${listing.nickname}"` : "";
  const sku = listing.sku ? ` [SKU ${listing.sku}]` : "";
  return `${productName || "Listing"}${nickname}${sku}`;
}

export const SOLD_OUT_OFFER_ERROR =
  "This offered size sold out before checkout. Ask the seller for a new offer.";
