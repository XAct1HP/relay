import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLegacySizes,
  mergeListingVariants,
  normalizeSku,
  replaceListingVariants,
  type VariantCondition,
  type VariantInput,
} from "@/lib/listings";

type ListingStatus = "active" | "sold_out" | "inactive" | "removed" | "pending_review" | "rejected";
type ListingCondition = "new" | "like_new" | "used_excellent" | "used_good" | "used_fair" | "mixed";
export type UsedInventoryCondition = "like_new" | "used_excellent" | "used_good" | "used_fair";
type BoxCondition = "perfect" | "good" | "damaged" | "no_box";
type ApproxSizing = "lightweight" | "normal" | "heavy";

export interface InventoryUpsertVariantInput {
  size: string;
  quantity: number;
  price: number;
  condition?: VariantCondition;
}

export interface InventoryUsedItemInput {
  id?: string;
  size: string;
  price: number;
  quantity?: number;
  condition?: UsedInventoryCondition | "used";
  condition_photo_url: string;
  is_active?: boolean;
}

export interface InventoryUpsertInput {
  seller_id: string;
  sku: string;
  product?: {
    sneaker_id?: string | null;
    catalog_product_id?: string | null;
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
  used_items?: InventoryUsedItemInput[];
}

export interface InventoryUpsertResult {
  listingId: string;
  normalizedSku: string;
  merged: boolean;
  variantCount: number;
  usedItemCount: number;
  status: ListingStatus;
}

export interface InventoryReplaceSkuListingInput extends InventoryUpsertInput {
  listing_id: string;
}

export interface InventoryVariantUpdateInput {
  seller_id: string;
  listing_id: string;
  variant_id: string;
  price: number;
  quantity: number;
  is_active: boolean;
}

export interface InventoryVariantUpdateResult {
  listingId: string;
  listingStatus: ListingStatus;
  variant: {
    id: string;
    size: string;
    price: number;
    quantity: number;
    is_active: boolean;
  };
  message?: string;
}

export type InventoryBulkActionType =
  | "activate"
  | "deactivate"
  | "increase_price_percent"
  | "decrease_price_percent"
  | "set_quantity_zero";

export interface InventoryBulkActionInput {
  seller_id: string;
  listing_ids?: string[];
  variant_ids?: string[];
  action: InventoryBulkActionType;
  percentage?: number;
}

export interface InventoryBulkActionResult {
  updatedCount: number;
  skippedCount: number;
  errors: string[];
}

export interface DeleteSellerListingInput {
  seller_id: string;
  listing_id: string;
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
    sneakerId: string | null;
    catalogProductId: string | null;
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
  usedItems: Array<{
    id: string | null;
    size: string;
    price: number;
    quantity: 1;
    condition: UsedInventoryCondition;
    conditionPhotoUrl: string;
    isActive: boolean;
  }>;
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
        sneaker_id: normalized.product.sneakerId || existingListing.sneaker_id || null,
        catalog_product_id: normalized.product.catalogProductId || existingListing.catalog_product_id || null,
        brand: normalized.product.brand,
        model: normalized.product.model,
        nickname: normalized.product.nickname,
        description: normalized.product.description,
        images: normalized.product.images.length > 0 ? normalized.product.images : existingListing.images || [],
        condition: normalized.product.condition,
        box_condition: normalized.product.boxCondition,
        approx_sizing: normalized.product.approxSizing,
        sku: normalized.displaySku,
        inventory_review_status: null,
        inventory_review_notes: null,
        status: existingListing.status === "removed" ? normalized.product.status : existingListing.status,
      })
      .eq("id", existingListing.id)
      .eq("seller_id", normalized.sellerId);

    if (updateError) {
      throw new InventoryUpsertError("listing_update_failed", updateError.message);
    }

    await mergeListingVariants(supabase, existingListing.id, normalized.variants);
    await upsertListingUsedItems(supabase, existingListing.id, normalized.usedItems);
    await reconcileListingInventoryStatus(supabase, existingListing.id);

    return {
      listingId: existingListing.id,
      normalizedSku: normalized.normalizedSku,
      merged: true,
      variantCount: normalized.variants.length,
      usedItemCount: normalized.usedItems.length,
      status: existingListing.status,
    };
  }

  const insertPayload = {
    seller_id: normalized.sellerId,
    sneaker_id: normalized.product.sneakerId,
    catalog_product_id: normalized.product.catalogProductId,
    brand: normalized.product.brand,
    model: normalized.product.model,
    nickname: normalized.product.nickname,
    condition: normalized.product.condition,
    box_condition: normalized.product.boxCondition,
    approx_sizing: normalized.product.approxSizing,
    description: normalized.product.description,
    images: normalized.product.images,
    inventory_review_status: null,
    inventory_review_notes: null,
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
        await upsertListingUsedItems(supabase, conflictedListing.id, normalized.usedItems);
        await reconcileListingInventoryStatus(supabase, conflictedListing.id);

        return {
          listingId: conflictedListing.id,
          normalizedSku: normalized.normalizedSku,
          merged: true,
          variantCount: normalized.variants.length,
          usedItemCount: normalized.usedItems.length,
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
  await upsertListingUsedItems(supabase, createdListing.id, normalized.usedItems);
  await reconcileListingInventoryStatus(supabase, createdListing.id);

  return {
    listingId: createdListing.id,
    normalizedSku: normalized.normalizedSku,
    merged: false,
    variantCount: normalized.variants.length,
    usedItemCount: normalized.usedItems.length,
    status: createdListing.status as ListingStatus,
  };
}

export async function replaceSellerSkuListingInventory(
  supabase: SupabaseClient,
  input: InventoryReplaceSkuListingInput
): Promise<InventoryUpsertResult> {
  const listingId = String(input.listing_id || "").trim();
  if (!listingId) {
    throw new InventoryUpsertError("invalid_listing_id", "A valid listing is required.");
  }

  const normalized = normalizeInventoryUpsertInput(input);

  const { data: existingListing, error: existingListingError } = await supabase
    .from("listings")
    .select("id, seller_id, status, images, listing_type")
    .eq("id", listingId)
    .eq("seller_id", normalized.sellerId)
    .maybeSingle();

  if (existingListingError) {
    throw new InventoryUpsertError("listing_lookup_failed", existingListingError.message);
  }

  if (!existingListing) {
    throw new InventoryUpsertError(
      "listing_not_found",
      "You can only update inventory for your own SKU listings."
    );
  }

  if (existingListing.listing_type && existingListing.listing_type !== "sku") {
    throw new InventoryUpsertError(
      "invalid_listing_type",
      "This inventory flow only supports existing SKU listings."
    );
  }

  const { data: duplicateListing, error: duplicateListingError } = await supabase
    .from("listings")
    .select("id")
    .eq("seller_id", normalized.sellerId)
    .eq("sku_normalized", normalized.normalizedSku)
    .neq("status", "removed")
    .neq("id", listingId)
    .limit(1)
    .maybeSingle();

  if (duplicateListingError) {
    throw new InventoryUpsertError("listing_lookup_failed", duplicateListingError.message);
  }

  if (duplicateListing?.id) {
    throw new InventoryUpsertError(
      "duplicate_sku_listing",
      "You already have another listing with this SKU. Edit that listing instead."
    );
  }

  const { error: updateError } = await supabase
    .from("listings")
    .update({
      sneaker_id: normalized.product.sneakerId || null,
      catalog_product_id: normalized.product.catalogProductId || null,
      brand: normalized.product.brand,
      model: normalized.product.model,
      nickname: normalized.product.nickname,
      description: normalized.product.description,
      images: normalized.product.images.length > 0 ? normalized.product.images : existingListing.images || [],
      condition: normalized.product.condition,
      box_condition: normalized.product.boxCondition,
      approx_sizing: normalized.product.approxSizing,
      sku: normalized.displaySku,
      inventory_review_status: null,
      inventory_review_notes: null,
      status: existingListing.status === "removed" ? normalized.product.status : existingListing.status,
    })
    .eq("id", listingId)
    .eq("seller_id", normalized.sellerId);

  if (updateError) {
    throw new InventoryUpsertError("listing_update_failed", updateError.message);
  }

  await replaceListingVariants(supabase, listingId, normalized.variants);
  await replaceListingUsedItems(supabase, listingId, normalized.usedItems);
  await reconcileListingInventoryStatus(supabase, listingId);

  return {
    listingId,
    normalizedSku: normalized.normalizedSku,
    merged: true,
    variantCount: normalized.variants.length,
    usedItemCount: normalized.usedItems.length,
    status: existingListing.status,
  };
}

export async function updateSellerListingVariant(
  supabase: SupabaseClient,
  input: InventoryVariantUpdateInput
): Promise<InventoryVariantUpdateResult> {
  const normalized = normalizeInventoryVariantUpdateInput(input);

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, seller_id, status")
    .eq("id", normalized.listingId)
    .eq("seller_id", normalized.sellerId)
    .maybeSingle();

  if (listingError) {
    throw new InventoryUpsertError("listing_lookup_failed", listingError.message);
  }

  if (!listing) {
    throw new InventoryUpsertError(
      "listing_not_found",
      "You can only update inventory for your own listings."
    );
  }

  const { data: existingVariant, error: existingVariantError } = await supabase
    .from("listing_variants")
    .select("id, listing_id, size")
    .eq("id", normalized.variantId)
    .eq("listing_id", normalized.listingId)
    .maybeSingle();

  if (existingVariantError) {
    throw new InventoryUpsertError("variant_lookup_failed", existingVariantError.message);
  }

  if (!existingVariant) {
    throw new InventoryUpsertError("variant_not_found", "This inventory variant could not be found.");
  }

  const shouldBeActive = normalized.quantity > 0 && normalized.isActive;

  const { data: updatedVariant, error: updateError } = await supabase
    .from("listing_variants")
    .update({
      price: normalized.price,
      quantity: normalized.quantity,
      is_active: shouldBeActive,
    })
    .eq("id", normalized.variantId)
    .eq("listing_id", normalized.listingId)
    .select("id, size, price, quantity, is_active")
    .single();

  if (updateError || !updatedVariant) {
    throw new InventoryUpsertError(
      "variant_update_failed",
      updateError?.message || "Failed to update inventory variant."
    );
  }

  const { data: refreshedListing, error: refreshedListingError } = await supabase
    .from("listings")
    .select("id, status")
    .eq("id", normalized.listingId)
    .single();

  if (refreshedListingError || !refreshedListing) {
    throw new InventoryUpsertError(
      "listing_refresh_failed",
      refreshedListingError?.message || "Failed to refresh listing status."
    );
  }

  return {
    listingId: normalized.listingId,
    listingStatus: refreshedListing.status as ListingStatus,
    variant: {
      id: updatedVariant.id,
      size: updatedVariant.size,
      price: Number(updatedVariant.price),
      quantity: Number(updatedVariant.quantity),
      is_active: updatedVariant.is_active !== false,
    },
    message:
      normalized.quantity === 0 && normalized.isActive
        ? "Quantity is 0, so this variant was marked inactive."
        : undefined,
  };
}

export async function bulkUpdateSellerInventory(
  supabase: SupabaseClient,
  input: InventoryBulkActionInput
): Promise<InventoryBulkActionResult> {
  const normalized = normalizeBulkInventoryActionInput(input);
  const targets = await resolveBulkInventoryTargets(supabase, normalized);
  const touchedListingIds = uniqueIds(targets.map((target) => target.listing_id));

  if (targets.length === 0) {
    throw new InventoryUpsertError(
      "bulk_targets_not_found",
      "Select at least one listing or variant from your inventory."
    );
  }

  let updatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const target of targets) {
    const nextValues = getNextBulkVariantValues(target, normalized.action, normalized.percentage);

    if (!nextValues.shouldUpdate) {
      skippedCount += 1;
      if (nextValues.reason) {
        errors.push(nextValues.reason);
      }
      continue;
    }

    const { error } = await supabase
      .from("listing_variants")
      .update({
        price: nextValues.price,
        quantity: nextValues.quantity,
        is_active: nextValues.is_active,
      })
      .eq("id", target.id)
      .eq("listing_id", target.listing_id);

    if (error) {
      skippedCount += 1;
      errors.push(`${buildVariantLabel(target)} failed to update: ${error.message}`);
      continue;
    }

    updatedCount += 1;
  }

  await reconcileBulkListingStatuses(supabase, {
    action: normalized.action,
    touchedListingIds,
    selectedListingIds: normalized.listingIds,
  });

  return {
    updatedCount,
    skippedCount,
    errors,
  };
}

export async function deleteSellerListing(
  supabase: SupabaseClient,
  input: DeleteSellerListingInput
): Promise<void> {
  const sellerId = String(input.seller_id || "").trim();
  const listingId = String(input.listing_id || "").trim();

  if (!sellerId) {
    throw new InventoryUpsertError("invalid_seller_id", "A valid seller is required.");
  }

  if (!listingId) {
    throw new InventoryUpsertError("invalid_listing_id", "A valid listing is required.");
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (listingError) {
    throw new InventoryUpsertError("listing_lookup_failed", listingError.message);
  }

  if (!listing) {
    throw new InventoryUpsertError(
      "listing_not_found",
      "You can only delete inventory from your own seller account."
    );
  }

  const { count: orderCount, error: orderError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId);

  if (orderError) {
    throw new InventoryUpsertError("listing_order_check_failed", orderError.message);
  }

  if ((orderCount || 0) > 0) {
    throw new InventoryUpsertError(
      "listing_has_orders",
      "This listing has order history and cannot be permanently deleted."
    );
  }

  const { error: deleteError } = await supabase
    .from("listings")
    .delete()
    .eq("id", listingId)
    .eq("seller_id", sellerId);

  if (deleteError) {
    throw new InventoryUpsertError("listing_delete_failed", deleteError.message);
  }
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
      condition: (variant.condition === "used" ? "used" : "new") as VariantCondition,
      is_active: true,
    }))
    .filter((variant) => variant.size);

  for (const variant of variants) {
    if (!Number.isFinite(variant.price) || variant.price <= 0) {
      throw new InventoryUpsertError(
        "invalid_variant_price",
        `Variant size ${variant.size} must have a price greater than 0.`
      );
    }
    if (!Number.isFinite(variant.quantity) || !Number.isInteger(variant.quantity) || variant.quantity < 0) {
      throw new InventoryUpsertError(
        "invalid_variant_quantity",
        `Variant size ${variant.size} must have an integer quantity greater than or equal to 0.`
      );
    }
    if (variant.condition === "used") {
      throw new InventoryUpsertError(
        "used_variants_not_supported",
        "Used inventory must be submitted as itemized used_items with exactly one condition photo per pair."
      );
    }
  }

  const usedItems = (input.used_items || [])
    .map((item) => ({
      id: item.id ? String(item.id).trim() : null,
      size: String(item.size || "").trim(),
      price: Number(item.price),
      quantity: item.quantity === undefined ? 1 : Number(item.quantity),
      condition: normalizeUsedInventoryCondition(item.condition),
      conditionPhotoUrl: String(item.condition_photo_url || "").trim(),
      isActive: item.is_active !== false,
    }))
    .filter((item) => item.size || item.conditionPhotoUrl);
  const seenUsedItemPhotoRefs = new Set<string>();

  for (const item of usedItems) {
    if (!item.size) {
      throw new InventoryUpsertError("invalid_used_item_size", "Each used inventory unit must include a size.");
    }
    if (!Number.isFinite(item.price) || item.price <= 0) {
      throw new InventoryUpsertError(
        "invalid_used_item_price",
        `Used inventory size ${item.size} must have a price greater than 0.`
      );
    }
    if (item.quantity !== 1) {
      throw new InventoryUpsertError(
        "invalid_used_item_quantity",
        `Used inventory size ${item.size} must have quantity exactly 1.`
      );
    }
    if (!item.conditionPhotoUrl) {
      throw new InventoryUpsertError(
        "missing_used_item_photo",
        `Used inventory size ${item.size} must include exactly one condition photo reference.`
      );
    }
    if (seenUsedItemPhotoRefs.has(item.conditionPhotoUrl)) {
      throw new InventoryUpsertError(
        "duplicate_used_item_photo",
        `Condition photo ${item.conditionPhotoUrl} cannot represent multiple used inventory units in the same listing.`
      );
    }
    seenUsedItemPhotoRefs.add(item.conditionPhotoUrl);
  }

  if (variants.length === 0 && usedItems.length === 0) {
    throw new InventoryUpsertError(
      "missing_variants",
      "At least one DS variant or one used inventory unit is required."
    );
  }

  const product = input.product || {};
  const displaySku = String(input.sku || "").trim().toUpperCase() || normalizedSku;
  const fallbackBrand = product.brand?.trim() || "Catalog Sneaker";
  const fallbackModel = product.model?.trim() || `SKU ${displaySku}`;
  const description =
    product.description?.trim() ||
    `Catalog placeholder for SKU ${displaySku}. Update this listing when richer product data is available.`;
  const inferredCondition = inferListingConditionFromInventory({
    hasDsVariants: variants.length > 0,
    hasUsedItems: usedItems.length > 0,
  });
  const normalizedListingCondition = normalizeListingCondition(product.condition) || inferredCondition;

  validateListingConditionMatchesInventory(normalizedListingCondition, {
    hasDsVariants: variants.length > 0,
    hasUsedItems: usedItems.length > 0,
  });

  return {
    sellerId,
    normalizedSku,
    displaySku,
    product: {
      catalogProductId: product.catalog_product_id?.trim() || null,
      sneakerId: product.sneaker_id?.trim() || null,
      brand: fallbackBrand,
      model: fallbackModel,
      nickname: product.nickname?.trim() || null,
      description,
      images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
      condition: normalizedListingCondition,
      boxCondition: product.box_condition || "perfect",
      approxSizing: product.approx_sizing || "normal",
      status: product.status || "active",
    },
    variants,
    usedItems: usedItems.map((item) => ({
      id: item.id,
      size: item.size,
      price: item.price,
      quantity: 1,
      condition: item.condition,
      conditionPhotoUrl: item.conditionPhotoUrl,
      isActive: item.isActive,
    })),
  };
}

async function upsertListingUsedItems(
  supabase: SupabaseClient,
  listingId: string,
  usedItems: NormalizedInventoryInput["usedItems"]
): Promise<void> {
  if (usedItems.length === 0) {
    return;
  }

  const payload = usedItems.map((item) => ({
    listing_id: listingId,
    size: item.size,
    price: item.price,
    quantity: 1,
    condition: item.condition,
    condition_photo_url: item.conditionPhotoUrl,
    is_active: item.isActive,
  }));

  const { error } = await supabase.from("listing_used_items").upsert(payload, {
    onConflict: "listing_id,condition_photo_url",
  });

  if (error) {
    throw new InventoryUpsertError(
      "used_item_upsert_failed",
      error.message || "Failed to store itemized used inventory."
    );
  }
}

async function replaceListingUsedItems(
  supabase: SupabaseClient,
  listingId: string,
  usedItems: NormalizedInventoryInput["usedItems"]
): Promise<void> {
  const { data: existingRows, error: existingRowsError } = await supabase
    .from("listing_used_items")
    .select("id")
    .eq("listing_id", listingId);

  if (existingRowsError) {
    throw new InventoryUpsertError("used_item_lookup_failed", existingRowsError.message);
  }

  const existingById = new Map(
    ((existingRows || []) as Array<{ id: string }>).map((row) => [row.id, row])
  );
  const seenIds = new Set<string>();

  for (const item of usedItems) {
    if (item.id && existingById.has(item.id)) {
      const { error } = await supabase
        .from("listing_used_items")
        .update({
          size: item.size,
          price: item.price,
          quantity: 1,
          condition: item.condition,
          condition_photo_url: item.conditionPhotoUrl,
          is_active: item.isActive,
        })
        .eq("id", item.id)
        .eq("listing_id", listingId);

      if (error) {
        throw new InventoryUpsertError(
          "used_item_update_failed",
          error.message || "Failed to update itemized used inventory."
        );
      }

      seenIds.add(item.id);
      continue;
    }

    const { data: insertedRow, error } = await supabase
      .from("listing_used_items")
      .insert({
        listing_id: listingId,
        size: item.size,
        price: item.price,
        quantity: 1,
        condition: item.condition,
        condition_photo_url: item.conditionPhotoUrl,
        is_active: item.isActive,
      })
      .select("id")
      .single();

    if (error || !insertedRow) {
      throw new InventoryUpsertError(
        "used_item_insert_failed",
        error?.message || "Failed to insert itemized used inventory."
      );
    }

    seenIds.add(insertedRow.id);
  }

  const rowsToDeactivate = ((existingRows || []) as Array<{ id: string }>).filter(
    (row) => !seenIds.has(row.id)
  );

  for (const row of rowsToDeactivate) {
    const { error } = await supabase
      .from("listing_used_items")
      .update({ is_active: false })
      .eq("id", row.id)
      .eq("listing_id", listingId);

    if (error) {
      throw new InventoryUpsertError(
        "used_item_deactivate_failed",
        error.message || "Failed to deactivate removed used inventory."
      );
    }
  }
}

async function reconcileListingInventoryStatus(
  supabase: SupabaseClient,
  listingId: string
): Promise<void> {
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, status")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    throw new InventoryUpsertError("listing_status_lookup_failed", listingError.message);
  }

  if (!listing) {
    return;
  }

  if (
    listing.status !== "active" &&
    listing.status !== "sold_out"
  ) {
    return;
  }

  const { data: variantRows, error: variantError } = await supabase
    .from("listing_variants")
    .select("quantity, is_active")
    .eq("listing_id", listingId);

  if (variantError) {
    throw new InventoryUpsertError("listing_variant_status_lookup_failed", variantError.message);
  }

  const { data: usedItemRows, error: usedItemError } = await supabase
    .from("listing_used_items")
    .select("quantity, is_active")
    .eq("listing_id", listingId);

  if (usedItemError) {
    throw new InventoryUpsertError("listing_used_item_status_lookup_failed", usedItemError.message);
  }

  const hasAvailableVariant = ((variantRows || []) as Array<{
    quantity: number | string | null;
    is_active: boolean | null;
  }>).some((variant) => Number(variant.quantity) > 0 && variant.is_active !== false);
  const hasAvailableUsedItem = ((usedItemRows || []) as Array<{
    quantity: number | string | null;
    is_active: boolean | null;
  }>).some((item) => Number(item.quantity) > 0 && item.is_active !== false);

  const nextStatus: ListingStatus = hasAvailableVariant || hasAvailableUsedItem ? "active" : "sold_out";

  if (nextStatus === listing.status) {
    return;
  }

  const { error: updateError } = await supabase
    .from("listings")
    .update({ status: nextStatus })
    .eq("id", listingId);

  if (updateError) {
    throw new InventoryUpsertError("listing_status_update_failed", updateError.message);
  }
}

function normalizeListingCondition(
  value: ListingCondition | null | undefined
): ListingCondition | null {
  if (!value) {
    return null;
  }

  if (
    value === "new" ||
    value === "like_new" ||
    value === "used_excellent" ||
    value === "used_good" ||
    value === "used_fair" ||
    value === "mixed"
  ) {
    return value;
  }

  return null;
}

function normalizeUsedInventoryCondition(
  value: InventoryUsedItemInput["condition"]
): UsedInventoryCondition {
  if (value === "like_new" || value === "used_excellent" || value === "used_fair") {
    return value;
  }

  return "used_good";
}

function inferListingConditionFromInventory(input: {
  hasDsVariants: boolean;
  hasUsedItems: boolean;
}): ListingCondition {
  if (input.hasDsVariants && input.hasUsedItems) {
    return "mixed";
  }

  if (input.hasUsedItems) {
    return "used_good";
  }

  return "new";
}

function validateListingConditionMatchesInventory(
  condition: ListingCondition,
  input: {
    hasDsVariants: boolean;
    hasUsedItems: boolean;
  }
) {
  if (input.hasDsVariants && input.hasUsedItems) {
    if (condition !== "mixed") {
      throw new InventoryUpsertError(
        "invalid_listing_condition",
        "Listings that combine DS inventory and used inventory must use condition mixed."
      );
    }
    return;
  }

  if (input.hasUsedItems) {
    if (condition === "new" || condition === "mixed") {
      throw new InventoryUpsertError(
        "invalid_listing_condition",
        "Used-only inventory must use a used listing condition."
      );
    }
    return;
  }

  if (condition !== "new") {
    throw new InventoryUpsertError(
      "invalid_listing_condition",
      "DS-only inventory must use the new listing condition."
    );
  }
}

async function findExistingSellerSkuListing(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSku: string
) {
  const { data, error } = await supabase
    .from("listings")
    .select("id, status, images, catalog_product_id, sneaker_id")
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

function normalizeInventoryVariantUpdateInput(input: InventoryVariantUpdateInput) {
  const sellerId = String(input.seller_id || "").trim();
  const listingId = String(input.listing_id || "").trim();
  const variantId = String(input.variant_id || "").trim();
  const price = Number(input.price);
  const quantity = Number(input.quantity);

  if (!sellerId) {
    throw new InventoryUpsertError("invalid_seller_id", "A valid seller is required.");
  }

  if (!listingId) {
    throw new InventoryUpsertError("invalid_listing_id", "A valid listing is required.");
  }

  if (!variantId) {
    throw new InventoryUpsertError("invalid_variant_id", "A valid inventory variant is required.");
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new InventoryUpsertError("invalid_variant_price", "Price must be greater than 0.");
  }

  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0) {
    throw new InventoryUpsertError(
      "invalid_variant_quantity",
      "Quantity must be an integer greater than or equal to 0."
    );
  }

  return {
    sellerId,
    listingId,
    variantId,
    price,
    quantity,
    isActive: Boolean(input.is_active),
  };
}

function normalizeBulkInventoryActionInput(input: InventoryBulkActionInput) {
  const sellerId = String(input.seller_id || "").trim();
  const action = String(input.action || "").trim() as InventoryBulkActionType;
  const listingIds = uniqueIds(input.listing_ids || []);
  const variantIds = uniqueIds(input.variant_ids || []);
  const rawPercentage = input.percentage;
  const percentage = rawPercentage === undefined ? Number.NaN : Number(rawPercentage);

  if (!sellerId) {
    throw new InventoryUpsertError("invalid_seller_id", "A valid seller is required.");
  }

  if (!action) {
    throw new InventoryUpsertError("invalid_bulk_action", "Choose a bulk action to apply.");
  }

  if (listingIds.length === 0 && variantIds.length === 0) {
    throw new InventoryUpsertError("missing_bulk_targets", "Select at least one listing or variant.");
  }

  if (
    (action === "increase_price_percent" || action === "decrease_price_percent") &&
    (!Number.isFinite(percentage) || percentage <= 0)
  ) {
    throw new InventoryUpsertError(
      "invalid_bulk_percentage",
      "Enter a percentage greater than 0 for bulk price changes."
    );
  }

  return {
    sellerId,
    action,
    listingIds,
    variantIds,
    percentage: percentage || 0,
  };
}

async function resolveBulkInventoryTargets(
  supabase: SupabaseClient,
  input: ReturnType<typeof normalizeBulkInventoryActionInput>
) {
  const targets = new Map<
    string,
    {
      id: string;
      listing_id: string;
      size: string;
      price: number;
      quantity: number;
      is_active: boolean;
      sku: string | null;
      brand: string | null;
      model: string | null;
    }
  >();

  if (input.listingIds.length > 0) {
    const { data, error } = await supabase
      .from("listing_variants")
      .select("id, listing_id, size, price, quantity, is_active, listings!inner(seller_id, sku, brand, model)")
      .in("listing_id", input.listingIds)
      .eq("listings.seller_id", input.sellerId);

    if (error) {
      throw new InventoryUpsertError("bulk_variant_lookup_failed", error.message);
    }

    for (const row of (data || []) as any[]) {
      targets.set(row.id, {
        id: row.id,
        listing_id: row.listing_id,
        size: row.size,
        price: Number(row.price),
        quantity: Number(row.quantity),
        is_active: row.is_active !== false,
        sku: row.listings?.sku || null,
        brand: row.listings?.brand || null,
        model: row.listings?.model || null,
      });
    }
  }

  if (input.variantIds.length > 0) {
    const { data, error } = await supabase
      .from("listing_variants")
      .select("id, listing_id, size, price, quantity, is_active, listings!inner(seller_id, sku, brand, model)")
      .in("id", input.variantIds)
      .eq("listings.seller_id", input.sellerId);

    if (error) {
      throw new InventoryUpsertError("bulk_variant_lookup_failed", error.message);
    }

    for (const row of (data || []) as any[]) {
      targets.set(row.id, {
        id: row.id,
        listing_id: row.listing_id,
        size: row.size,
        price: Number(row.price),
        quantity: Number(row.quantity),
        is_active: row.is_active !== false,
        sku: row.listings?.sku || null,
        brand: row.listings?.brand || null,
        model: row.listings?.model || null,
      });
    }
  }

  return Array.from(targets.values());
}

function getNextBulkVariantValues(
  target: Awaited<ReturnType<typeof resolveBulkInventoryTargets>>[number],
  action: InventoryBulkActionType,
  percentage: number
) {
  switch (action) {
    case "activate":
      if (target.quantity <= 0) {
        return {
          shouldUpdate: false,
          reason: `${buildVariantLabel(target)} skipped because quantity is 0.`,
        };
      }

      if (target.is_active) {
        return {
          shouldUpdate: false,
          reason: "",
        };
      }

      return {
        shouldUpdate: true,
        price: target.price,
        quantity: target.quantity,
        is_active: true,
      };

    case "deactivate":
      if (!target.is_active) {
        return {
          shouldUpdate: false,
          reason: "",
        };
      }

      return {
        shouldUpdate: true,
        price: target.price,
        quantity: target.quantity,
        is_active: false,
      };

    case "set_quantity_zero":
      if (target.quantity === 0 && target.is_active === false) {
        return {
          shouldUpdate: false,
          reason: "",
        };
      }

      return {
        shouldUpdate: true,
        price: target.price,
        quantity: 0,
        is_active: false,
      };

    case "increase_price_percent": {
      const nextPrice = roundCurrency(target.price * (1 + percentage / 100));
      return {
        shouldUpdate: nextPrice !== target.price,
        price: nextPrice,
        quantity: target.quantity,
        is_active: target.quantity > 0 ? target.is_active : false,
      };
    }

    case "decrease_price_percent": {
      const nextPrice = roundCurrency(target.price * (1 - percentage / 100));
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return {
          shouldUpdate: false,
          reason: `${buildVariantLabel(target)} skipped because price cannot become $0 or less.`,
        };
      }

      return {
        shouldUpdate: nextPrice !== target.price,
        price: nextPrice,
        quantity: target.quantity,
        is_active: target.quantity > 0 ? target.is_active : false,
      };
    }

    default:
      return {
        shouldUpdate: false,
        reason: "",
      };
  }
}

async function reconcileBulkListingStatuses(
  supabase: SupabaseClient,
  input: {
    action: InventoryBulkActionType;
    touchedListingIds: string[];
    selectedListingIds: string[];
  }
) {
  if (input.touchedListingIds.length === 0) {
    return;
  }

  if (input.action !== "activate" && input.action !== "deactivate") {
    return;
  }

  const { data: listings, error } = await supabase
    .from("listings")
    .select("id, status, listing_variants(quantity, is_active)")
    .in("id", input.touchedListingIds);

  if (error) {
    throw new InventoryUpsertError("bulk_listing_reconcile_failed", error.message);
  }

  const selectedListingIds = new Set(input.selectedListingIds);

  for (const listing of (listings || []) as Array<{
    id: string;
    status: ListingStatus;
    listing_variants?: Array<{ quantity: number | string; is_active: boolean | null }> | null;
  }>) {
    const variants = Array.isArray(listing.listing_variants) ? listing.listing_variants : [];
    const hasAvailableVariant = variants.some(
      (variant) => Number(variant.quantity) > 0 && variant.is_active !== false
    );

    let nextStatus: ListingStatus | null = null;

    if (input.action === "deactivate" && selectedListingIds.has(listing.id)) {
      nextStatus = "inactive";
    } else if (input.action === "activate") {
      nextStatus = hasAvailableVariant ? "active" : "sold_out";
    }

    if (!nextStatus || nextStatus === listing.status) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("listings")
      .update({ status: nextStatus })
      .eq("id", listing.id);

    if (updateError) {
      throw new InventoryUpsertError("bulk_listing_status_update_failed", updateError.message);
    }
  }
}

function buildVariantLabel(target: {
  size: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
}) {
  const product = [target.brand, target.model].filter(Boolean).join(" ").trim();
  const prefix = target.sku || product || "Variant";
  return `${prefix} size ${target.size}`;
}

function uniqueIds(values: string[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  );
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
