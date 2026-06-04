"use server";

import { InventoryUpsertError, updateSellerListingVariant } from "@/lib/inventory";
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
