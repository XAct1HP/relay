import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLegacySizes, mergeListingVariants, normalizeSku, type VariantInput } from "@/lib/listings";

type ListingStatus = "active" | "sold_out" | "inactive" | "removed" | "pending_review" | "rejected";
type ListingCondition = "new" | "like_new" | "used_excellent" | "used_good" | "used_fair";
type BoxCondition = "perfect" | "good" | "damaged" | "no_box";
type ApproxSizing = "lightweight" | "normal" | "heavy";

export interface InventoryUpsertVariantInput {
  size: string;
  quantity: number;
  price: number;
}

export interface InventoryUpsertInput {
  seller_id: string;
  sku: string;
  product?: {
    brand?: string | null;
    model?: string | null;
    nickname?: string | null;
    description?: string | null;
    images?: string[] | null;
    condition?: ListingCondition | null;
    box_condition?: BoxCondition | null;
    approx_sizing?: ApproxSizing | null;
    status?: ListingStatus | null;
  };
  variants: InventoryUpsertVariantInput[];
}

export interface InventoryUpsertResult {
  listingId: string;
  normalizedSku: string;
  merged: boolean;
  variantCount: number;
  status: ListingStatus;
}

export class InventoryUpsertError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InventoryUpsertError";
    this.code = code;
  }
}

interface NormalizedInventoryInput {
  sellerId: string;
  normalizedSku: string;
  displaySku: string;
  product: {
    brand: string;
    model: string;
    nickname: string | null;
    description: string;
    images: string[];
    condition: ListingCondition;
    boxCondition: BoxCondition;
    approxSizing: ApproxSizing;
    status: ListingStatus;
  };
  variants: VariantInput[];
}

export async function upsertSellerSkuInventory(
  supabase: SupabaseClient,
  input: InventoryUpsertInput
): Promise<InventoryUpsertResult> {
  const normalized = normalizeInventoryUpsertInput(input);

  const existingListing = await findExistingSellerSkuListing(
    supabase,
    normalized.sellerId,
    normalized.normalizedSku
  );

  if (existingListing) {
    const { error: updateError } = await supabase
      .from("listings")
      .update({
        brand: normalized.product.brand,
        model: normalized.product.model,
        nickname: normalized.product.nickname,
        description: normalized.product.description,
        images: normalized.product.images.length > 0 ? normalized.product.images : existingListing.images || [],
        condition: normalized.product.condition,
        box_condition: normalized.product.boxCondition,
        approx_sizing: normalized.product.approxSizing,
        sku: normalized.displaySku,
        status: existingListing.status === "removed" ? normalized.product.status : existingListing.status,
      })
      .eq("id", existingListing.id)
      .eq("seller_id", normalized.sellerId);

    if (updateError) {
      throw new InventoryUpsertError("listing_update_failed", updateError.message);
    }

    await mergeListingVariants(supabase, existingListing.id, normalized.variants);

    return {
      listingId: existingListing.id,
      normalizedSku: normalized.normalizedSku,
      merged: true,
      variantCount: normalized.variants.length,
      status: existingListing.status,
    };
  }

  const insertPayload = {
    seller_id: normalized.sellerId,
    brand: normalized.product.brand,
    model: normalized.product.model,
    nickname: normalized.product.nickname,
    condition: normalized.product.condition,
    box_condition: normalized.product.boxCondition,
    approx_sizing: normalized.product.approxSizing,
    description: normalized.product.description,
    images: normalized.product.images,
    sizes: buildLegacySizes(normalized.variants),
    sku: normalized.displaySku,
    status: normalized.product.status,
  };

  const { data: createdListing, error: createError } = await supabase
    .from("listings")
    .insert(insertPayload)
    .select("id, status")
    .single();

  if (createError || !createdListing) {
    if ((createError as { code?: string } | null)?.code === "23505") {
      const conflictedListing = await findExistingSellerSkuListing(
        supabase,
        normalized.sellerId,
        normalized.normalizedSku
      );

      if (conflictedListing) {
        await mergeListingVariants(supabase, conflictedListing.id, normalized.variants);

        return {
          listingId: conflictedListing.id,
          normalizedSku: normalized.normalizedSku,
          merged: true,
          variantCount: normalized.variants.length,
          status: conflictedListing.status,
        };
      }
    }

    throw new InventoryUpsertError(
      "listing_create_failed",
      createError?.message || "Failed to create SKU listing."
    );
  }

  await mergeListingVariants(supabase, createdListing.id, normalized.variants);

  return {
    listingId: createdListing.id,
    normalizedSku: normalized.normalizedSku,
    merged: false,
    variantCount: normalized.variants.length,
    status: createdListing.status as ListingStatus,
  };
}

function normalizeInventoryUpsertInput(input: InventoryUpsertInput): NormalizedInventoryInput {
  const sellerId = String(input.seller_id || "").trim();
  if (!sellerId) {
    throw new InventoryUpsertError("invalid_seller_id", "A valid seller_id is required.");
  }

  const normalizedSku = normalizeSku(input.sku);
  if (!normalizedSku) {
    throw new InventoryUpsertError("invalid_sku", "A valid SKU is required for catalog inventory.");
  }

  const variants = input.variants
    .map((variant) => ({
      size: String(variant.size || "").trim(),
      price: Number(variant.price),
      quantity: Number(variant.quantity),
      is_active: true,
    }))
    .filter((variant) => variant.size);

  if (variants.length === 0) {
    throw new InventoryUpsertError("missing_variants", "At least one valid variant is required.");
  }

  for (const variant of variants) {
    if (!Number.isFinite(variant.price) || variant.price <= 0) {
      throw new InventoryUpsertError(
        "invalid_variant_price",
        `Variant size ${variant.size} must have a price greater than 0.`
      );
    }
    if (!Number.isFinite(variant.quantity) || variant.quantity <= 0) {
      throw new InventoryUpsertError(
        "invalid_variant_quantity",
        `Variant size ${variant.size} must have a quantity greater than 0.`
      );
    }
  }

  const product = input.product || {};
  const displaySku = String(input.sku || "").trim().toUpperCase() || normalizedSku;
  const fallbackBrand = product.brand?.trim() || "Catalog Sneaker";
  const fallbackModel = product.model?.trim() || `SKU ${displaySku}`;
  const description =
    product.description?.trim() ||
    `Catalog placeholder for SKU ${displaySku}. Update this listing when richer product data is available.`;

  return {
    sellerId,
    normalizedSku,
    displaySku,
    product: {
      brand: fallbackBrand,
      model: fallbackModel,
      nickname: product.nickname?.trim() || null,
      description,
      images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
      condition: product.condition || "new",
      boxCondition: product.box_condition || "perfect",
      approxSizing: product.approx_sizing || "normal",
      status: product.status || "active",
    },
    variants,
  };
}

async function findExistingSellerSkuListing(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSku: string
) {
  const { data, error } = await supabase
    .from("listings")
    .select("id, status, images")
    .eq("seller_id", sellerId)
    .eq("sku_normalized", normalizedSku)
    .neq("status", "removed")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new InventoryUpsertError("listing_lookup_failed", error.message);
  }

  return data;
}
