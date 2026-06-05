import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCatalogProductBySku } from "@/lib/catalog-server";
import {
  bulkUpdateSellerInventory,
  InventoryUpsertError,
  updateSellerListingVariant,
  upsertSellerSkuInventory,
} from "@/lib/inventory";
import { normalizeSku } from "@/lib/listings";

interface ExternalInventoryVariantInput {
  size: unknown;
  quantity: unknown;
  price: unknown;
}

interface ExternalInventoryItemInput {
  sku: unknown;
  variants: unknown;
}

interface NormalizedIntegrationVariant {
  size: string;
  quantity: number;
  price: number;
}

interface NormalizedIntegrationItem {
  itemIndex: number;
  originalSku: string;
  normalizedSku: string;
  variants: NormalizedIntegrationVariant[];
}

interface ExistingListingSnapshot {
  listingId?: string;
  sizeSet: Set<string>;
}

interface SellerVariantLookupRow {
  listing_id: string;
  variant_id: string;
  size: string;
  quantity: number;
  price: number;
  is_active: boolean;
}

export interface IntegrationInventoryItemError {
  item_index: number;
  sku?: string;
  field?: "sku" | "variants" | "size" | "quantity" | "price" | "item";
  message: string;
}

export interface IntegrationInventoryUpsertReport {
  created_count: number;
  updated_count: number;
  skipped_count: number;
  item_errors: IntegrationInventoryItemError[];
}

export interface IntegrationInventoryVariantResult {
  item_index: number;
  sku: string;
  size: string;
  success: boolean;
  listing_id?: string;
  variant_id?: string;
  message?: string;
  error?: string;
}

export interface IntegrationInventoryVariantUpdateReport {
  updated_count: number;
  skipped_count: number;
  item_results: IntegrationInventoryVariantResult[];
}

export interface IntegrationInventoryDeactivateResult {
  sku: string;
  size?: string;
  success: boolean;
  listing_id?: string;
  variant_id?: string;
  message?: string;
  error?: string;
}

interface ExternalVariantUpdateInput {
  sku: unknown;
  size: unknown;
  quantity: unknown;
  price: unknown;
  active: unknown;
}

interface ExternalPriceUpdateInput {
  sku: unknown;
  size: unknown;
  price: unknown;
}

interface ExternalListingDeactivateInput {
  sku: unknown;
}

interface ExternalVariantDeactivateInput {
  sku: unknown;
  size: unknown;
}

export class IntegrationInventoryError extends Error {
  code: "invalid_request";

  constructor(message: string) {
    super(message);
    this.name = "IntegrationInventoryError";
    this.code = "invalid_request";
  }
}

export async function processIntegrationInventoryUpsert(
  supabase: SupabaseClient,
  sellerId: string,
  items: unknown
): Promise<IntegrationInventoryUpsertReport> {
  const validation = validateIntegrationItems(items);

  if (validation.validItems.length === 0) {
    return {
      created_count: 0,
      updated_count: 0,
      skipped_count: validation.skippedCount,
      item_errors: validation.errors,
    };
  }

  const existingListings = await loadExistingSellerSkuListings(
    supabase,
    sellerId,
    validation.validItems.map((item) => item.normalizedSku)
  );

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = validation.skippedCount;
  const itemErrors = [...validation.errors];

  for (const item of validation.validItems) {
    try {
      const catalogProduct = await resolveCatalogProductBySku(supabase, item.originalSku);

      if (!catalogProduct) {
        skippedCount += item.variants.length;
        itemErrors.push({
          item_index: item.itemIndex,
          sku: item.originalSku,
          field: "sku",
          message: `Unable to resolve product data for SKU ${item.originalSku}.`,
        });
        continue;
      }

      const existingListing = existingListings.get(item.normalizedSku);

      await upsertSellerSkuInventory(supabase, {
        seller_id: sellerId,
        sku: catalogProduct.sku,
        product: {
          catalog_product_id: catalogProduct.id,
          brand: catalogProduct.brand,
          model: catalogProduct.model,
          nickname: catalogProduct.nickname,
          description: catalogProduct.description,
          images: catalogProduct.images,
          condition: "new",
          box_condition: "perfect",
          approx_sizing: "normal",
          status: "active",
        },
        variants: item.variants,
      });

      if (!existingListing) {
        createdCount += item.variants.length;
      } else {
        for (const variant of item.variants) {
          if (existingListing.sizeSet.has(variant.size)) {
            updatedCount += 1;
          } else {
            createdCount += 1;
            existingListing.sizeSet.add(variant.size);
          }
        }
      }
    } catch (error) {
      skippedCount += item.variants.length;
      itemErrors.push({
        item_index: item.itemIndex,
        sku: item.originalSku,
        field: "item",
        message:
          error instanceof InventoryUpsertError
            ? error.message
            : `Failed to upsert inventory for SKU ${item.originalSku}.`,
      });
    }
  }

  return {
    created_count: createdCount,
    updated_count: updatedCount,
    skipped_count: skippedCount,
    item_errors: itemErrors,
  };
}

export async function processIntegrationVariantUpdate(
  supabase: SupabaseClient,
  sellerId: string,
  item: unknown
): Promise<IntegrationInventoryVariantUpdateReport> {
  const normalized = validateSingleVariantUpdate(item);
  const result = await updateVariantBySkuAndSize(supabase, sellerId, normalized, 0);

  return {
    updated_count: result.success ? 1 : 0,
    skipped_count: result.success ? 0 : 1,
    item_results: [result],
  };
}

export async function processIntegrationPriceUpdates(
  supabase: SupabaseClient,
  sellerId: string,
  updates: unknown
): Promise<IntegrationInventoryVariantUpdateReport> {
  if (!Array.isArray(updates)) {
    throw new IntegrationInventoryError("Request body must include an updates array.");
  }

  let updatedCount = 0;
  let skippedCount = 0;
  const itemResults: IntegrationInventoryVariantResult[] = [];

  for (let index = 0; index < updates.length; index += 1) {
    const rawUpdate = updates[index];

    try {
      const normalized = validatePriceUpdate(rawUpdate);
      const result = await updateVariantBySkuAndSize(supabase, sellerId, normalized, index, {
        updatePriceOnly: true,
      });

      if (result.success) {
        updatedCount += 1;
      } else {
        skippedCount += 1;
      }

      itemResults.push(result);
    } catch (error) {
      skippedCount += 1;
      itemResults.push({
        item_index: index,
        sku: String((rawUpdate as ExternalPriceUpdateInput | null)?.sku || "").trim().toUpperCase(),
        size: String((rawUpdate as ExternalPriceUpdateInput | null)?.size || "").trim(),
        success: false,
        error: error instanceof IntegrationInventoryError ? error.message : "Invalid price update payload.",
      });
    }
  }

  return {
    updated_count: updatedCount,
    skipped_count: skippedCount,
    item_results: itemResults,
  };
}

export async function processIntegrationListingDeactivate(
  supabase: SupabaseClient,
  sellerId: string,
  item: unknown
): Promise<IntegrationInventoryDeactivateResult> {
  const normalized = validateListingDeactivate(item);

  try {
    const listing = await resolveSellerListingBySku(
      supabase,
      sellerId,
      normalized.normalizedSku
    );

    if (!listing) {
      return {
        sku: normalized.sku,
        success: false,
        error: `Listing for SKU ${normalized.sku} was not found for this seller.`,
      };
    }

    const result = await bulkUpdateSellerInventory(supabase, {
      seller_id: sellerId,
      listing_ids: [listing.id],
      action: "deactivate",
    });

    if (result.updatedCount === 0 && result.errors.length > 0) {
      return {
        sku: normalized.sku,
        success: false,
        listing_id: listing.id,
        error: result.errors.join(" "),
      };
    }

    return {
      sku: normalized.sku,
      success: true,
      listing_id: listing.id,
      message: "Listing deactivated successfully.",
    };
  } catch (error) {
    return {
      sku: normalized.sku,
      success: false,
      error:
        error instanceof InventoryUpsertError
          ? error.message
          : `Failed to deactivate listing for SKU ${normalized.sku}.`,
    };
  }
}

export async function processIntegrationVariantDeactivate(
  supabase: SupabaseClient,
  sellerId: string,
  item: unknown
): Promise<IntegrationInventoryDeactivateResult> {
  const normalized = validateVariantDeactivate(item);

  try {
    const variant = await resolveSellerVariantBySkuAndSize(
      supabase,
      sellerId,
      normalized.normalizedSku,
      normalized.size
    );

    if (!variant) {
      return {
        sku: normalized.sku,
        size: normalized.size,
        success: false,
        error: `Variant ${normalized.size} for SKU ${normalized.sku} was not found for this seller.`,
      };
    }

    const result = await updateSellerListingVariant(supabase, {
      seller_id: sellerId,
      listing_id: variant.listing_id,
      variant_id: variant.variant_id,
      price: variant.price,
      quantity: variant.quantity,
      is_active: false,
    });

    return {
      sku: normalized.sku,
      size: result.variant.size,
      success: true,
      listing_id: result.listingId,
      variant_id: result.variant.id,
      message: "Variant deactivated successfully.",
    };
  } catch (error) {
    return {
      sku: normalized.sku,
      size: normalized.size,
      success: false,
      error:
        error instanceof InventoryUpsertError
          ? error.message
          : `Failed to deactivate variant ${normalized.size} for SKU ${normalized.sku}.`,
    };
  }
}

function validateIntegrationItems(items: unknown) {
  if (!Array.isArray(items)) {
    throw new IntegrationInventoryError("Request body must include an items array.");
  }

  const validItems: NormalizedIntegrationItem[] = [];
  const errors: IntegrationInventoryItemError[] = [];
  let skippedCount = 0;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const rawItem = items[itemIndex] as ExternalInventoryItemInput | null;
    const rawSku = String(rawItem?.sku || "").trim();
    const normalizedSku = normalizeSku(rawSku);
    const rawVariants = Array.isArray(rawItem?.variants)
      ? (rawItem?.variants as ExternalInventoryVariantInput[])
      : null;

    if (!normalizedSku) {
      skippedCount += rawVariants?.length || 1;
      errors.push({
        item_index: itemIndex,
        sku: rawSku || undefined,
        field: "sku",
        message: "SKU is required.",
      });
      continue;
    }

    if (!rawVariants || rawVariants.length === 0) {
      skippedCount += 1;
      errors.push({
        item_index: itemIndex,
        sku: rawSku,
        field: "variants",
        message: "At least one variant is required.",
      });
      continue;
    }

    const variants: NormalizedIntegrationVariant[] = [];
    const seenSizes = new Set<string>();
    let hasVariantError = false;

    for (const rawVariant of rawVariants) {
      const size = String(rawVariant?.size || "").trim();
      const quantity = Number(rawVariant?.quantity);
      const price = Number(rawVariant?.price);

      if (!size) {
        hasVariantError = true;
        errors.push({
          item_index: itemIndex,
          sku: rawSku,
          field: "size",
          message: "Variant size is required.",
        });
        continue;
      }

      if (!Number.isInteger(quantity) || quantity < 0) {
        hasVariantError = true;
        errors.push({
          item_index: itemIndex,
          sku: rawSku,
          field: "quantity",
          message: `Variant size ${size} must have an integer quantity greater than or equal to 0.`,
        });
        continue;
      }

      if (!Number.isFinite(price) || price <= 0) {
        hasVariantError = true;
        errors.push({
          item_index: itemIndex,
          sku: rawSku,
          field: "price",
          message: `Variant size ${size} must have a price greater than 0.`,
        });
        continue;
      }

      const normalizedSizeKey = size.toUpperCase();
      if (seenSizes.has(normalizedSizeKey)) {
        hasVariantError = true;
        errors.push({
          item_index: itemIndex,
          sku: rawSku,
          field: "size",
          message: `Duplicate size ${size} found for SKU ${rawSku}.`,
        });
        continue;
      }

      seenSizes.add(normalizedSizeKey);
      variants.push({
        size,
        quantity,
        price,
      });
    }

    if (hasVariantError || variants.length === 0) {
      skippedCount += rawVariants.length;
      continue;
    }

    validItems.push({
      itemIndex,
      originalSku: rawSku.toUpperCase(),
      normalizedSku,
      variants,
    });
  }

  return {
    validItems,
    errors,
    skippedCount,
  };
}

async function loadExistingSellerSkuListings(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSkus: string[]
): Promise<Map<string, ExistingListingSnapshot>> {
  const uniqueNormalizedSkus = Array.from(new Set(normalizedSkus.filter(Boolean)));
  if (uniqueNormalizedSkus.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("listings")
    .select("id, sku_normalized, listing_variants(size)")
    .eq("seller_id", sellerId)
    .in("sku_normalized", uniqueNormalizedSkus)
    .neq("status", "removed");

  if (error) {
    throw error;
  }

  const snapshot = new Map<string, ExistingListingSnapshot>();

  for (const listing of data || []) {
    const sku = String(listing.sku_normalized || "");
    if (!sku) {
      continue;
    }

    snapshot.set(sku, {
      listingId: listing.id,
      sizeSet: new Set(
        (((listing.listing_variants as Array<{ size?: string }> | null) || [])
          .map((variant) => String(variant.size || "").trim())
          .filter(Boolean))
      ),
    });
  }

  return snapshot;
}

function validateSingleVariantUpdate(item: unknown) {
  const rawItem = item as ExternalVariantUpdateInput | null;
  const sku = String(rawItem?.sku || "").trim().toUpperCase();
  const normalizedSku = normalizeSku(sku);
  const size = String(rawItem?.size || "").trim();
  const quantity = Number(rawItem?.quantity);
  const price = Number(rawItem?.price);
  const active = rawItem?.active;

  if (!normalizedSku) {
    throw new IntegrationInventoryError("SKU is required.");
  }

  if (!size) {
    throw new IntegrationInventoryError("Size is required.");
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new IntegrationInventoryError("Quantity must be an integer greater than or equal to 0.");
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new IntegrationInventoryError("Price must be greater than 0.");
  }

  if (typeof active !== "boolean") {
    throw new IntegrationInventoryError("Active must be a boolean value.");
  }

  return {
    sku,
    normalizedSku,
    size,
    quantity,
    price,
    active,
  };
}

function validatePriceUpdate(item: unknown) {
  const rawItem = item as ExternalPriceUpdateInput | null;
  const sku = String(rawItem?.sku || "").trim().toUpperCase();
  const normalizedSku = normalizeSku(sku);
  const size = String(rawItem?.size || "").trim();
  const price = Number(rawItem?.price);

  if (!normalizedSku) {
    throw new IntegrationInventoryError("SKU is required.");
  }

  if (!size) {
    throw new IntegrationInventoryError("Size is required.");
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new IntegrationInventoryError("Price must be greater than 0.");
  }

  return {
    sku,
    normalizedSku,
    size,
    price,
  };
}

function validateListingDeactivate(item: unknown) {
  const rawItem = item as ExternalListingDeactivateInput | null;
  const sku = String(rawItem?.sku || "").trim().toUpperCase();
  const normalizedSku = normalizeSku(sku);

  if (!normalizedSku) {
    throw new IntegrationInventoryError("SKU is required.");
  }

  return {
    sku,
    normalizedSku,
  };
}

function validateVariantDeactivate(item: unknown) {
  const rawItem = item as ExternalVariantDeactivateInput | null;
  const sku = String(rawItem?.sku || "").trim().toUpperCase();
  const normalizedSku = normalizeSku(sku);
  const size = String(rawItem?.size || "").trim();

  if (!normalizedSku) {
    throw new IntegrationInventoryError("SKU is required.");
  }

  if (!size) {
    throw new IntegrationInventoryError("Size is required.");
  }

  return {
    sku,
    normalizedSku,
    size,
  };
}

async function updateVariantBySkuAndSize(
  supabase: SupabaseClient,
  sellerId: string,
  input:
    | ReturnType<typeof validateSingleVariantUpdate>
    | ReturnType<typeof validatePriceUpdate>,
  itemIndex: number,
  options?: {
    updatePriceOnly?: boolean;
  }
): Promise<IntegrationInventoryVariantResult> {
  try {
    const variant = await resolveSellerVariantBySkuAndSize(
      supabase,
      sellerId,
      input.normalizedSku,
      input.size
    );

    if (!variant) {
      return {
        item_index: itemIndex,
        sku: input.sku,
        size: input.size,
        success: false,
        error: `Variant ${input.size} for SKU ${input.sku} was not found. Use the upsert endpoint to create it.`,
      };
    }

    const result = await updateSellerListingVariant(supabase, {
      seller_id: sellerId,
      listing_id: variant.listing_id,
      variant_id: variant.variant_id,
      price: input.price,
      quantity: options?.updatePriceOnly ? variant.quantity : (input as ReturnType<typeof validateSingleVariantUpdate>).quantity,
      is_active: options?.updatePriceOnly ? variant.is_active : (input as ReturnType<typeof validateSingleVariantUpdate>).active,
    });

    return {
      item_index: itemIndex,
      sku: input.sku,
      size: result.variant.size,
      success: true,
      listing_id: result.listingId,
      variant_id: result.variant.id,
      message: result.message || "Variant updated successfully.",
    };
  } catch (error) {
    return {
      item_index: itemIndex,
      sku: input.sku,
      size: input.size,
      success: false,
      error:
        error instanceof InventoryUpsertError
          ? error.message
          : `Failed to update variant ${input.size} for SKU ${input.sku}.`,
    };
  }
}

async function resolveSellerVariantBySkuAndSize(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSku: string,
  size: string
): Promise<SellerVariantLookupRow | null> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, listing_variants!inner(id, size, quantity, price, is_active)")
    .eq("seller_id", sellerId)
    .eq("sku_normalized", normalizedSku)
    .neq("status", "removed")
    .eq("listing_variants.size", size)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const variant = Array.isArray(data?.listing_variants) ? data.listing_variants[0] : null;
  if (!data || !variant) {
    return null;
  }

  return {
    listing_id: data.id,
    variant_id: variant.id,
    size: String(variant.size),
    quantity: Number(variant.quantity) || 0,
    price: Number(variant.price) || 0,
    is_active: variant.is_active !== false,
  };
}

async function resolveSellerListingBySku(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSku: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("listings")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("sku_normalized", normalizedSku)
    .neq("status", "removed")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
  };
}
