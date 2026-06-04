import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogProductSeed } from "@/lib/catalog";
import { normalizeSku } from "@/lib/listings";

export interface ResolvedCatalogProduct {
  id: string | null;
  sku: string;
  normalizedSku: string;
  brand: string;
  model: string;
  nickname: string | null;
  description: string;
  images: string[];
  source: "catalog" | "placeholder";
}

export async function resolveCatalogProductBySku(
  supabase: SupabaseClient,
  rawSku: string
): Promise<ResolvedCatalogProduct | null> {
  const normalizedSku = normalizeSku(rawSku);
  if (!normalizedSku) {
    return null;
  }

  const displaySku = rawSku.trim().toUpperCase().replace(/\s+/g, "");

  const { data: catalogProduct, error } = await supabase
    .from("catalog_products")
    .select("id, sku, sku_normalized, brand, model, nickname, description, images")
    .eq("sku_normalized", normalizedSku)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (catalogProduct) {
    return {
      id: catalogProduct.id,
      sku: catalogProduct.sku || displaySku,
      normalizedSku: catalogProduct.sku_normalized || normalizedSku,
      brand: catalogProduct.brand,
      model: catalogProduct.model,
      nickname: catalogProduct.nickname || null,
      description:
        catalogProduct.description ||
        `Catalog placeholder for SKU ${catalogProduct.sku || displaySku}.`,
      images: Array.isArray(catalogProduct.images) ? catalogProduct.images.filter(Boolean) : [],
      source: "catalog",
    };
  }

  const placeholder = await getCatalogProductSeed(displaySku);
  if (!placeholder) {
    return null;
  }

  return {
    id: null,
    sku: placeholder.sku,
    normalizedSku: placeholder.normalizedSku,
    brand: placeholder.brand,
    model: placeholder.model,
    nickname: placeholder.nickname,
    description: placeholder.description,
    images: placeholder.images,
    source: "placeholder",
  };
}
