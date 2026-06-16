"use server";

import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resolveCatalogProductBySku } from "@/lib/catalog-server";
import {
  InventoryUpsertError,
  type UsedInventoryCondition,
  upsertSellerSkuInventory,
} from "@/lib/inventory";

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
  boxCondition: "perfect" | "good" | "damaged" | "no_box";
  approximateSizing: "lightweight" | "normal" | "heavy";
  variants: Array<{
    size: string;
    price: number;
    quantity: number;
  }>;
  usedItems?: Array<{
    size: string;
    price: number;
    condition: UsedInventoryCondition;
    conditionPhotoUrl: string;
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
    const { data: sellerProfile, error: sellerProfileError } = await supabase
      .from("profiles")
      .select("role, seller_application_status, stripe_connect_onboarding_complete, seller_identity_review_required, is_founding_seller, is_banned")
      .eq("id", user.id)
      .single();

    if (sellerProfileError || !sellerProfile) {
      return {
        success: false as const,
        error: "Could not load your seller profile.",
      };
    }

    if (sellerProfile.role !== "seller" || sellerProfile.seller_application_status !== "approved") {
      return {
        success: false as const,
        error: "Only approved sellers can publish listings.",
      };
    }

    if (!sellerProfile.stripe_connect_onboarding_complete) {
      return {
        success: false as const,
        error: "Complete Stripe Connect onboarding before publishing listings.",
      };
    }

    if (sellerProfile.is_banned) {
      return {
        success: false as const,
        error: "Seller account is under review and cannot publish listings right now.",
      };
    }

    if (sellerProfile.seller_identity_review_required && !sellerProfile.is_founding_seller) {
      return {
        success: false as const,
        error: "Seller account is under review and cannot publish listings right now.",
      };
    }

    const normalizedVariants = (input.variants || [])
      .map((variant) => ({
        size: String(variant.size || "").trim(),
        price: Number(variant.price),
        quantity: Number(variant.quantity),
      }))
      .filter((variant) => variant.size);

    const normalizedUsedItems = (input.usedItems || [])
      .map((item) => ({
        size: String(item.size || "").trim(),
        price: Number(item.price),
        condition: item.condition,
        conditionPhotoUrl: String(item.conditionPhotoUrl || "").trim(),
      }))
      .filter((item) => item.size || item.conditionPhotoUrl);

    if (normalizedVariants.length === 0 && normalizedUsedItems.length === 0) {
      return {
        success: false as const,
        error: "Add at least one DS/new row or one used pair before publishing.",
      };
    }

    if (normalizedVariants.some((variant) => !variant.size || variant.price <= 0 || variant.quantity < 1)) {
      return {
        success: false as const,
        error: "Each DS/new row must include a size, a positive price, and quantity of at least 1.",
      };
    }

    if (
      normalizedUsedItems.some(
        (item) => !item.size || item.price <= 0 || !item.conditionPhotoUrl
      )
    ) {
      return {
        success: false as const,
        error: "Each used pair must include a size, positive price, and condition photo.",
      };
    }

    const derivedCondition =
      normalizedVariants.length > 0 && normalizedUsedItems.length > 0
        ? ("mixed" as const)
        : normalizedUsedItems.length > 0
        ? ("used_good" as const)
        : ("new" as const);

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
        condition: derivedCondition,
        box_condition: input.boxCondition,
        approx_sizing: input.approximateSizing,
        status: "active",
      },
      variants: normalizedVariants.map((variant) => ({
        ...variant,
        condition: "new",
      })),
      used_items: normalizedUsedItems.map((item) => ({
        size: item.size,
        price: item.price,
        quantity: 1,
        condition: item.condition,
        condition_photo_url: item.conditionPhotoUrl,
      })),
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
