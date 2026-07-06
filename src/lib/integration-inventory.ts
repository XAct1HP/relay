import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCatalogProductBySku } from "@/lib/catalog-server";
import {
  bulkUpdateSellerInventory,
  InventoryUpsertError,
  type UsedInventoryCondition,
  updateSellerListingVariant,
  upsertSellerSkuInventory,
} from "@/lib/inventory";
import { normalizeSku } from "@/lib/listings";
import {
  resolveSneakerBySku,
  syncSneakerRecordWithListingMetadata,
} from "@/lib/sneaker-server";
import { normalizeSku as normalizeSneakerSku } from "../../lib/sneakers/normalizeSku";
import { sanitizeSneakerDescription } from "../../lib/sneakers/sanitizeSneakerDescription";

interface ExternalInventoryVariantInput {
  size: unknown;
  quantity: unknown;
  price: unknown;
  condition?: unknown;
}

interface ExternalFlatInventoryRowInput {
  condition: unknown;
  size: unknown;
  quantity?: unknown;
  price: unknown;
  condition_photo_url?: unknown;
  condition_rating?: unknown;
  condition_notes?: unknown;
}

interface ExternalUsedInventoryItemInput {
  size: unknown;
  price: unknown;
  quantity?: unknown;
  condition?: unknown;
  condition_photo_url?: unknown;
  condition_rating?: unknown;
  condition_notes?: unknown;
}

interface ExternalInventoryItemInput {
  sku: unknown;
  variants: unknown;
  used_items?: unknown;
  inventory?: unknown;
  condition?: unknown;
  box_condition?: unknown;
  approximate_sizing?: unknown;
  brand?: unknown;
  name?: unknown;
  title?: unknown;
  model?: unknown;
  nickname?: unknown;
  colorway?: unknown;
  gender?: unknown;
  release_date?: unknown;
  retail_price?: unknown;
  description?: unknown;
  gallery_images?: unknown;
  image_url?: unknown;
  images?: unknown;
  condition_photo_url?: unknown;
}

interface NormalizedIntegrationVariant {
  size: string;
  quantity: number;
  price: number;
  condition: "new" | "used";
}

interface NormalizedIntegrationUsedItem {
  size: string;
  quantity: 1;
  price: number;
  condition: UsedInventoryCondition;
  conditionPhotoUrl: string;
}

interface NormalizedIntegrationItem {
  itemIndex: number;
  originalSku: string;
  normalizedSku: string;
  variants: NormalizedIntegrationVariant[];
  usedItems: NormalizedIntegrationUsedItem[];
  listingCondition: "new" | "used_good" | "mixed";
  boxCondition: "perfect" | "good" | "damaged" | "no_box";
  approximateSizing: "lightweight" | "normal" | "heavy";
  conditionPhotoUrl: string | null;
  metadata: {
    brand: string | null;
    name: string | null;
    model: string | null;
    nickname: string | null;
    colorway: string | null;
    gender: string | null;
    releaseDate: string | null;
    retailPrice: number | null;
    description: string | null;
    galleryImages: string[];
    imageUrl: string | null;
  };
}

interface ExistingListingSnapshot {
  listingId?: string;
  variantSet: Set<string>;
  usedItemPhotoSet: Set<string>;
}

interface SellerVariantLookupRow {
  listing_id: string;
  variant_id: string;
  size: string;
  quantity: number;
  price: number;
  is_active: boolean;
}

interface SellerListingLookupRow {
  id: string;
}

export interface IntegrationInventoryItemError {
  item_index: number;
  row_index?: number;
  sku?: string;
  field?:
    | "sku"
    | "variants"
    | "used_items"
    | "inventory"
    | "size"
    | "quantity"
    | "price"
    | "condition"
    | "condition_photo_url"
    | "item";
  code?: string;
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
  used_item_id?: string;
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

type IntegrationInventoryErrorCode =
  | "INVALID_REQUEST"
  | "ITEMS_ARRAY_REQUIRED"
  | "SKU_REQUIRED"
  | "INVENTORY_SIZE_REQUIRED"
  | "INVENTORY_PRICE_REQUIRED"
  | "INVALID_INVENTORY_CONDITION"
  | "USED_PAIR_PHOTO_REQUIRED"
  | "USED_PAIR_QUANTITY_MUST_BE_ONE";

interface ExternalVariantUpdateInput {
  sku: unknown;
  size: unknown;
  quantity: unknown;
  price: unknown;
  active: unknown;
  condition?: unknown;
  condition_photo_url?: unknown;
  condition_rating?: unknown;
  condition_notes?: unknown;
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

type ValidatedDsVariantMutation = {
  sku: string;
  normalizedSku: string;
  size: string;
  price: number;
  quantity: number;
  active: boolean;
  condition: "new";
};

type ValidatedUsedUnitMutation = {
  sku: string;
  normalizedSku: string;
  size: string;
  price: number;
  quantity: 1;
  active: boolean;
  condition: "used";
  conditionPhotoUrl: string;
};

type ValidatedVariantMutationInput = ValidatedDsVariantMutation | ValidatedUsedUnitMutation;

export class IntegrationInventoryError extends Error {
  code: string;

  constructor(message: string, code: string = "INVALID_REQUEST") {
    super(message);
    this.name = "IntegrationInventoryError";
    this.code = code;
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
      const sneakerLookup = await resolveSneakerBySku(supabase, item.originalSku, {
        upsertClient: supabase,
      });
      const sneaker = sneakerLookup?.sneaker || null;

      const existingListing = existingListings.get(item.normalizedSku);
      const galleryImages = collectGalleryImages({
        itemGalleryImages: item.metadata.galleryImages,
        itemImageUrl: item.metadata.imageUrl,
        sneakerGalleryImages: sneaker?.gallery_images || [],
        sneakerImageUrl: sneaker?.image_url || null,
        catalogImages: catalogProduct?.images || [],
      });
      const productImages = buildIntegrationListingImages({
        listingCondition: item.listingCondition,
        galleryImages,
        conditionPhotoUrl: item.conditionPhotoUrl,
      });
      const listingBrand =
        item.metadata.brand ||
        sneaker?.brand ||
        catalogProduct?.brand ||
        "Catalog Sneaker";
      const listingModel =
        item.metadata.name ||
        sneaker?.name ||
        item.metadata.model ||
        sneaker?.model ||
        catalogProduct?.model ||
        `SKU ${item.originalSku}`;
      const listingNickname =
        item.metadata.nickname ||
        sneaker?.nickname ||
        catalogProduct?.nickname ||
        null;
      const listingDescription =
        sanitizeSneakerDescription(item.metadata.description) ||
        sneaker?.description ||
        catalogProduct?.description ||
        `Catalog placeholder for SKU ${item.originalSku}. Update this listing when richer product data is available.`;

      if (sneaker?.id) {
        try {
          await syncSneakerRecordWithListingMetadata(supabase, sneaker.id, {
            sku: sneaker.sku || item.originalSku,
            normalized_sku: sneaker.normalized_sku || normalizeSneakerSku(item.originalSku),
            brand: item.metadata.brand || sneaker.brand,
            name: item.metadata.name || sneaker.name || listingModel,
            model: item.metadata.model || sneaker.model,
            nickname: item.metadata.nickname || sneaker.nickname,
            colorway: item.metadata.colorway || sneaker.colorway,
            gender: item.metadata.gender || sneaker.gender,
            release_date: item.metadata.releaseDate || sneaker.release_date,
            retail_price: item.metadata.retailPrice ?? sneaker.retail_price,
            description: listingDescription,
            gallery_images: galleryImages,
            image_url: galleryImages[0] || item.metadata.imageUrl || sneaker.image_url,
            source: "kicksdb",
          });
        } catch (error) {
          console.error("Integration sneaker metadata sync failed:", error);
        }
      }

      const upsertResult = await upsertSellerSkuInventory(supabase, {
        seller_id: sellerId,
        sku: sneaker?.sku || catalogProduct?.sku || item.originalSku,
        product: {
          sneaker_id: sneaker?.id || null,
          catalog_product_id: catalogProduct?.id || null,
          brand: listingBrand,
          model: listingModel,
          nickname: listingNickname,
          description: listingDescription,
          images: productImages,
          condition: item.listingCondition,
          box_condition: item.boxCondition,
          approx_sizing: item.approximateSizing,
          status: "active",
        },
        variants: item.variants,
        used_items: item.usedItems.map((usedItem) => ({
          size: usedItem.size,
          price: usedItem.price,
          quantity: 1,
          condition: usedItem.condition,
          condition_photo_url: usedItem.conditionPhotoUrl,
        })),
      });

      await syncListingInventoryState(supabase, upsertResult.listingId);

      if (!existingListing) {
        createdCount += item.variants.length + item.usedItems.length;
      } else {
        for (const variant of item.variants) {
          const variantKey = getExistingVariantKey(variant.size, variant.condition);
          if (existingListing.variantSet.has(variantKey)) {
            updatedCount += 1;
          } else {
            createdCount += 1;
            existingListing.variantSet.add(variantKey);
          }
        }

        for (const usedItem of item.usedItems) {
          if (existingListing.usedItemPhotoSet.has(usedItem.conditionPhotoUrl)) {
            updatedCount += 1;
          } else {
            createdCount += 1;
            existingListing.usedItemPhotoSet.add(usedItem.conditionPhotoUrl);
          }
        }
      }
    } catch (error) {
      skippedCount += item.variants.length + item.usedItems.length;
      itemErrors.push(
        buildIntegrationItemError({
          itemIndex: item.itemIndex,
          sku: item.originalSku,
          field: "item",
          code: "INVALID_REQUEST",
          message:
            error instanceof InventoryUpsertError
              ? error.message
              : `Failed to upsert inventory for SKU ${item.originalSku}.`,
        })
      );
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
  const result =
    normalized.condition === "used"
      ? await createUsedInventoryUnitBySkuAndSize(supabase, sellerId, normalized, 0)
      : await upsertDsVariantBySkuAndSize(supabase, sellerId, normalized, 0);

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
  const normalizedInputItems = normalizeIntegrationUpsertItemsInput(items);

  const validItems: NormalizedIntegrationItem[] = [];
  const errors: IntegrationInventoryItemError[] = [];
  let skippedCount = 0;

  for (let itemIndex = 0; itemIndex < normalizedInputItems.length; itemIndex += 1) {
    const rawItem = normalizedInputItems[itemIndex] as ExternalInventoryItemInput | null;
    const rawSku = String(rawItem?.sku || "").trim();
    const normalizedSku = normalizeSku(rawSku);
    const requestedCondition = normalizeIntegrationListingCondition(rawItem?.condition);
    const boxCondition = normalizeBoxCondition(rawItem?.box_condition);
    const approximateSizing = normalizeApproximateSizing(rawItem?.approximate_sizing);
    const conditionPhotoUrl = normalizeOptionalUrl(rawItem?.condition_photo_url);
    const rawInventoryRows = Array.isArray(rawItem?.inventory)
      ? (rawItem?.inventory as ExternalFlatInventoryRowInput[])
      : [];
    const rawVariants = Array.isArray(rawItem?.variants)
      ? [...(rawItem?.variants as ExternalInventoryVariantInput[])]
      : [];
    const rawUsedItems = Array.isArray(rawItem?.used_items)
      ? [...(rawItem?.used_items as ExternalUsedInventoryItemInput[])]
      : [];
    const rowCount = getIntegrationItemRowCount(rawVariants, rawUsedItems, rawInventoryRows);

    if (!normalizedSku) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku || undefined,
          field: "sku",
          code: "SKU_REQUIRED",
          message: "SKU is required.",
        })
      );
      continue;
    }

    if (rawVariants.length === 0 && rawUsedItems.length === 0 && rawInventoryRows.length === 0) {
      skippedCount += 1;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku,
          field: "item",
          code: "INVALID_REQUEST",
          message: "At least one DS variant or one used inventory unit is required.",
        })
      );
      continue;
    }

    if (!boxCondition) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku || undefined,
          field: "item",
          code: "INVALID_REQUEST",
          message: "box_condition must be one of perfect, good, damaged, or no_box.",
        })
      );
      continue;
    }

    if (!approximateSizing) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku || undefined,
          field: "item",
          code: "INVALID_REQUEST",
          message: "approximate_sizing must be one of lightweight, normal, or heavy.",
        })
      );
      continue;
    }

    if (rawItem?.condition !== undefined && !requestedCondition) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku || undefined,
          field: "condition",
          code: "INVALID_INVENTORY_CONDITION",
          message: "condition must be New, Used, or New + Used.",
        })
      );
      continue;
    }

    if (rawItem?.condition_photo_url !== undefined && !conditionPhotoUrl) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku || undefined,
          field: "condition_photo_url",
          code: "USED_PAIR_PHOTO_REQUIRED",
          message: "condition_photo_url must be a valid http or https URL.",
        })
      );
      continue;
    }

    const variants: NormalizedIntegrationVariant[] = [];
    const usedItems: NormalizedIntegrationUsedItem[] = [];
    const seenVariants = new Set<string>();
    const seenUsedItemPhotos = new Set<string>();
    const legacyUsedVariants: NormalizedIntegrationVariant[] = [];
    let hasValidationError = false;

    for (let rowIndex = 0; rowIndex < rawInventoryRows.length; rowIndex += 1) {
      const rawInventoryRow = rawInventoryRows[rowIndex];
      const condition = normalizeFlatInventoryCondition(rawInventoryRow?.condition);
      const size = String(rawInventoryRow?.size || "").trim();
      const price = normalizeFlatInventoryPrice(rawInventoryRow?.price);
      const quantity =
        rawInventoryRow?.quantity === undefined ? undefined : Number(rawInventoryRow.quantity);
      const rowPhotoUrl = normalizeOptionalUrl(rawInventoryRow?.condition_photo_url);

      if (!size) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "size",
            code: "INVENTORY_SIZE_REQUIRED",
            message: "Inventory size is required.",
          })
        );
        continue;
      }

      if (!Number.isFinite(price) || price <= 0) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "price",
            code: "INVENTORY_PRICE_REQUIRED",
            message: `Inventory size ${size} must have a price greater than 0.`,
          })
        );
        continue;
      }

      if (!condition) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "condition",
            code: "INVALID_INVENTORY_CONDITION",
            message: `Inventory size ${size} must declare condition new or used.`,
          })
        );
        continue;
      }

      if (condition === "used") {
        if (quantity !== undefined && quantity !== 1) {
          hasValidationError = true;
          errors.push(
            buildIntegrationItemError({
              itemIndex,
              rowIndex,
              sku: rawSku,
              field: "quantity",
              code: "USED_PAIR_QUANTITY_MUST_BE_ONE",
              message: `Used inventory size ${size} must omit quantity or set quantity to exactly 1.`,
            })
          );
          continue;
        }

        if (!rowPhotoUrl) {
          hasValidationError = true;
          errors.push(
            buildIntegrationItemError({
              itemIndex,
              rowIndex,
              sku: rawSku,
              field: "condition_photo_url",
              code: "USED_PAIR_PHOTO_REQUIRED",
              message: `Used inventory size ${size} must include a valid condition_photo_url.`,
            })
          );
          continue;
        }

        rawUsedItems.push({
          size,
          price,
          quantity: 1,
          condition: "used",
          condition_photo_url: rowPhotoUrl,
          condition_rating: rawInventoryRow?.condition_rating,
          condition_notes: rawInventoryRow?.condition_notes,
        });
        continue;
      }

      rawVariants.push({
        size,
        quantity,
        price,
        condition: "new",
      });
    }

    if (hasValidationError) {
      skippedCount += rowCount;
      continue;
    }

    for (let rowIndex = 0; rowIndex < rawVariants.length; rowIndex += 1) {
      const rawVariant = rawVariants[rowIndex];
      const size = String(rawVariant?.size || "").trim();
      const quantity = Number(rawVariant?.quantity);
      const price = Number(rawVariant?.price);
      const variantCondition = normalizeIntegrationVariantCondition(
        rawVariant?.condition,
        requestedCondition
      );

      if (!size) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "size",
            code: "INVENTORY_SIZE_REQUIRED",
            message: "Variant size is required.",
          })
        );
        continue;
      }

      if (!Number.isInteger(quantity) || quantity < 0) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "quantity",
            code: variantCondition === "used" ? "USED_PAIR_QUANTITY_MUST_BE_ONE" : "INVALID_REQUEST",
            message: `Variant size ${size} must have an integer quantity greater than or equal to 0.`,
          })
        );
        continue;
      }

      if (!Number.isFinite(price) || price <= 0) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "price",
            code: "INVENTORY_PRICE_REQUIRED",
            message: `Variant size ${size} must have a price greater than 0.`,
          })
        );
        continue;
      }

      if (!variantCondition) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "condition",
            code: "INVALID_INVENTORY_CONDITION",
            message: `Variant size ${size} must declare condition new or used when the listing condition is New + Used.`,
          })
        );
        continue;
      }

      if (variantCondition === "used") {
        if (rawUsedItems.length > 0) {
          hasValidationError = true;
          errors.push(
            buildIntegrationItemError({
              itemIndex,
              rowIndex,
              sku: rawSku,
              field: "item",
              code: "INVALID_REQUEST",
              message: "Do not send used variants in variants when used_items are present. Used inventory must be itemized in used_items.",
            })
          );
          continue;
        }

        if (quantity !== 1) {
          hasValidationError = true;
          errors.push(
            buildIntegrationItemError({
              itemIndex,
              rowIndex,
              sku: rawSku,
              field: "quantity",
              code: "USED_PAIR_QUANTITY_MUST_BE_ONE",
              message: `Used variant size ${size} must have quantity exactly 1.`,
            })
          );
          continue;
        }

        legacyUsedVariants.push({
          size,
          quantity,
          price,
          condition: "used",
        });
        continue;
      }

      const normalizedVariantKey = getExistingVariantKey(size.toUpperCase(), variantCondition);
      if (seenVariants.has(normalizedVariantKey)) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "size",
            code: "INVALID_REQUEST",
            message: `Duplicate size ${size} with condition ${variantCondition} found for SKU ${rawSku}.`,
          })
        );
        continue;
      }

      seenVariants.add(normalizedVariantKey);
      variants.push({
        size,
        quantity,
        price,
        condition: variantCondition,
      });
    }

    if (hasValidationError) {
      skippedCount += rowCount;
      continue;
    }

    for (let rowIndex = 0; rowIndex < rawUsedItems.length; rowIndex += 1) {
      const rawUsedItem = rawUsedItems[rowIndex];
      const size = String(rawUsedItem?.size || "").trim();
      const quantity = rawUsedItem?.quantity === undefined ? 1 : Number(rawUsedItem.quantity);
      const price = Number(rawUsedItem?.price);
      const usedCondition = normalizeIntegrationUsedItemCondition(rawUsedItem?.condition);
      const usedPhotoUrl = normalizeOptionalUrl(rawUsedItem?.condition_photo_url);

      if (!size) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "size",
            code: "INVENTORY_SIZE_REQUIRED",
            message: "Used inventory size is required.",
          })
        );
        continue;
      }

      if (!Number.isFinite(price) || price <= 0) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "price",
            code: "INVENTORY_PRICE_REQUIRED",
            message: `Used inventory size ${size} must have a price greater than 0.`,
          })
        );
        continue;
      }

      if (quantity !== 1) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "quantity",
            code: "USED_PAIR_QUANTITY_MUST_BE_ONE",
            message: `Used inventory size ${size} must have quantity exactly 1.`,
          })
        );
        continue;
      }

      if (!usedPhotoUrl) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "condition_photo_url",
            code: "USED_PAIR_PHOTO_REQUIRED",
            message: `Used inventory size ${size} must include a valid condition_photo_url.`,
          })
        );
        continue;
      }

      if (seenUsedItemPhotos.has(usedPhotoUrl)) {
        hasValidationError = true;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            rowIndex,
            sku: rawSku,
            field: "condition_photo_url",
            code: "USED_PAIR_PHOTO_REQUIRED",
            message: `Condition photo ${usedPhotoUrl} cannot represent multiple used pairs for SKU ${rawSku}.`,
          })
        );
        continue;
      }

      seenUsedItemPhotos.add(usedPhotoUrl);
      usedItems.push({
        size,
        quantity: 1,
        price,
        condition: usedCondition,
        conditionPhotoUrl: usedPhotoUrl,
      });
    }

    if (hasValidationError) {
      skippedCount += rowCount;
      continue;
    }

    if (legacyUsedVariants.length > 1) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku,
          field: "item",
          code: "USED_PAIR_PHOTO_REQUIRED",
          message: "Used inventory must be itemized in used_items. One condition photo cannot represent multiple used pairs.",
        })
      );
      continue;
    }

    if (legacyUsedVariants.length === 1) {
      if (!conditionPhotoUrl) {
        skippedCount += rowCount;
        errors.push(
          buildIntegrationItemError({
            itemIndex,
            sku: rawSku,
            field: "condition_photo_url",
            code: "USED_PAIR_PHOTO_REQUIRED",
            message: "Used inventory requires a condition photo.",
          })
        );
        continue;
      }

      usedItems.push({
        size: legacyUsedVariants[0].size,
        quantity: 1,
        price: legacyUsedVariants[0].price,
        condition: inferUsedItemConditionFromListingCondition(requestedCondition),
        conditionPhotoUrl,
      });
      seenUsedItemPhotos.add(conditionPhotoUrl);
    }

    const effectiveCondition = inferListingConditionFromInventory({
      hasNewVariants: variants.length > 0,
      hasUsedItems: usedItems.length > 0,
      requestedCondition,
    });

    if (requestedCondition === "new" && usedItems.length > 0) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku,
          field: "item",
          code: "INVALID_REQUEST",
          message: "New listings can only include DS inventory.",
        })
      );
      continue;
    }

    if (requestedCondition === "used_good" && variants.length > 0) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku,
          field: "item",
          code: "INVALID_REQUEST",
          message: "Used listings cannot include DS variants. Put used inventory in used_items only.",
        })
      );
      continue;
    }

    if (requestedCondition === "mixed" && (variants.length === 0 || usedItems.length === 0)) {
      skippedCount += rowCount;
      errors.push(
        buildIntegrationItemError({
          itemIndex,
          sku: rawSku,
          field: "item",
          code: "INVALID_REQUEST",
          message: "New + Used listings must include at least one DS variant and one used inventory unit.",
        })
      );
      continue;
    }

    const description = sanitizeSneakerDescription(asOptionalString(rawItem?.description));

    validItems.push({
      itemIndex,
      originalSku: rawSku.toUpperCase(),
      normalizedSku,
      variants,
      usedItems,
      listingCondition: effectiveCondition,
      boxCondition,
      approximateSizing,
      conditionPhotoUrl: usedItems[0]?.conditionPhotoUrl || conditionPhotoUrl,
      metadata: {
        brand: asOptionalString(rawItem?.brand),
        name: asOptionalString(rawItem?.name) || asOptionalString(rawItem?.title),
        model: asOptionalString(rawItem?.model),
        nickname: asOptionalString(rawItem?.nickname),
        colorway: asOptionalString(rawItem?.colorway),
        gender: asOptionalString(rawItem?.gender),
        releaseDate: asOptionalString(rawItem?.release_date),
        retailPrice: asOptionalNumber(rawItem?.retail_price),
        description,
        galleryImages: collectExplicitImages(rawItem?.gallery_images, rawItem?.images),
        imageUrl: asOptionalString(rawItem?.image_url),
      },
    });
  }

  return {
    validItems,
    errors,
    skippedCount,
  };
}

function normalizeIntegrationListingCondition(
  value: unknown
): "new" | "used_good" | "mixed" | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "new") {
    return "new";
  }

  if (
    normalized === "used" ||
    normalized === "used_good" ||
    normalized === "used good" ||
    normalized === "used_excellent" ||
    normalized === "used excellent" ||
    normalized === "used_fair" ||
    normalized === "used fair" ||
    normalized === "like_new" ||
    normalized === "like new"
  ) {
    return "used_good";
  }

  if (
    normalized === "mixed" ||
    normalized === "new + used" ||
    normalized === "new+used" ||
    normalized === "new_used" ||
    normalized === "new and used"
  ) {
    return "mixed";
  }

  return null;
}

function normalizeIntegrationVariantCondition(
  value: unknown,
  listingCondition: "new" | "used_good" | "mixed" | null
): "new" | "used" | null {
  if (value === null || value === undefined || value === "") {
    if (listingCondition === "mixed") {
      return null;
    }

    return listingCondition === "used_good" ? "used" : "new";
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "used") {
    return "used";
  }

  if (normalized === "new") {
    return "new";
  }

  return null;
}

function normalizeIntegrationUsedItemCondition(value: unknown): UsedInventoryCondition {
  if (value === null || value === undefined || value === "" || value === "used") {
    return "used_good";
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "like_new" || normalized === "like new") {
    return "like_new";
  }

  if (normalized === "used_excellent" || normalized === "used excellent") {
    return "used_excellent";
  }

  if (normalized === "used_fair" || normalized === "used fair") {
    return "used_fair";
  }

  return "used_good";
}

function normalizeFlatInventoryCondition(value: unknown): "new" | "used" | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "new" || normalized === "ds") {
    return "new";
  }

  if (normalized === "used") {
    return "used";
  }

  return null;
}

function normalizeFlatInventoryPrice(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return Number.isInteger(parsed) ? parsed / 100 : parsed;
}

function inferUsedItemConditionFromListingCondition(
  listingCondition: "new" | "used_good" | "mixed" | null
): UsedInventoryCondition {
  if (listingCondition === "new") {
    return "used_good";
  }

  return "used_good";
}

function inferListingConditionFromInventory(input: {
  hasNewVariants: boolean;
  hasUsedItems: boolean;
  requestedCondition: "new" | "used_good" | "mixed" | null;
}): "new" | "used_good" | "mixed" {
  if (input.requestedCondition === "mixed") {
    return "mixed";
  }

  if (input.hasNewVariants && input.hasUsedItems) {
    return "mixed";
  }

  if (input.hasUsedItems) {
    return "used_good";
  }

  return "new";
}

function getIntegrationItemRowCount(
  rawVariants: ExternalInventoryVariantInput[],
  rawUsedItems: ExternalUsedInventoryItemInput[],
  rawInventoryRows: ExternalFlatInventoryRowInput[] = []
) {
  return rawVariants.length + rawUsedItems.length + rawInventoryRows.length || 1;
}

function normalizeIntegrationUpsertItemsInput(items: unknown): ExternalInventoryItemInput[] {
  if (Array.isArray(items)) {
    return items as ExternalInventoryItemInput[];
  }

  if (isPlainRecord(items)) {
    if (Array.isArray(items.items)) {
      return items.items as ExternalInventoryItemInput[];
    }

    if (
      items.sku !== undefined ||
      items.inventory !== undefined ||
      items.variants !== undefined ||
      items.used_items !== undefined
    ) {
      return [items as unknown as ExternalInventoryItemInput];
    }
  }

  throw new IntegrationInventoryError(
    "Request body must include an items array or a single sku inventory payload.",
    "ITEMS_ARRAY_REQUIRED"
  );
}

function buildIntegrationItemError(input: {
  itemIndex: number;
  rowIndex?: number;
  sku?: string;
  field?: IntegrationInventoryItemError["field"];
  code?: IntegrationInventoryErrorCode | string;
  message: string;
}): IntegrationInventoryItemError {
  return {
    item_index: input.itemIndex,
    row_index: input.rowIndex,
    sku: input.sku,
    field: input.field,
    code: input.code || "INVALID_REQUEST",
    message: input.message,
  };
}

function normalizeBoxCondition(
  value: unknown
): "perfect" | "good" | "damaged" | "no_box" | null {
  if (value === null || value === undefined || value === "") {
    return "perfect";
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "perfect" || normalized === "good" || normalized === "damaged" || normalized === "no_box") {
    return normalized;
  }

  if (normalized === "no box") {
    return "no_box";
  }

  return null;
}

function normalizeApproximateSizing(
  value: unknown
): "lightweight" | "normal" | "heavy" | null {
  if (value === null || value === undefined || value === "") {
    return "normal";
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "lightweight" || normalized === "normal" || normalized === "heavy") {
    return normalized;
  }

  return null;
}

function normalizeOptionalUrl(value: unknown): string | null {
  const url = asOptionalString(value);
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function asOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectExplicitImages(galleryImages: unknown, images: unknown): string[] {
  const candidates = [galleryImages, images];
  const collected: string[] = [];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    for (const item of candidate) {
      const url = normalizeOptionalUrl(item);
      if (url && !collected.includes(url)) {
        collected.push(url);
      }
    }
  }

  return collected;
}

function collectGalleryImages(input: {
  itemGalleryImages: string[];
  itemImageUrl: string | null;
  sneakerGalleryImages: string[];
  sneakerImageUrl: string | null;
  catalogImages: string[];
}) {
  const galleryImages = [
    ...input.itemGalleryImages,
    ...(input.itemImageUrl ? [input.itemImageUrl] : []),
    ...input.sneakerGalleryImages,
    ...(input.sneakerImageUrl ? [input.sneakerImageUrl] : []),
    ...input.catalogImages,
  ];

  const deduped: string[] = [];
  for (const url of galleryImages) {
    const normalizedUrl = normalizeOptionalUrl(url);
    if (normalizedUrl && !deduped.includes(normalizedUrl)) {
      deduped.push(normalizedUrl);
    }
  }

  return deduped.slice(0, 6);
}

function buildIntegrationListingImages(input: {
  listingCondition: "new" | "used_good" | "mixed";
  galleryImages: string[];
  conditionPhotoUrl: string | null;
}) {
  if (input.listingCondition === "new") {
    return input.galleryImages;
  }

  const images = [...input.galleryImages];
  if (input.conditionPhotoUrl && !images.includes(input.conditionPhotoUrl)) {
    images.push(input.conditionPhotoUrl);
  }

  return images;
}

function getExistingVariantKey(size: string, condition: "new" | "used") {
  return `${String(size || "").trim().toUpperCase()}::${condition}`;
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
    .select("id, sku_normalized, listing_variants(size, condition), listing_used_items(condition_photo_url)")
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
      variantSet: new Set(
        (((listing.listing_variants as Array<{ size?: string; condition?: string }> | null) || [])
          .map((variant) =>
            getExistingVariantKey(
              String(variant.size || "").trim(),
              variant.condition === "used" ? "used" : "new"
            )
          )
          .filter(Boolean))
      ),
      usedItemPhotoSet: new Set(
        (((listing.listing_used_items as Array<{ condition_photo_url?: string }> | null) || [])
          .map((usedItem) => String(usedItem.condition_photo_url || "").trim())
          .filter(Boolean))
      ),
    });
  }

  return snapshot;
}

function validateSingleVariantUpdate(item: unknown): ValidatedVariantMutationInput {
  const rawItem = item as ExternalVariantUpdateInput | null;
  const sku = String(rawItem?.sku || "").trim().toUpperCase();
  const normalizedSku = normalizeSku(sku);
  const size = String(rawItem?.size || "").trim();
  const condition = normalizeFlatInventoryCondition(rawItem?.condition ?? "new");
  const price = normalizeFlatInventoryPrice(rawItem?.price);
  const active = rawItem?.active;

  if (!normalizedSku) {
    throw new IntegrationInventoryError("SKU is required.", "SKU_REQUIRED");
  }

  if (!size) {
    throw new IntegrationInventoryError("Size is required.", "INVENTORY_SIZE_REQUIRED");
  }

  if (!condition) {
    throw new IntegrationInventoryError(
      "Condition must be new or used.",
      "INVALID_INVENTORY_CONDITION"
    );
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new IntegrationInventoryError("Price must be greater than 0.", "INVENTORY_PRICE_REQUIRED");
  }

  if (active !== undefined && typeof active !== "boolean") {
    throw new IntegrationInventoryError("Active must be a boolean value.");
  }

  if (condition === "used") {
    const quantity = rawItem?.quantity === undefined || rawItem?.quantity === ""
      ? 1
      : Number(rawItem?.quantity);
    const conditionPhotoUrl = normalizeOptionalUrl(rawItem?.condition_photo_url);

    if (quantity !== 1) {
      throw new IntegrationInventoryError(
        "Used inventory quantity must be omitted or exactly 1.",
        "USED_PAIR_QUANTITY_MUST_BE_ONE"
      );
    }

    if (!conditionPhotoUrl) {
      throw new IntegrationInventoryError(
        "Used inventory requires a valid condition_photo_url.",
        "USED_PAIR_PHOTO_REQUIRED"
      );
    }

    return {
      sku,
      normalizedSku,
      size,
      quantity: 1,
      price,
      active: active === false ? false : true,
      condition,
      conditionPhotoUrl,
    };
  }

  const quantity = Number(rawItem?.quantity);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new IntegrationInventoryError("Quantity must be an integer greater than or equal to 0.");
  }

  return {
    sku,
    normalizedSku,
    size,
    quantity,
    price,
    active: typeof active === "boolean" ? active : true,
    condition,
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
    | ValidatedDsVariantMutation
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
      quantity: options?.updatePriceOnly ? variant.quantity : (input as ValidatedDsVariantMutation).quantity,
      is_active: options?.updatePriceOnly ? variant.is_active : (input as ValidatedDsVariantMutation).active,
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

async function syncListingInventoryState(
  supabase: SupabaseClient,
  listingId: string
): Promise<void> {
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, status, condition, listing_variants(quantity, is_active, condition), listing_used_items(quantity, is_active)")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    throw listingError;
  }

  if (!listing) {
    return;
  }

  const variantRows = Array.isArray(listing.listing_variants) ? listing.listing_variants : [];
  const usedItemRows = Array.isArray(listing.listing_used_items) ? listing.listing_used_items : [];

  const hasAvailableNewVariant = variantRows.some(
    (variant: any) =>
      variant?.condition !== "used" &&
      Number(variant?.quantity) > 0 &&
      variant?.is_active !== false
  );
  const hasAvailableLegacyUsedVariant = variantRows.some(
    (variant: any) =>
      variant?.condition === "used" &&
      Number(variant?.quantity) > 0 &&
      variant?.is_active !== false
  );
  const hasAvailableUsedItem = usedItemRows.some(
    (item: any) => Number(item?.quantity) > 0 && item?.is_active !== false
  );
  const hasAvailableUsedInventory = hasAvailableLegacyUsedVariant || hasAvailableUsedItem;

  const nextCondition = hasAvailableNewVariant && hasAvailableUsedInventory
    ? "mixed"
    : hasAvailableUsedInventory
    ? "used_good"
    : "new";

  const updatePayload: Record<string, unknown> = {};

  if (listing.condition !== nextCondition) {
    updatePayload.condition = nextCondition;
  }

  if (listing.status === "active" || listing.status === "sold_out") {
    const nextStatus = hasAvailableNewVariant || hasAvailableUsedInventory ? "active" : "sold_out";
    if (listing.status !== nextStatus) {
      updatePayload.status = nextStatus;
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return;
  }

  const { error: updateError } = await supabase
    .from("listings")
    .update(updatePayload)
    .eq("id", listingId);

  if (updateError) {
    throw updateError;
  }
}

async function upsertDsVariantBySkuAndSize(
  supabase: SupabaseClient,
  sellerId: string,
  input: ValidatedDsVariantMutation,
  itemIndex: number
): Promise<IntegrationInventoryVariantResult> {
  try {
    const existingVariant = await resolveSellerVariantBySkuAndSize(
      supabase,
      sellerId,
      input.normalizedSku,
      input.size
    );

    if (existingVariant) {
      return await updateVariantBySkuAndSize(supabase, sellerId, input, itemIndex);
    }

    const listing = await resolveSellerListingBySku(supabase, sellerId, input.normalizedSku);
    if (!listing) {
      return {
        item_index: itemIndex,
        sku: input.sku,
        size: input.size,
        success: false,
        error: `Listing for SKU ${input.sku} was not found. Use the upsert endpoint to create it first.`,
      };
    }

    const { data: createdVariant, error: createError } = await supabase
      .from("listing_variants")
      .insert({
        listing_id: listing.id,
        size: input.size,
        price: input.price,
        quantity: input.quantity,
        condition: "new",
        is_active: input.quantity > 0 && input.active,
      })
      .select("id, size")
      .single();

    if (createError || !createdVariant) {
      return {
        item_index: itemIndex,
        sku: input.sku,
        size: input.size,
        success: false,
        error: createError?.message || `Failed to create variant ${input.size} for SKU ${input.sku}.`,
      };
    }

    await syncListingInventoryState(supabase, listing.id);

    return {
      item_index: itemIndex,
      sku: input.sku,
      size: String(createdVariant.size),
      success: true,
      listing_id: listing.id,
      variant_id: createdVariant.id,
      message: "Variant created successfully.",
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
          : `Failed to upsert variant ${input.size} for SKU ${input.sku}.`,
    };
  }
}

async function createUsedInventoryUnitBySkuAndSize(
  supabase: SupabaseClient,
  sellerId: string,
  input: ValidatedUsedUnitMutation,
  itemIndex: number
): Promise<IntegrationInventoryVariantResult> {
  try {
    const listing = await resolveSellerListingBySku(supabase, sellerId, input.normalizedSku);
    if (!listing) {
      return {
        item_index: itemIndex,
        sku: input.sku,
        size: input.size,
        success: false,
        error: `Listing for SKU ${input.sku} was not found. Use the upsert endpoint to create it first.`,
      };
    }

    const existingUsedItem = await resolveSellerUsedItemBySkuAndPhoto(
      supabase,
      sellerId,
      input.normalizedSku,
      input.conditionPhotoUrl
    );
    if (existingUsedItem) {
      return {
        item_index: itemIndex,
        sku: input.sku,
        size: input.size,
        success: false,
        error: "A used inventory unit with this condition_photo_url already exists for this SKU.",
      };
    }

    const { data: createdUsedItem, error: createError } = await supabase
      .from("listing_used_items")
      .insert({
        listing_id: listing.id,
        size: input.size,
        price: input.price,
        quantity: 1,
        condition: "used_good",
        condition_photo_url: input.conditionPhotoUrl,
        is_active: input.active,
      })
      .select("id, size")
      .single();

    if (createError || !createdUsedItem) {
      return {
        item_index: itemIndex,
        sku: input.sku,
        size: input.size,
        success: false,
        error:
          createError?.message || `Failed to create used inventory unit ${input.size} for SKU ${input.sku}.`,
      };
    }

    await syncListingInventoryState(supabase, listing.id);

    return {
      item_index: itemIndex,
      sku: input.sku,
      size: String(createdUsedItem.size),
      success: true,
      listing_id: listing.id,
      used_item_id: createdUsedItem.id,
      message: "Used inventory unit created successfully.",
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
          : `Failed to create used inventory unit ${input.size} for SKU ${input.sku}.`,
    };
  }
}

async function resolveSellerVariantBySkuAndSize(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSku: string,
  size: string,
  condition: "new" | "used" = "new"
): Promise<SellerVariantLookupRow | null> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, listing_variants!inner(id, size, quantity, price, is_active, condition)")
    .eq("seller_id", sellerId)
    .eq("sku_normalized", normalizedSku)
    .neq("status", "removed")
    .eq("listing_variants.size", size)
    .eq("listing_variants.condition", condition)
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

async function resolveSellerUsedItemBySkuAndPhoto(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSku: string,
  conditionPhotoUrl: string
): Promise<{ listing_id: string; used_item_id: string } | null> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, listing_used_items!inner(id)")
    .eq("seller_id", sellerId)
    .eq("sku_normalized", normalizedSku)
    .neq("status", "removed")
    .eq("listing_used_items.condition_photo_url", conditionPhotoUrl)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const usedItem = Array.isArray(data?.listing_used_items) ? data.listing_used_items[0] : null;
  if (!data || !usedItem) {
    return null;
  }

  return {
    listing_id: data.id,
    used_item_id: usedItem.id,
  };
}

async function resolveSellerListingBySku(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSku: string
): Promise<SellerListingLookupRow | null> {
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
