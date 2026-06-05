import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCatalogProductBySku } from "@/lib/catalog-server";
import { InventoryUpsertError, upsertSellerSkuInventory } from "@/lib/inventory";
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
  sizeSet: Set<string>;
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
    .select("sku_normalized, listing_variants(size)")
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
      sizeSet: new Set(
        (((listing.listing_variants as Array<{ size?: string }> | null) || [])
          .map((variant) => String(variant.size || "").trim())
          .filter(Boolean))
      ),
    });
  }

  return snapshot;
}
