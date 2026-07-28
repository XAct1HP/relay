import { compareShoeSizeLabels, parseShoeSize } from "@/lib/shoe-size";

interface DisplayVariant {
  id?: string;
  size: string;
  price: number;
  quantity: number;
  condition: "new" | "used";
  isActive: boolean;
  needsConditionPhoto?: boolean;
  conditionPhotoUrl?: string | null;
}

function toVariantCondition(value: string | null | undefined): "new" | "used" {
  return value === "used" ? "used" : "new";
}

export interface NormalizedDisplayVariant extends DisplayVariant {}

type ListingDisplayInput = {
  id?: string;
  seller_id?: string;
  listing_type?: string;
  sku_normalized?: string | null;
  images?: string[];
  sizes?: any[];
  condition?: string;
  listing_variants?: Array<{
    id?: string;
    size?: string;
    price?: number;
    quantity?: number;
    condition?: string;
    is_active?: boolean;
    needs_condition_photo?: boolean;
    condition_photo_url?: string | null;
  }>;
  listing_used_items?: Array<{
    id?: string;
    size?: string;
    price?: number;
    quantity?: number;
    is_active?: boolean;
  }>;
  created_at?: string;
  updated_at?: string;
};

export interface ListingDisplayMetrics {
  variants: NormalizedDisplayVariant[];
  availableVariants: NormalizedDisplayVariant[];
  sizes: number[];
  sizeLabels: string[];
  lowestPrice: number;
}

interface ListingDisplayMetricOptions {
  includeUsedItems?: boolean;
}

export function getListingDisplayMetrics(
  listing: ListingDisplayInput,
  options?: ListingDisplayMetricOptions
): ListingDisplayMetrics {
  const variants = getNormalizedVariants(listing, options);
  const availableVariants = variants.filter((variant) => variant.isActive && variant.quantity > 0 && variant.price > 0);
  const source = availableVariants.length > 0 ? availableVariants : variants.filter((variant) => variant.isActive && variant.price > 0);

  const sizeLabels = Array.from(new Set(source.map((variant) => variant.size))).sort(compareShoeSizeLabels);
  const parsedSizeLabels = sizeLabels.map((label) => parseShoeSize(label));
  const sizes = Array.from(
    new Set(
      parsedSizeLabels
        .filter(
          (parsed) =>
            parsed.numeric_value !== null &&
            (parsed.system === "us" || parsed.system === "us_men")
        )
        .map((parsed) => Number(parsed.numeric_value))
    )
  )
    .map((size) => Number(size))
    .sort((a, b) => a - b);
  const prices = source.map((variant) => variant.price).filter((price) => price > 0);

  return {
    variants,
    availableVariants,
    sizeLabels,
    sizes,
    lowestPrice: prices.length > 0 ? Math.min(...prices) : 0,
  };
}

export function formatSizeDisplay(sizes: number[], sizeLabels: string[] = []): string {
  const parsedSizeLabels = sizeLabels.map((label) => parseShoeSize(label));
  const hasNonStandardLabels = parsedSizeLabels.some(
    (parsed) => parsed.system === "eu" || parsed.system === "us_women" || parsed.system === "unknown"
  );

  if (hasNonStandardLabels) {
    if (sizeLabels.length === 1) return `Size ${sizeLabels[0]}`;
    if (sizeLabels.length > 1 && sizeLabels.length <= 3) return `Sizes ${sizeLabels.join(", ")}`;
    if (sizeLabels.length > 3) return `${sizeLabels.length} sizes available`;
    return "";
  }

  if (sizes.length === 0) {
    if (sizeLabels.length === 1) return `Size ${sizeLabels[0]}`;
    if (sizeLabels.length > 1 && sizeLabels.length <= 3) return `Sizes ${sizeLabels.join(", ")}`;
    if (sizeLabels.length > 3) return `${sizeLabels.length} sizes available`;
    return "";
  }

  if (sizes.length === 1) return `Size ${sizes[0]}`;
  if (sizes.length <= 3) return `Sizes ${sizes.join(", ")}`;
  if (Math.max(...sizes) - Math.min(...sizes) < 1) return `Sizes ${Math.min(...sizes)}-${Math.max(...sizes)}`;
  return `Sizes ${Math.min(...sizes)}-${Math.max(...sizes)}`;
}

export function dedupeSkuListings<T extends ListingDisplayInput>(
  listings: T[],
  options?: ListingDisplayMetricOptions
): T[] {
  const deduped = new Map<string, T>();

  for (const listing of listings) {
    const key =
      listing.listing_type === "sku" && listing.sku_normalized && listing.seller_id
        ? `${listing.seller_id}:${listing.sku_normalized}`
        : listing.id || `${listing.seller_id || "unknown"}:${Math.random()}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, listing);
      continue;
    }

    deduped.set(key, choosePreferredListing(existing, listing, options));
  }

  return Array.from(deduped.values());
}

function choosePreferredListing<T extends ListingDisplayInput>(
  current: T,
  candidate: T,
  options?: ListingDisplayMetricOptions
): T {
  const currentMetrics = getListingDisplayMetrics(current, options);
  const candidateMetrics = getListingDisplayMetrics(candidate, options);

  if (candidateMetrics.availableVariants.length !== currentMetrics.availableVariants.length) {
    return candidateMetrics.availableVariants.length > currentMetrics.availableVariants.length ? candidate : current;
  }

  if ((candidate.images?.length || 0) !== (current.images?.length || 0)) {
    return (candidate.images?.length || 0) > (current.images?.length || 0) ? candidate : current;
  }

  const currentUpdatedAt = new Date(current.updated_at || current.created_at || 0).getTime();
  const candidateUpdatedAt = new Date(candidate.updated_at || candidate.created_at || 0).getTime();
  return candidateUpdatedAt >= currentUpdatedAt ? candidate : current;
}

function getNormalizedVariants(
  listing: ListingDisplayInput,
  options?: ListingDisplayMetricOptions
): DisplayVariant[] {
  const listingVariants = Array.isArray(listing.listing_variants) ? listing.listing_variants : [];
  const listingUsedItems =
    options?.includeUsedItems && Array.isArray(listing.listing_used_items)
      ? listing.listing_used_items
      : [];

  if (listingVariants.length > 0) {
    return [
      ...listingVariants.map((variant) => ({
        id: variant.id,
        size: String(variant.size || "").trim(),
        price: Number(variant.price) || 0,
        quantity: Number(variant.quantity) || 0,
        condition: toVariantCondition(variant.condition),
        isActive: variant.is_active !== false,
        needsConditionPhoto: variant.needs_condition_photo === true,
        conditionPhotoUrl:
          typeof variant.condition_photo_url === "string" && variant.condition_photo_url.length > 0
            ? variant.condition_photo_url
            : null,
      }))
      .filter((variant) => variant.size),
      ...listingUsedItems.map((item) => ({
        id: item.id,
        size: String(item.size || "").trim(),
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 0,
        condition: "used" as const,
        isActive: item.is_active !== false,
      }))
      .filter((item) => item.size),
    ]
      .sort(compareVariantSize);
  }

  const legacySizes = Array.isArray(listing.sizes) ? listing.sizes : [];
  return legacySizes
    .map((variant: any) => ({
      size: String(variant?.size || "").trim(),
      price: Number(variant?.price) || 0,
      quantity: Number(variant?.quantity) || 0,
      condition: toVariantCondition(
        variant?.condition === "used" || listing.condition === "mixed" || listing.condition?.startsWith("used")
          ? "used"
          : "new"
      ),
      isActive: true,
    }))
    .filter((variant) => variant.size)
    .sort(compareVariantSize);
}

export function getListingNormalizedVariants(
  listing: ListingDisplayInput,
  options?: ListingDisplayMetricOptions
): NormalizedDisplayVariant[] {
  return getNormalizedVariants(listing, options);
}

/**
 * Build a clean shoe title without duplicating the brand.
 *
 * Sneaker catalog data often stores model as the full product name
 * (e.g. brand "Nike", model "Nike Dunk Low Retro White Black Panda").
 * Naive `${brand} ${model}` concatenation then produces
 * "Nike Nike Dunk Low ...".
 *
 * This helper strips a leading brand prefix from the model before
 * joining, so display everywhere renders as
 * "Nike Dunk Low Retro White Black Panda" (with an optional nickname).
 *
 * Pass a fallback like "Untitled Listing" if you want a guaranteed
 * non-empty result. Otherwise an empty string is returned.
 */
export function formatListingTitle(
  brand: string | null | undefined,
  model: string | null | undefined,
  nickname?: string | null | undefined,
  fallback?: string
): string {
  const b = String(brand || "").trim();
  const rawModel = String(model || "").trim();
  const n = String(nickname || "").trim();

  let cleanedModel = rawModel;
  if (b && rawModel) {
    // Case-insensitive prefix match on word boundary
    const lowerModel = rawModel.toLowerCase();
    const lowerBrand = b.toLowerCase();
    if (
      lowerModel === lowerBrand ||
      lowerModel.startsWith(lowerBrand + " ") ||
      lowerModel.startsWith(lowerBrand + "-")
    ) {
      cleanedModel = rawModel.slice(b.length).replace(/^[\s-]+/, "").trim();
    }
  }

  const parts = [b, cleanedModel, n].filter((p) => p.length > 0);
  const result = parts.join(" ").trim();
  return result || fallback || "";
}


function compareVariantSize(a: DisplayVariant, b: DisplayVariant): number {
  const sizeCompare = compareShoeSizeLabels(a.size, b.size);
  if (sizeCompare !== 0) {
    return sizeCompare;
  }

  return a.condition.localeCompare(b.condition);
}
