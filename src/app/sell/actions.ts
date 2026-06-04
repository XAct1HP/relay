"use server";

import { createServerClientInstance } from "@/lib/supabase-server";
import { InventoryUpsertError, upsertSellerSkuInventory } from "@/lib/inventory";

interface PublishCatalogListingInput {
  sku: string;
  brand?: string;
  model: string;
  nickname?: string;
  description?: string;
  images?: string[];
  condition: "new" | "like_new" | "used_excellent" | "used_good" | "used_fair";
  boxCondition: "perfect" | "good" | "damaged" | "no_box";
  approximateSizing: "lightweight" | "normal" | "heavy";
  variants: Array<{
    size: string;
    price: number;
    quantity: number;
  }>;
}

export async function publishCatalogListingAction(input: PublishCatalogListingInput) {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false as const,
      error: "You must be logged in to publish a listing.",
    };
  }

  try {
    const result = await upsertSellerSkuInventory(supabase, {
      seller_id: user.id,
      sku: input.sku,
      product: {
        brand: input.brand,
        model: input.model,
        nickname: input.nickname,
        description: input.description,
        images: input.images || [],
        condition: input.condition,
        box_condition: input.boxCondition,
        approx_sizing: input.approximateSizing,
        status: "active",
      },
      variants: input.variants,
    });

    return {
      success: true as const,
      listingId: result.listingId,
      merged: result.merged,
      normalizedSku: result.normalizedSku,
    };
  } catch (error) {
    if (error instanceof InventoryUpsertError) {
      return {
        success: false as const,
        error: error.message,
        code: error.code,
      };
    }

    console.error("Catalog listing publish action failed:", error);
    return {
      success: false as const,
      error: "Failed to publish SKU listing. Please try again.",
    };
  }
}
