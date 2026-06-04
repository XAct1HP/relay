import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCatalogProductBySku } from "@/lib/catalog-server";
import { InventoryUpsertError, upsertSellerSkuInventory } from "@/lib/inventory";
import { normalizeSku } from "@/lib/listings";

type ImportMode = "preview" | "commit";
type ImportOutcome = "preview" | "committed" | "blocked" | "partial_failure";

interface ParsedCsvRow {
  row_number: number;
  sku: string;
  normalized_sku: string;
  size: string;
  quantity: number;
  price: number;
}

interface SkuImportGroup {
  sku: string;
  normalized_sku: string;
  variants: Array<{
    size: string;
    quantity: number;
    price: number;
  }>;
  row_numbers: number[];
}

interface ExistingListingSnapshot {
  id: string;
  size_set: Set<string>;
}

export interface InventoryImportRowError {
  row: number;
  field?: "sku" | "size" | "quantity" | "price" | "header" | "import";
  sku?: string;
  message: string;
}

export interface InventoryImportReport {
  outcome: ImportOutcome;
  committed: boolean;
  rows_read: number;
  rows_valid: number;
  rows_invalid: number;
  rows_created: number;
  rows_updated: number;
  row_errors: InventoryImportRowError[];
  skus_processed: number;
  message?: string;
}

const COLUMN_ALIASES = {
  sku: new Set(["sku", "styleid"]),
  size: new Set(["size", "shoesize"]),
  quantity: new Set(["quantity", "qty"]),
  price: new Set(["price", "listprice"]),
} as const;

export async function previewBulkInventoryImport(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string
): Promise<InventoryImportReport> {
  return processBulkInventoryImport(supabase, sellerId, csvText, "preview");
}

export async function commitBulkInventoryImport(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string
): Promise<InventoryImportReport> {
  return processBulkInventoryImport(supabase, sellerId, csvText, "commit");
}

async function processBulkInventoryImport(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string,
  mode: ImportMode
): Promise<InventoryImportReport> {
  const parsed = parseInventoryCsv(csvText);

  if (parsed.row_errors.length > 0) {
    return {
      outcome: mode === "commit" ? "blocked" : "preview",
      committed: false,
      rows_read: parsed.rows_read,
      rows_valid: 0,
      rows_invalid: parsed.rows_read,
      rows_created: 0,
      rows_updated: 0,
      row_errors: parsed.row_errors,
      skus_processed: 0,
      message:
        mode === "commit"
          ? "Import was blocked because the CSV structure is invalid."
          : "Fix the CSV structure issues before importing.",
    };
  }

  const validation = validateInventoryRows(parsed.rows);
  const existingListings = await loadExistingSellerSkuListings(
    supabase,
    sellerId,
    Array.from(validation.groups.keys())
  );

  const importCounts = classifyInventoryRows(validation.valid_rows, existingListings);
  const rows_invalid = new Set(validation.row_errors.map((error) => error.row)).size;

  if (mode === "preview") {
    return {
      outcome: "preview",
      committed: false,
      rows_read: parsed.rows_read,
      rows_valid: validation.valid_rows.length,
      rows_invalid,
      rows_created: importCounts.rows_created,
      rows_updated: importCounts.rows_updated,
      row_errors: validation.row_errors,
      skus_processed: validation.groups.size,
      message:
        validation.row_errors.length > 0
          ? "Preview generated with validation errors. No inventory has been changed."
          : "Preview generated successfully. No inventory has been changed.",
    };
  }

  if (validation.row_errors.length > 0) {
    return {
      outcome: "blocked",
      committed: false,
      rows_read: parsed.rows_read,
      rows_valid: validation.valid_rows.length,
      rows_invalid,
      rows_created: importCounts.rows_created,
      rows_updated: importCounts.rows_updated,
      row_errors: validation.row_errors,
      skus_processed: 0,
      message: "Import was blocked because one or more rows are invalid.",
    };
  }

  const runtimeErrors: InventoryImportRowError[] = [];
  let committedSkuCount = 0;

  for (const group of Array.from(validation.groups.values())) {
    try {
      const catalogProduct = await resolveCatalogProductBySku(supabase, group.sku);
      if (!catalogProduct) {
        runtimeErrors.push(
          ...group.row_numbers.map((rowNumber) => ({
            row: rowNumber,
            field: "sku" as const,
            sku: group.sku,
            message: `Unable to resolve product data for SKU ${group.sku}.`,
          }))
        );
        break;
      }

      await upsertSellerSkuInventory(supabase, {
        seller_id: sellerId,
        sku: catalogProduct.sku,
        product: {
          catalog_product_id: catalogProduct.id,
          brand: catalogProduct.brand,
          model: catalogProduct.model,
          nickname: catalogProduct.nickname,
          description: catalogProduct.description,
          images: catalogProduct.images,
          condition: "new",
          box_condition: "perfect",
          approx_sizing: "normal",
          status: "active",
        },
        variants: group.variants,
      });

      committedSkuCount += 1;
    } catch (error) {
      const message =
        error instanceof InventoryUpsertError
          ? error.message
          : "Failed to import this SKU. Please try again.";

      runtimeErrors.push(
        ...group.row_numbers.map((rowNumber) => ({
          row: rowNumber,
          field: "import" as const,
          sku: group.sku,
          message,
        }))
      );
      break;
    }
  }

  if (runtimeErrors.length > 0) {
    return {
      outcome: committedSkuCount > 0 ? "partial_failure" : "blocked",
      committed: false,
      rows_read: parsed.rows_read,
      rows_valid: validation.valid_rows.length,
      rows_invalid: runtimeErrors.length > 0 ? rows_invalid + new Set(runtimeErrors.map((error) => error.row)).size : rows_invalid,
      rows_created: importCounts.rows_created,
      rows_updated: importCounts.rows_updated,
      row_errors: runtimeErrors,
      skus_processed: committedSkuCount,
      message:
        committedSkuCount > 0
          ? "Import stopped after a server-side error. Some SKUs were applied before the failure."
          : "Import failed before any inventory was written.",
    };
  }

  return {
    outcome: "committed",
    committed: true,
    rows_read: parsed.rows_read,
    rows_valid: validation.valid_rows.length,
    rows_invalid: 0,
    rows_created: importCounts.rows_created,
    rows_updated: importCounts.rows_updated,
    row_errors: [],
    skus_processed: committedSkuCount,
    message: "Inventory import completed successfully.",
  };
}

function parseInventoryCsv(csvText: string): {
  rows_read: number;
  rows: Array<Record<string, string>>;
  row_errors: InventoryImportRowError[];
} {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length === 0) {
    return {
      rows_read: 0,
      rows: [],
      row_errors: [{ row: 0, field: "header", message: "The CSV file is empty." }],
    };
  }

  const headerRow = matrix[0].map((value) => value.trim());
  const headerMap = resolveHeaderMap(headerRow);
  const dataRows = matrix.slice(1).filter((row) => row.some((cell) => cell.trim() !== ""));

  if (headerMap.errors.length > 0) {
    return {
      rows_read: dataRows.length,
      rows: [],
      row_errors: headerMap.errors,
    };
  }

  const rows = dataRows.map((row) => ({
    sku: row[headerMap.columns.sku] || "",
    size: row[headerMap.columns.size] || "",
    quantity: row[headerMap.columns.quantity] || "",
    price: row[headerMap.columns.price] || "",
  }));

  return {
    rows_read: rows.length,
    rows,
    row_errors: [],
  };
}

function resolveHeaderMap(headers: string[]): {
  columns: Record<"sku" | "size" | "quantity" | "price", number>;
  errors: InventoryImportRowError[];
} {
  const normalizedHeaders = headers.map(normalizeHeaderName);
  const columns = {
    sku: -1,
    size: -1,
    quantity: -1,
    price: -1,
  };

  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const header = normalizedHeaders[index];

    if (columns.sku === -1 && COLUMN_ALIASES.sku.has(header)) columns.sku = index;
    if (columns.size === -1 && COLUMN_ALIASES.size.has(header)) columns.size = index;
    if (columns.quantity === -1 && COLUMN_ALIASES.quantity.has(header)) columns.quantity = index;
    if (columns.price === -1 && COLUMN_ALIASES.price.has(header)) columns.price = index;
  }

  const missingColumns = Object.entries(columns)
    .filter(([, index]) => index === -1)
    .map(([name]) => name.toUpperCase());

  return {
    columns,
    errors:
      missingColumns.length > 0
        ? [
            {
              row: 0,
              field: "header",
              message: `Missing required column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(", ")}.`,
            },
          ]
        : [],
  };
}

function validateInventoryRows(rows: Array<Record<string, string>>): {
  valid_rows: ParsedCsvRow[];
  row_errors: InventoryImportRowError[];
  groups: Map<string, SkuImportGroup>;
} {
  const valid_rows: ParsedCsvRow[] = [];
  const row_errors: InventoryImportRowError[] = [];
  const duplicateKeys = new Set<string>();
  const groups = new Map<string, SkuImportGroup>();

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const row = rows[index];
    const sku = normalizeImportSkuDisplay(row.sku);
    const normalizedSku = normalizeSku(sku);
    const size = String(row.size || "").trim();
    const quantity = parseImportQuantity(row.quantity);
    const price = parseImportPrice(row.price);

    if (!sku || !normalizedSku) {
      row_errors.push({
        row: rowNumber,
        field: "sku",
        message: "SKU is required.",
      });
      continue;
    }

    if (!size) {
      row_errors.push({
        row: rowNumber,
        field: "size",
        sku,
        message: "Size is required.",
      });
      continue;
    }

    if (quantity === null) {
      row_errors.push({
        row: rowNumber,
        field: "quantity",
        sku,
        message: "Quantity must be an integer greater than or equal to 0.",
      });
      continue;
    }

    if (price === null) {
      row_errors.push({
        row: rowNumber,
        field: "price",
        sku,
        message: "Price must be a positive number.",
      });
      continue;
    }

    const duplicateKey = `${normalizedSku}::${size.toUpperCase()}`;
    if (duplicateKeys.has(duplicateKey)) {
      row_errors.push({
        row: rowNumber,
        field: "size",
        sku,
        message: "Duplicate SKU/size combination found in this import.",
      });
      continue;
    }
    duplicateKeys.add(duplicateKey);

    const parsedRow: ParsedCsvRow = {
      row_number: rowNumber,
      sku,
      normalized_sku: normalizedSku,
      size,
      quantity,
      price,
    };

    valid_rows.push(parsedRow);

    const group = groups.get(normalizedSku);
    if (group) {
      group.variants.push({
        size,
        quantity,
        price,
      });
      group.row_numbers.push(rowNumber);
    } else {
      groups.set(normalizedSku, {
        sku,
        normalized_sku: normalizedSku,
        variants: [
          {
            size,
            quantity,
            price,
          },
        ],
        row_numbers: [rowNumber],
      });
    }
  }

  return {
    valid_rows,
    row_errors,
    groups,
  };
}

async function loadExistingSellerSkuListings(
  supabase: SupabaseClient,
  sellerId: string,
  normalizedSkus: string[]
): Promise<Map<string, ExistingListingSnapshot>> {
  if (normalizedSkus.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("listings")
    .select("id, sku_normalized, listing_variants(size)")
    .eq("seller_id", sellerId)
    .in("sku_normalized", normalizedSkus)
    .neq("status", "removed");

  if (error) {
    throw error;
  }

  const snapshot = new Map<string, ExistingListingSnapshot>();

  for (const listing of data || []) {
    const normalizedSku = String(listing.sku_normalized || "");
    if (!normalizedSku) {
      continue;
    }

    snapshot.set(normalizedSku, {
      id: listing.id,
      size_set: new Set(
        ((listing.listing_variants as Array<{ size?: string }> | null) || [])
          .map((variant) => String(variant.size || "").trim())
          .filter(Boolean)
      ),
    });
  }

  return snapshot;
}

function classifyInventoryRows(
  rows: ParsedCsvRow[],
  existingListings: Map<string, ExistingListingSnapshot>
): { rows_created: number; rows_updated: number } {
  let rows_created = 0;
  let rows_updated = 0;

  for (const row of rows) {
    const existingListing = existingListings.get(row.normalized_sku);
    if (existingListing && existingListing.size_set.has(row.size)) {
      rows_updated += 1;
    } else {
      rows_created += 1;
    }
  }

  return { rows_created, rows_updated };
}

function parseCsvMatrix(csvText: string): string[][] {
  const sanitized = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < sanitized.length; index += 1) {
    const character = sanitized[index];
    const nextCharacter = sanitized[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = "";
      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function normalizeHeaderName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeImportSkuDisplay(value: string): string {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function parseImportQuantity(value: string): number | null {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseImportPrice(value: string): number | null {
  const normalized = String(value || "")
    .trim()
    .replace(/[$,]/g, "");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}
