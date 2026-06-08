"use server";

import {
  InventoryUpsertError,
  replaceSellerSkuListingInventory,
  type UsedInventoryCondition,
} from "@/lib/inventory";
import { createServerClientInstance } from "@/lib/supabase-server";

interface UpdateSkuListingInventoryActionInput {
  listingId: string;
  sku: string;
  brand: string;
  model: string;
  nickname?: string;
  description?: string;
  images?: string[];
  boxCondition: "perfect" | "good" | "damaged" | "no_box";
  approximateSizing: "lightweight" | "normal" | "heavy";
  variants: Array<{
    size: string;
    price: number;
    quantity: number;
  }>;
  usedItems: Array<{
    id?: string;
    size: string;
    price: number;
    condition: UsedInventoryCondition;
    conditionPhotoUrl: string;
  }>;
}

export async function updateSkuListingInventoryAction(
  input: UpdateSkuListingInventoryActionInput
) {
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
    const result = await replaceSellerSkuListingInventory(supabase, {
      listing_id: input.listingId,
      seller_id: user.id,
      sku: input.sku,
      product: {
        brand: input.brand,
        model: input.model,
        nickname: input.nickname || null,
        description: input.description || null,
        images: input.images || [],
        box_condition: input.boxCondition,
        approx_sizing: input.approximateSizing,
        status: "active",
      },
      variants: input.variants.map((variant) => ({
        size: variant.size,
        price: variant.price,
        quantity: variant.quantity,
        condition: "new",
      })),
      used_items: input.usedItems.map((item) => ({
        id: item.id,
        size: item.size,
        price: item.price,
        quantity: 1,
        condition: item.condition,
        condition_photo_url: item.conditionPhotoUrl,
        is_active: true,
      })),
    });

    return {
      success: true as const,
      listingId: result.listingId,
      variantCount: result.variantCount,
      usedItemCount: result.usedItemCount,
    };
  } catch (error) {
    if (error instanceof InventoryUpsertError) {
      return {
        success: false as const,
        error: error.message,
        code: error.code,
      };
    }

    console.error("SKU listing inventory update failed:", error);
    return {
      success: false as const,
      error: "Failed to update this SKU listing. Please try again.",
    };
  }
}
