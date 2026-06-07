import "server-only";

import { normalizeSku } from "./normalizeSku";
import { sanitizeSneakerDescription } from "./sanitizeSneakerDescription";

export interface KicksDbSneakerLookupResult {
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
  gallery_images: string[];
  image_url: string | null;
  source: "kicksdb";
}

type KicksDbRecord = Record<string, unknown>;

export async function fetchKicksDbSneakerBySku(
  sku: string
): Promise<KicksDbSneakerLookupResult | null> {
  const normalizedSku = normalizeSku(sku);

  if (!normalizedSku) {
    return null;
  }

  const apiKey = process.env.KICKSDB_API_KEY;
  const apiBaseUrl = process.env.KICKSDB_API_BASE_URL;

  if (!apiKey || !apiBaseUrl) {
    return null;
  }

  const baseUrl = apiBaseUrl.replace(/\/+$/, "");
  try {
    const searchTerms = Array.from(
      new Set([normalizedSku, collapseSku(normalizedSku)].filter(Boolean))
    );

    let record: KicksDbRecord | null = null;

    for (const searchTerm of searchTerms) {
      const candidate = await lookupStockxProductByQuery(baseUrl, apiKey, searchTerm, normalizedSku);
      if (candidate) {
        record = candidate;
        break;
      }
    }

    if (!record) {
      return null;
    }

    const traits = extractTraits(record);
    const rawSku = readString(record, ["sku", "styleCode", "style_code"]) || normalizedSku;
    const normalizedRecordSku = normalizeSku(rawSku) || normalizedSku;
    const brand = readString(record, ["brand", "brand_name"]) || readTrait(traits, ["brand"]);
    const model =
      readString(record, ["model", "primary_title", "silhouette"]) ||
      readTrait(traits, ["model", "silhouette"]);
    const nickname =
      readString(record, ["nickname", "secondary_title"]) ||
      readTrait(traits, ["nickname"]);
    const colorway =
      readString(record, ["colorway", "color"]) ||
      readTrait(traits, ["colorway", "color"]);
    const gender = readString(record, ["gender"]) || readTrait(traits, ["gender"]);
    const releaseDate =
      readString(record, ["release_date", "releaseDate"]) ||
      readTrait(traits, ["release date", "release_date"]);
    const retailPrice =
      readNumber(record, ["retail_price", "retailPrice"]) ||
      readTraitNumber(traits, ["retail price", "retail_price"]);
    const galleryImages = readFirstStringArray(record, ["gallery"]).slice(0, 6);
    const imageUrl =
      galleryImages[0] ||
      readString(record, ["image_url", "image", "imageUrl", "thumbnail"]) ||
      readFirstStringArrayValue(record, ["images"]) ||
      readNestedString(record, [["image", "url"], ["media", "imageUrl"], ["media", "image", "url"]]);
    const description = sanitizeSneakerDescription(readString(record, ["description"]));
    const name =
      readString(record, ["name", "title", "product_name"]) ||
      buildNameFromParts(
        readString(record, ["primary_title"]) || model,
        readString(record, ["secondary_title"]) || nickname
      ) ||
      [brand, model, nickname].filter(Boolean).join(" ").trim() ||
      null;

    return {
      sku: rawSku,
      normalized_sku: normalizedRecordSku,
      brand,
      name,
      model,
      nickname,
      colorway,
      gender,
      release_date: releaseDate,
      retail_price: retailPrice,
      description,
      gallery_images: galleryImages.length > 0 ? galleryImages : imageUrl ? [imageUrl] : [],
      image_url: imageUrl,
      source: "kicksdb",
    };
  } catch (error) {
    logDev("KicksDB request failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function lookupStockxProductByQuery(
  baseUrl: string,
  apiKey: string,
  query: string,
  normalizedSku: string
): Promise<KicksDbRecord | null> {
  const url = new URL(`${baseUrl}/v3/stockx/products`);
  url.search = new URLSearchParams({
    "display[traits]": "true",
    "display[variants]": "true",
    "display[identifiers]": "true",
    "display[prices]": "true",
    "display[statistics]": "true",
    query,
    sort: "rank",
    page: "1",
    limit: "20",
    market: "US",
  }).toString();

  logDev("KicksDB request URL:", url.toString());

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  logDev("KicksDB response status:", response.status);

  if (!response.ok) {
    const failedBody = await response.text();
    logDev("KicksDB failed response body:", failedBody);
    return null;
  }

  const payload: unknown = await response.json();
  const records = extractStockxProducts(payload);

  if (records.length === 0) {
    return null;
  }

  return pickBestSkuMatch(records, normalizedSku);
}

function extractStockxProducts(payload: unknown): KicksDbRecord[] {
  if (!isRecord(payload)) {
    return [];
  }

  const data = payload.data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(isRecord);
}

function pickBestSkuMatch(records: KicksDbRecord[], normalizedSku: string): KicksDbRecord | null {
  const targetCollapsedSku = collapseSku(normalizedSku);
  const scored = records
    .map((record) => ({
      record,
      score: scoreSkuMatch(record, normalizedSku, targetCollapsedSku),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.record || null;
}

function scoreSkuMatch(record: KicksDbRecord, normalizedSku: string, collapsedSku: string): number {
  const recordSku = readString(record, ["sku", "styleCode", "style_code"]);
  const normalizedRecordSku = normalizeSku(recordSku);
  const collapsedRecordSku = collapseSku(normalizedRecordSku);

  if (normalizedRecordSku === normalizedSku) {
    return 100;
  }

  if (collapsedRecordSku && collapsedRecordSku === collapsedSku) {
    return 90;
  }

  const searchableValues = [
    readString(record, ["title", "name", "product_name", "slug", "link"]),
    ...extractVariantIdentifiers(record),
  ]
    .filter(Boolean)
    .map((value) => collapseSku(value));

  if (searchableValues.some((value) => value === collapsedSku)) {
    return 70;
  }

  if (searchableValues.some((value) => value.includes(collapsedSku))) {
    return 40;
  }

  const hasUsableName = Boolean(
    readString(record, ["title", "name", "product_name", "primary_title"]) ||
      readString(record, ["model"])
  );

  if (hasUsableName && normalizedRecordSku) {
    return 10;
  }

  return 0;
}

function extractVariantIdentifiers(record: KicksDbRecord): string[] {
  const variants = record.variants;
  if (!Array.isArray(variants)) {
    return [];
  }

  const values: string[] = [];

  for (const variant of variants) {
    if (!isRecord(variant)) {
      continue;
    }

    const identifiers = variant.identifiers;
    if (!Array.isArray(identifiers)) {
      continue;
    }

    for (const identifier of identifiers) {
      if (!isRecord(identifier)) {
        continue;
      }

      const value = identifier.identifier;
      if (typeof value === "string" && value.trim()) {
        values.push(value.trim());
      }
    }
  }

  return values;
}

function readString(record: KicksDbRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function readFirstStringArrayValue(record: KicksDbRecord, keys: string[]): string | null {
  const values = readFirstStringArray(record, keys);
  return values[0] || null;
}

function readFirstStringArray(record: KicksDbRecord, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }

    const collected: string[] = [];
    for (const entry of value) {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed) {
          collected.push(trimmed);
        }
      }
    }

    if (collected.length > 0) {
      return collected;
    }
  }

  return [];
}

function readNestedString(record: KicksDbRecord, paths: string[][]): string | null {
  for (const path of paths) {
    let value: unknown = record;

    for (const segment of path) {
      if (!isRecord(value)) {
        value = null;
        break;
      }

      value = value[segment];
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function extractTraits(record: KicksDbRecord): Record<string, string> {
  const traits = record.traits;
  if (!Array.isArray(traits)) {
    return {};
  }

  const mapped: Record<string, string> = {};

  for (const trait of traits) {
    if (!isRecord(trait)) {
      continue;
    }

    const traitName = typeof trait.trait === "string" ? trait.trait.trim().toLowerCase() : "";
    const traitValue = typeof trait.value === "string" ? trait.value.trim() : "";

    if (traitName && traitValue) {
      mapped[traitName] = traitValue;
    }
  }

  return mapped;
}

function readTrait(traits: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = traits[key.toLowerCase()];
    if (value) {
      return value;
    }
  }

  return null;
}

function readTraitNumber(traits: Record<string, string>, keys: string[]): number | null {
  const value = readTrait(traits, keys);
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(record: KicksDbRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function isRecord(value: unknown): value is KicksDbRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildNameFromParts(primary: string | null, secondary: string | null): string | null {
  const parts = [primary, secondary].filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  return parts.join(" ").trim() || null;
}

function collapseSku(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function logDev(message: string, payload: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(message, payload);
}
