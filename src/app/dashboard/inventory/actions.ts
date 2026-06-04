"use server";

import {
  bulkUpdateSellerInventory,
  deleteSellerListing,
  InventoryUpsertError,
  type InventoryBulkActionType,
  updateSellerListingVariant,
} from "@/lib/inventory";
import { createServerClientInstance } from "@/lib/supabase-server";

interface UpdateInventoryVariantActionInput {
  listingId: string;
  variantId: string;
  price: number;
  quantity: number;
  isActive: boolean;
}

export async function updateInventoryVariantAction(input: UpdateInventoryVariantActionInput) {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false as const,
      error: "You must be logged in to update inventory.",
    };
  }

  try {
    const result = await updateSellerListingVariant(supabase, {
      seller_id: user.id,
      listing_id: input.listingId,
      variant_id: input.variantId,
      price: input.price,
      quantity: input.quantity,
      is_active: input.isActive,
    });

    return {
      success: true as const,
      ...result,
    };
  } catch (error) {
    if (error instanceof InventoryUpsertError) {
      return {
        success: false as const,
        error: error.message,
        code: error.code,
      };
    }

    console.error("Inventory variant update failed:", error);
    return {
      success: false as const,
      error: "Failed to update this inventory variant. Please try again.",
    };
  }
}

interface BulkInventoryActionInput {
  listingIds: string[];
  variantIds: string[];
  action: InventoryBulkActionType;
  percentage?: number;
}

export async function applyBulkInventoryAction(input: BulkInventoryActionInput) {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false as const,
      error: "You must be logged in to update inventory.",
    };
  }

  try {
    const result = await bulkUpdateSellerInventory(supabase, {
      seller_id: user.id,
      listing_ids: input.listingIds,
      variant_ids: input.variantIds,
      action: input.action,
      percentage: input.percentage,
    });

    return {
      success: true as const,
      ...result,
    };
  } catch (error) {
    if (error instanceof InventoryUpsertError) {
      return {
        success: false as const,
        error: error.message,
        code: error.code,
      };
    }

    console.error("Bulk inventory update failed:", error);
    return {
      success: false as const,
      error: "Failed to apply the bulk inventory update. Please try again.",
    };
  }
}

export async function deleteInventoryListingAction(listingId: string) {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false as const,
      error: "You must be logged in to delete inventory.",
    };
  }

  try {
    await deleteSellerListing(supabase, {
      seller_id: user.id,
      listing_id: listingId,
    });

    return {
      success: true as const,
    };
  } catch (error) {
    if (error instanceof InventoryUpsertError) {
      return {
        success: false as const,
        error: error.message,
        code: error.code,
      };
    }

    console.error("Inventory delete failed:", error);
    return {
      success: false as const,
      error: "Failed to delete this listing. Please try again.",
    };
  }
}

export async function exportInventoryCsvAction() {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false as const,
      error: "You must be logged in to export inventory.",
    };
  }

  try {
    const { data, error } = await supabase
      .from("listings")
      .select("sku, brand, model, nickname, status, sizes, listing_variants(id, size, quantity, price, is_active)")
      .eq("seller_id", user.id)
      .neq("status", "removed")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    const rows = (data || []).flatMap((listing: any) => {
      const productName = [listing.model, listing.nickname].filter(Boolean).join(" ").trim() || listing.brand || "Untitled Listing";
      const variantRows =
        Array.isArray(listing.listing_variants) && listing.listing_variants.length > 0
          ? listing.listing_variants.map((variant: any) => ({
              sku: listing.sku || "",
              productName,
              brand: listing.brand || "",
              size: String(variant.size || "").trim(),
              quantity: Number(variant.quantity) || 0,
              price: Number(variant.price) || 0,
              active: variant.is_active !== false,
            }))
          : (Array.isArray(listing.sizes) ? listing.sizes : []).map((variant: any) => ({
              sku: listing.sku || "",
              productName,
              brand: listing.brand || "",
              size: String(variant?.size || "").trim(),
              quantity: Number(variant?.quantity) || 0,
              price: Number(variant?.price) || 0,
              active: listing.status === "active" || listing.status === "sold_out",
            }));

      return variantRows.filter((variant: any) => variant.size);
    });

    const headers = ["SKU", "Product Name", "Brand", "Size", "Quantity", "Price", "Active"];
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        [
          escapeCsvValue(row.sku),
          escapeCsvValue(row.productName),
          escapeCsvValue(row.brand),
          escapeCsvValue(row.size),
          escapeCsvValue(String(row.quantity)),
          escapeCsvValue(formatCsvPrice(row.price)),
          escapeCsvValue(row.active ? "true" : "false"),
        ].join(",")
      ),
    ].join("\n");

    return {
      success: true as const,
      csv,
      filename: `relay-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  } catch (error) {
    console.error("Inventory export failed:", error);
    return {
      success: false as const,
      error: "Failed to export inventory. Please try again.",
    };
  }
}

function escapeCsvValue(value: string) {
  const normalized = value.replace(/"/g, '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

function formatCsvPrice(price: number) {
  return Number.isFinite(price) ? price.toFixed(2) : "0.00";
}
