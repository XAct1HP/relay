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
  const url = new URL(`${baseUrl}/v3/unified/gtin`);
  url.search = new URLSearchParams({
    identifier: "",
    identifier_type: "",
    sku: normalizedSku,
    query: "",
    source: "stockx",
    page: "1",
    limit: "20",
    sort: "updated_at:desc",
  }).toString();

  try {
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
    const records = extractSneakerRecords(payload);
    const record = records.find((candidate) => isUsableSneakerRecord(candidate, normalizedSku));

    if (!record) {
      return null;
    }

    const rawSku = readString(record, ["sku", "styleCode", "style_code"]) || normalizedSku;
    const normalizedRecordSku = normalizeSku(rawSku) || normalizedSku;
    const brand = readString(record, ["brand", "brand_name"]);
    const model = readString(record, ["model", "silhouette"]);
    const nickname = readString(record, ["nickname"]);
    const colorway = readString(record, ["colorway", "color"]);
    const gender = readString(record, ["gender"]);
    const releaseDate = readString(record, ["release_date", "releaseDate"]);
    const retailPrice = readNumber(record, ["retail_price", "retailPrice"]);
    const imageUrl =
      readString(record, ["image_url", "image", "imageUrl", "thumbnail"]) ||
      readNestedString(record, [["image", "url"], ["media", "imageUrl"], ["media", "image", "url"]]);
    const name =
      readString(record, ["name", "title", "product_name"]) ||
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
  } catch (error) {
    logDev("KicksDB request failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

function extractSneakerRecords(payload: unknown): KicksDbRecord[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as KicksDbRecord;
  const candidates: KicksDbRecord[] = [];

  collectRecords(root, candidates);

  if (isRecord(root.data)) {
    collectRecords(root.data, candidates);
  }

  if (Array.isArray(root.data)) {
    collectArrayRecords(root.data, candidates);
  }

  if (Array.isArray(root.results)) {
    collectArrayRecords(root.results, candidates);
  }

  if (Array.isArray(root.items)) {
    collectArrayRecords(root.items, candidates);
  }

  if (Array.isArray(root.products)) {
    collectArrayRecords(root.products, candidates);
  }

  if (isRecord(root.result)) {
    collectRecords(root.result, candidates);
  }

  if (isRecord(root.product)) {
    collectRecords(root.product, candidates);
  }

  return dedupeRecords(candidates);
}

function collectRecords(value: unknown, candidates: KicksDbRecord[]) {
  if (!isRecord(value)) {
    return;
  }

  candidates.push(value);

  for (const nestedKey of ["data", "result", "product", "item"]) {
    const nestedValue = value[nestedKey];

    if (isRecord(nestedValue)) {
      candidates.push(nestedValue);
    }

    if (Array.isArray(nestedValue)) {
      collectArrayRecords(nestedValue, candidates);
    }
  }
}

function collectArrayRecords(values: unknown[], candidates: KicksDbRecord[]) {
  for (const value of values) {
    if (isRecord(value)) {
      candidates.push(value);
    }
  }
}

function dedupeRecords(records: KicksDbRecord[]): KicksDbRecord[] {
  const seen = new Set<KicksDbRecord>();
  const deduped: KicksDbRecord[] = [];

  for (const record of records) {
    if (seen.has(record)) {
      continue;
    }

    seen.add(record);
    deduped.push(record);
  }

  return deduped;
}

function isUsableSneakerRecord(record: KicksDbRecord, fallbackSku: string): boolean {
  const rawSku = readString(record, ["sku", "styleCode", "style_code"]) || fallbackSku;
  const normalizedRecordSku = normalizeSku(rawSku);
  const name =
    readString(record, ["name", "title", "product_name"]) ||
    readString(record, ["model", "silhouette"]) ||
    readString(record, ["brand", "brand_name"]);

  return Boolean(normalizedRecordSku && name);
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

function logDev(message: string, payload: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(message, payload);
}
