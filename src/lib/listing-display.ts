interface DisplayVariant {
  id?: string;
  size: string;
  price: number;
  quantity: number;
  isActive: boolean;
}

export interface NormalizedDisplayVariant extends DisplayVariant {}

type ListingDisplayInput = {
  id?: string;
  seller_id?: string;
  listing_type?: string;
  sku_normalized?: string | null;
  images?: string[];
  sizes?: any[];
  listing_variants?: Array<{
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

export function getListingDisplayMetrics(listing: ListingDisplayInput): ListingDisplayMetrics {
  const variants = getNormalizedVariants(listing);
  const availableVariants = variants.filter((variant) => variant.isActive && variant.quantity > 0 && variant.price > 0);
  const source = availableVariants.length > 0 ? availableVariants : variants.filter((variant) => variant.isActive && variant.price > 0);

  const sizeLabels = source.map((variant) => variant.size);
  const sizes = sizeLabels
    .map((size) => Number(size))
    .filter((size) => Number.isFinite(size))
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

export function dedupeSkuListings<T extends ListingDisplayInput>(listings: T[]): T[] {
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

    deduped.set(key, choosePreferredListing(existing, listing));
  }

  return Array.from(deduped.values());
}

function choosePreferredListing<T extends ListingDisplayInput>(current: T, candidate: T): T {
  const currentMetrics = getListingDisplayMetrics(current);
  const candidateMetrics = getListingDisplayMetrics(candidate);

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

function getNormalizedVariants(listing: ListingDisplayInput): DisplayVariant[] {
  const listingVariants = Array.isArray(listing.listing_variants) ? listing.listing_variants : [];

  if (listingVariants.length > 0) {
    return listingVariants
      .map((variant) => ({
        id: variant.id,
        size: String(variant.size || "").trim(),
        price: Number(variant.price) || 0,
        quantity: Number(variant.quantity) || 0,
        isActive: variant.is_active !== false,
      }))
      .filter((variant) => variant.size)
      .sort(compareVariantSize);
  }

  const legacySizes = Array.isArray(listing.sizes) ? listing.sizes : [];
  return legacySizes
    .map((variant: any) => ({
      size: String(variant?.size || "").trim(),
      price: Number(variant?.price) || 0,
      quantity: Number(variant?.quantity) || 0,
      isActive: true,
    }))
    .filter((variant) => variant.size)
    .sort(compareVariantSize);
}

export function getListingNormalizedVariants(listing: ListingDisplayInput): NormalizedDisplayVariant[] {
  return getNormalizedVariants(listing);
}

function compareVariantSize(a: DisplayVariant, b: DisplayVariant): number {
  const aSize = Number(a.size);
  const bSize = Number(b.size);

  if (Number.isFinite(aSize) && Number.isFinite(bSize)) {
    return aSize - bSize;
  }

  return a.size.localeCompare(b.size, undefined, { numeric: true });
}
