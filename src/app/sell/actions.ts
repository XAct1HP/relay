"use server";

import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resolveCatalogProductBySku } from "@/lib/catalog-server";
import { InventoryUpsertError, upsertSellerSkuInventory } from "@/lib/inventory";

interface PublishCatalogListingInput {
  sku: string;
  sneakerId?: string | null;
  brand?: string;
  model: string;
  catalogModel?: string;
  nickname?: string;
  colorway?: string;
  gender?: string;
  releaseDate?: string;
  retailPrice?: number | null;
  galleryImages?: string[];
  imageUrl?: string | null;
  description?: string;
  images?: string[];
  condition: "new" | "used_good";
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
    if (input.sneakerId) {
      try {
        const admin = createAdminClient();
        const { error: sneakerUpdateError } = await admin
          .from("sneakers")
          .update({
            brand: input.brand || null,
            name: input.model,
            model: input.catalogModel || null,
            nickname: input.nickname || null,
            colorway: input.colorway || null,
            gender: input.gender || null,
            release_date: input.releaseDate || null,
            retail_price: input.retailPrice ?? null,
            description: input.description || null,
            gallery_images: input.galleryImages?.length ? input.galleryImages : [],
            image_url: input.imageUrl || null,
          })
          .eq("id", input.sneakerId);

        if (sneakerUpdateError) {
          console.error("Catalog sneaker metadata sync failed:", sneakerUpdateError);
        }
      } catch (sneakerSyncError) {
        console.error("Catalog sneaker metadata sync failed:", sneakerSyncError);
      }
    }

    const catalogProduct = await resolveCatalogProductBySku(supabase, input.sku);
    const result = await upsertSellerSkuInventory(supabase, {
      seller_id: user.id,
      sku: input.sku,
      product: {
        sneaker_id: input.sneakerId || null,
        catalog_product_id: catalogProduct?.id || null,
        brand: input.brand || catalogProduct?.brand,
        model: input.model || catalogProduct?.model,
        nickname: input.nickname || catalogProduct?.nickname || undefined,
        description: input.description || catalogProduct?.description,
        images: input.images?.length ? input.images : catalogProduct?.images || [],
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
