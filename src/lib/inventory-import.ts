import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCatalogProductBySku } from "@/lib/catalog-server";
import { InventoryUpsertError, upsertSellerSkuInventory } from "@/lib/inventory";
import { normalizeSku } from "@/lib/listings";
import { resolveSneakerBySku } from "@/lib/sneaker-server";

type ImportMode = "preview" | "commit";
type ImportOutcome = "preview" | "committed" | "blocked" | "partial_failure";
export type CsvQuantityMode = "with_quantity" | "single_row_per_shoe";
export type CsvQuantityPreference = "auto" | CsvQuantityMode;

interface ParsedCsvRow {
  row_number: number;
  sku: string;
  normalized_sku: string;
  size: string;
  quantity: number;
  price: number;
  condition: "new" | "used";
}

interface SkuImportGroup {
  sku: string;
  normalized_sku: string;
  variants: Array<{
    size: string;
    quantity: number;
    price: number;
    condition: "new" | "used";
  }>;
  row_numbers: number[];
}

interface ExistingListingSnapshot {
  id: string;
  size_set: Set<string>;
}

export interface InventoryImportRowError {
  row: number;
  field?:
    | "sku"
    | "size"
    | "quantity"
    | "price"
    | "condition"
    | "header"
    | "import";
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
  csv_quantity_mode?: CsvQuantityMode;
  csv_quantity_mode_source?: "auto" | "manual";
  used_variants_needing_photo?: number;
}

const COLUMN_ALIASES = {
  sku: new Set(["sku", "styleid"]),
  size: new Set(["size", "shoesize"]),
  quantity: new Set(["quantity", "qty"]),
  price: new Set(["price", "listprice"]),
  condition: new Set(["condition", "shoecondition"]),
} as const;

export async function previewBulkInventoryImport(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string,
  quantityPreference: CsvQuantityPreference = "auto"
): Promise<InventoryImportReport> {
  return processBulkInventoryImport(
    supabase,
    sellerId,
    csvText,
    "preview",
    quantityPreference
  );
}

export async function commitBulkInventoryImport(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string,
  quantityPreference: CsvQuantityPreference = "auto"
): Promise<InventoryImportReport> {
  return processBulkInventoryImport(
    supabase,
    sellerId,
    csvText,
    "commit",
    quantityPreference
  );
}

async function processBulkInventoryImport(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string,
  mode: ImportMode,
  quantityPreference: CsvQuantityPreference = "auto"
): Promise<InventoryImportReport> {
  const parsed = parseInventoryCsv(csvText, quantityPreference);

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
      csv_quantity_mode: parsed.quantity_mode,
      csv_quantity_mode_source: parsed.quantity_mode_source,
      message:
        mode === "commit"
          ? "Import was blocked because the CSV structure is invalid."
          : "Fix the CSV structure issues before importing.",
    };
  }

  const validation = validateInventoryRows(parsed.rows, parsed.quantity_mode);
  const existingListings = await loadExistingSellerSkuListings(
    supabase,
    sellerId,
    Array.from(validation.groups.keys())
  );

  const importCounts = classifyInventoryRows(validation.valid_rows, existingListings);
  const rows_invalid = new Set(validation.row_errors.map((error) => error.row)).size;
  const usedVariantsNeedingPhoto = countUsedVariantsWithoutPhoto(validation.groups);

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
      csv_quantity_mode: parsed.quantity_mode,
      csv_quantity_mode_source: parsed.quantity_mode_source,
      used_variants_needing_photo: usedVariantsNeedingPhoto,
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
      csv_quantity_mode: parsed.quantity_mode,
      csv_quantity_mode_source: parsed.quantity_mode_source,
      used_variants_needing_photo: usedVariantsNeedingPhoto,
      message: "Import was blocked because one or more rows are invalid.",
    };
  }

  const runtimeErrors: InventoryImportRowError[] = [];
  let committedSkuCount = 0;

  for (const group of Array.from(validation.groups.values())) {
    try {
      const catalogProduct = await resolveCatalogProductBySku(supabase, group.sku);
      const sneakerLookup = await resolveSneakerBySku(supabase, group.sku);
      const sneaker = sneakerLookup?.sneaker || null;

      if (!catalogProduct && !sneaker) {
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

      const hasNew = group.variants.some((v) => v.condition === "new");
      const hasUsed = group.variants.some((v) => v.condition === "used");
      const listingCondition =
        hasNew && hasUsed ? "mixed" : hasUsed ? "used_good" : "new";

      await upsertSellerSkuInventory(supabase, {
        seller_id: sellerId,
        sku: sneaker?.sku || catalogProduct?.sku || group.sku,
        product: {
          sneaker_id: sneaker?.id || null,
          catalog_product_id: catalogProduct?.id || null,
          brand: sneaker?.brand || catalogProduct?.brand || "Catalog Sneaker",
          model:
            sneaker?.model ||
            catalogProduct?.model ||
            sneaker?.name ||
            `SKU ${group.sku}`,
          nickname: sneaker?.nickname || catalogProduct?.nickname || null,
          description:
            sneaker?.description ||
            catalogProduct?.description ||
            `Catalog placeholder for SKU ${group.sku}. Update this listing when richer product data is available.`,
          images: buildImportListingImages({
            sneakerGalleryImages: sneaker?.gallery_images || [],
            sneakerImageUrl: sneaker?.image_url || null,
            catalogImages: catalogProduct?.images || [],
          }),
          condition: listingCondition,
          box_condition: "perfect",
          approx_sizing: "normal",
          status: "active",
        },
        variants: group.variants.map((v) => ({
          size: v.size,
          quantity: v.quantity,
          price: v.price,
          condition: v.condition,
          // Used variants without a photo start inactive and land in Needs Attention
          is_active: v.condition === "used" ? false : true,
          needs_condition_photo: v.condition === "used",
        })),
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
      csv_quantity_mode: parsed.quantity_mode,
      csv_quantity_mode_source: parsed.quantity_mode_source,
      used_variants_needing_photo: usedVariantsNeedingPhoto,
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
    csv_quantity_mode: parsed.quantity_mode,
    csv_quantity_mode_source: parsed.quantity_mode_source,
    used_variants_needing_photo: usedVariantsNeedingPhoto,
    message:
      usedVariantsNeedingPhoto > 0
        ? `Inventory import completed successfully. ${usedVariantsNeedingPhoto} used variant${usedVariantsNeedingPhoto === 1 ? "" : "s"} need${usedVariantsNeedingPhoto === 1 ? "s" : ""} a condition photo before going live. Upload them from Needs Attention in My Listings.`
        : "Inventory import completed successfully.",
  };
}

function parseInventoryCsv(
  csvText: string,
  quantityPreference: CsvQuantityPreference
): {
  rows_read: number;
  rows: Array<Record<string, string>>;
  row_errors: InventoryImportRowError[];
  quantity_mode: CsvQuantityMode;
  quantity_mode_source: "auto" | "manual";
} {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length === 0) {
    return {
      rows_read: 0,
      rows: [],
      row_errors: [{ row: 0, field: "header", message: "The CSV file is empty." }],
      quantity_mode: "with_quantity",
      quantity_mode_source: "auto",
    };
  }

  const headerRow = matrix[0].map((value) => value.trim());
  const headerMap = resolveHeaderMap(headerRow, quantityPreference);
  const dataRows = matrix.slice(1).filter((row) => row.some((cell) => cell.trim() !== ""));

  if (headerMap.errors.length > 0) {
    return {
      rows_read: dataRows.length,
      rows: [],
      row_errors: headerMap.errors,
      quantity_mode: headerMap.quantity_mode,
      quantity_mode_source: headerMap.quantity_mode_source,
    };
  }

  const rows = dataRows.map((row) => ({
    sku: row[headerMap.columns.sku] || "",
    size: row[headerMap.columns.size] || "",
    quantity:
      headerMap.columns.quantity >= 0 ? row[headerMap.columns.quantity] || "" : "",
    price: row[headerMap.columns.price] || "",
    condition: row[headerMap.columns.condition] || "",
  }));

  return {
    rows_read: rows.length,
    rows,
    row_errors: [],
    quantity_mode: headerMap.quantity_mode,
    quantity_mode_source: headerMap.quantity_mode_source,
  };
}

function resolveHeaderMap(
  headers: string[],
  quantityPreference: CsvQuantityPreference
): {
  columns: Record<"sku" | "size" | "quantity" | "price" | "condition", number>;
  errors: InventoryImportRowError[];
  quantity_mode: CsvQuantityMode;
  quantity_mode_source: "auto" | "manual";
} {
  const normalizedHeaders = headers.map(normalizeHeaderName);
  const columns = {
    sku: -1,
    size: -1,
    quantity: -1,
    price: -1,
    condition: -1,
  };

  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const header = normalizedHeaders[index];

    if (columns.sku === -1 && COLUMN_ALIASES.sku.has(header)) columns.sku = index;
    if (columns.size === -1 && COLUMN_ALIASES.size.has(header)) columns.size = index;
    if (columns.quantity === -1 && COLUMN_ALIASES.quantity.has(header)) columns.quantity = index;
    if (columns.price === -1 && COLUMN_ALIASES.price.has(header)) columns.price = index;
    if (columns.condition === -1 && COLUMN_ALIASES.condition.has(header)) columns.condition = index;
  }

  // Determine effective quantity mode
  const hasQuantityColumn = columns.quantity !== -1;
  let quantity_mode: CsvQuantityMode;
  let quantity_mode_source: "auto" | "manual";

  if (quantityPreference === "auto") {
    quantity_mode = hasQuantityColumn ? "with_quantity" : "single_row_per_shoe";
    quantity_mode_source = "auto";
  } else {
    quantity_mode = quantityPreference;
    quantity_mode_source = "manual";
  }

  const errors: InventoryImportRowError[] = [];

  // Required columns depend on mode
  const requiredKeys: Array<keyof typeof columns> = ["sku", "size", "price", "condition"];
  if (quantity_mode === "with_quantity") {
    requiredKeys.push("quantity");
  }

  const missingColumns = requiredKeys.filter((key) => columns[key] === -1);

  if (missingColumns.length > 0) {
    const labels = missingColumns.map((k) => k.toUpperCase());
    errors.push({
      row: 0,
      field: "header",
      message:
        quantity_mode === "with_quantity"
          ? `Missing required column${labels.length > 1 ? "s" : ""}: ${labels.join(", ")}.`
          : `Missing required column${labels.length > 1 ? "s" : ""}: ${labels.join(", ")}. Add these columns or switch mode.`,
    });
  }

  // If the user explicitly picked "with_quantity" but there is no quantity column, that's a conflict
  if (quantityPreference === "with_quantity" && !hasQuantityColumn && errors.length === 0) {
    errors.push({
      row: 0,
      field: "header",
      message:
        "You selected the mode with a quantity column, but no QUANTITY column was found in the CSV.",
    });
  }

  return {
    columns,
    errors,
    quantity_mode,
    quantity_mode_source,
  };
}

function validateInventoryRows(
  rows: Array<Record<string, string>>,
  quantityMode: CsvQuantityMode
): {
  valid_rows: ParsedCsvRow[];
  row_errors: InventoryImportRowError[];
  groups: Map<string, SkuImportGroup>;
} {
  const valid_rows: ParsedCsvRow[] = [];
  const row_errors: InventoryImportRowError[] = [];
  // Only enforce duplicate SKU+size in with_quantity mode. In single_row mode,
  // duplicates are expected and aggregated.
  const seenKeys = new Map<string, { rowNumber: number; runningQty: number }>();
  const groups = new Map<string, SkuImportGroup>();

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const row = rows[index];
    const sku = normalizeImportSkuDisplay(row.sku);
    const normalizedSku = normalizeSku(sku);
    const size = String(row.size || "").trim();
    const rawQuantity =
      quantityMode === "single_row_per_shoe" ? "1" : row.quantity;
    const quantity = parseImportQuantity(rawQuantity);
    const price = parseImportPrice(row.price);
    const condition = parseImportCondition(row.condition);

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

    if (condition === null) {
      row_errors.push({
        row: rowNumber,
        field: "condition",
        sku,
        message: 'Condition is required and must be either "new" or "used".',
      });
      continue;
    }

    const duplicateKey = `${normalizedSku}::${size.toUpperCase()}::${condition}`;
    const prior = seenKeys.get(duplicateKey);

    if (prior && quantityMode === "with_quantity") {
      row_errors.push({
        row: rowNumber,
        field: "size",
        sku,
        message:
          "Duplicate SKU/size/condition combination found in this import.",
      });
      continue;
    }

    if (prior && quantityMode === "single_row_per_shoe") {
      // Aggregate: bump the earlier variant's quantity by 1 (or whatever this row parsed as)
      const group = groups.get(normalizedSku);
      if (group) {
        const variant = group.variants.find(
          (v) => v.size === size && v.condition === condition
        );
        if (variant) {
          variant.quantity += quantity;
        }
        group.row_numbers.push(rowNumber);
      }
      prior.runningQty += quantity;
      // Still count as a valid row for reporting
      valid_rows.push({
        row_number: rowNumber,
        sku,
        normalized_sku: normalizedSku,
        size,
        quantity,
        price,
        condition,
      });
      continue;
    }

    seenKeys.set(duplicateKey, { rowNumber, runningQty: quantity });

    const parsedRow: ParsedCsvRow = {
      row_number: rowNumber,
      sku,
      normalized_sku: normalizedSku,
      size,
      quantity,
      price,
      condition,
    };

    valid_rows.push(parsedRow);

    const group = groups.get(normalizedSku);
    if (group) {
      group.variants.push({
        size,
        quantity,
        price,
        condition,
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
            condition,
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

function countUsedVariantsWithoutPhoto(
  groups: Map<string, SkuImportGroup>
): number {
  let count = 0;
  for (const group of Array.from(groups.values())) {
    for (const variant of group.variants) {
      if (variant.condition === "used") count += 1;
    }
  }
  return count;
}

function parseImportCondition(value: string): "new" | "used" | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["new", "brand new", "brand_new", "brandnew", "bnwt", "bnib", "n"].includes(normalized)) {
    return "new";
  }
  if (["used", "pre-owned", "preowned", "pre_owned", "worn", "u"].includes(normalized)) {
    return "used";
  }
  return null;
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

function buildImportListingImages(input: {
  sneakerGalleryImages: string[];
  sneakerImageUrl: string | null;
  catalogImages: string[];
}): string[] {
  const deduped: string[] = [];

  for (const value of [
    ...input.sneakerGalleryImages,
    input.sneakerImageUrl,
    ...input.catalogImages,
  ]) {
    const normalized = normalizeOptionalImageUrl(value);
    if (normalized && !deduped.includes(normalized)) {
      deduped.push(normalized);
    }
  }

  return deduped.slice(0, 6);
}

function normalizeOptionalImageUrl(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}
