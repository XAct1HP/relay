import "server-only";

import { normalizeSku } from "./normalizeSku";

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

  // Adjust this path to the exact KicksDB SKU lookup route from their dashboard docs.
  // Common patterns are `/catalog/sku/{sku}` or `/catalog/products/{sku}`.
  const url = new URL(`${baseUrl}/catalog/sku/${encodeURIComponent(normalizedSku)}`);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    const record = extractSneakerRecord(payload);

    if (!record) {
      return null;
    }

    // Adjust these field mappings if the KicksDB response uses different keys in production.
    const rawSku = readString(record, ["sku", "styleCode", "style_code"]) || normalizedSku;
    const normalizedRecordSku = normalizeSku(rawSku) || normalizedSku;
    const brand = readString(record, ["brand"]);
    const model = readString(record, ["model", "silhouette"]);
    const nickname = readString(record, ["nickname", "title"]);
    const colorway = readString(record, ["colorway"]);
    const gender = readString(record, ["gender"]);
    const releaseDate = readString(record, ["release_date", "releaseDate"]);
    const retailPrice = readNumber(record, ["retail_price", "retailPrice"]);
    const imageUrl =
      readString(record, ["image_url", "imageUrl", "thumbnail"]) ||
      readNestedString(record, [["image", "url"], ["media", "imageUrl"]]);
    const name =
      readString(record, ["name"]) ||
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
      image_url: imageUrl,
      source: "kicksdb",
    };
  } catch {
    return null;
  }
}

function extractSneakerRecord(payload: unknown): KicksDbRecord | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as KicksDbRecord;

  if (isRecord(root.data)) {
    return root.data;
  }

  if (Array.isArray(root.data) && isRecord(root.data[0])) {
    return root.data[0];
  }

  if (Array.isArray(root.results) && isRecord(root.results[0])) {
    return root.results[0];
  }

  if (Array.isArray(root.items) && isRecord(root.items[0])) {
    return root.items[0];
  }

  if (isRecord(root.result)) {
    return root.result;
  }

  return isRecord(root) ? root : null;
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
