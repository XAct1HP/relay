import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { fetchKicksDbSneakerBySku } from "../../lib/sneakers/fetchKicksDbSneakerBySku";
import { normalizeSku as normalizeSneakerSku } from "../../lib/sneakers/normalizeSku";
import { sanitizeSneakerDescription } from "../../lib/sneakers/sanitizeSneakerDescription";

export interface SneakerLookupRecord {
  id: string;
  sku: string;
  normalized_sku: string;
  brand: string | null;
  name: string | null;
  model: string | null;
  nickname: string | null;
  colorway: string | null;
  gender: string | null;
  release_date: string | null;
  retail_price: number | null;
  description: string | null;
  gallery_images: string[] | null;
  image_url: string | null;
  source: "kicksdb" | string;
}

export interface ResolvedSneakerLookup {
  sneaker: SneakerLookupRecord;
  source: "local" | "kicksdb";
}

interface ResolveSneakerBySkuOptions {
  upsertClient?: SupabaseClient;
}

export async function resolveSneakerBySku(
  supabase: SupabaseClient,
  rawSku: string,
  options?: ResolveSneakerBySkuOptions
): Promise<ResolvedSneakerLookup | null> {
  const normalizedSku = normalizeSneakerSku(rawSku);
  if (!normalizedSku) {
    return null;
  }

  const { data: localSneaker, error: localError } = await supabase
    .from("sneakers")
    .select(
      "id, sku, normalized_sku, brand, name, model, nickname, colorway, gender, release_date, retail_price, description, gallery_images, image_url, source"
    )
    .eq("normalized_sku", normalizedSku)
    .maybeSingle<SneakerLookupRecord>();

  if (localError) {
    throw localError;
  }

  const sanitizedLocal = sanitizeSneakerRecord(localSneaker);
  const localHasDescription = Boolean(sanitizedLocal?.description);
  const localHasGalleryImages =
    Array.isArray(sanitizedLocal?.gallery_images) && sanitizedLocal.gallery_images.length > 0;

  if (sanitizedLocal && localHasDescription && localHasGalleryImages) {
    return {
      sneaker: sanitizedLocal,
      source: "local",
    };
  }

  const externalSneaker = await fetchKicksDbSneakerBySku(normalizedSku);
  if (!externalSneaker || !externalSneaker.sku || !externalSneaker.normalized_sku || !externalSneaker.name) {
    return sanitizedLocal
      ? {
          sneaker: sanitizedLocal,
          source: "local",
        }
      : null;
  }

  const upsertClient = options?.upsertClient ?? createAdminClient();
  const { data: storedSneaker, error: upsertError } = await upsertClient
    .from("sneakers")
    .upsert(externalSneaker, {
      onConflict: "normalized_sku",
    })
    .select(
      "id, sku, normalized_sku, brand, name, model, nickname, colorway, gender, release_date, retail_price, description, gallery_images, image_url, source"
    )
    .single<SneakerLookupRecord>();

  if (upsertError) {
    throw upsertError;
  }

  return {
    sneaker: sanitizeSneakerRecord(storedSneaker)!,
    source: "kicksdb",
  };
}

export async function syncSneakerRecordWithListingMetadata(
  supabase: SupabaseClient,
  sneakerId: string,
  record: {
    sku: string;
    normalized_sku: string | null;
    brand: string | null;
    name: string | null;
    model: string | null;
    nickname: string | null;
    colorway: string | null;
    gender: string | null;
    release_date: string | null;
    retail_price: number | null;
    description: string | null;
    gallery_images: string[];
    image_url: string | null;
    source: "kicksdb";
  }
) {
  const normalizedSneakerSku = record.normalized_sku || normalizeSneakerSku(record.sku);
  if (!normalizedSneakerSku) {
    return;
  }

  const { error } = await supabase
    .from("sneakers")
    .update({
      sku: record.sku,
      normalized_sku: normalizedSneakerSku,
      brand: record.brand,
      name: record.name,
      model: record.model,
      nickname: record.nickname,
      colorway: record.colorway,
      gender: record.gender,
      release_date: record.release_date,
      retail_price: record.retail_price,
      description: sanitizeSneakerDescription(record.description),
      gallery_images: record.gallery_images,
      image_url: record.image_url,
      source: record.source,
    })
    .eq("id", sneakerId);

  if (error) {
    throw error;
  }
}

function sanitizeSneakerRecord(record: SneakerLookupRecord | null): SneakerLookupRecord | null {
  if (!record) {
    return null;
  }

  return {
    ...record,
    description: sanitizeSneakerDescription(record.description),
    gallery_images: Array.isArray(record.gallery_images) ? record.gallery_images.filter(Boolean) : [],
  };
}
