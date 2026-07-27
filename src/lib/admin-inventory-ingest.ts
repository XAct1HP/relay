import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCatalogProductBySku } from "@/lib/catalog-server";
import {
  InventoryUpsertError,
  replaceSellerSkuListingInventory,
  upsertSellerSkuInventory,
} from "@/lib/inventory";
import { normalizeSku } from "@/lib/listings";
import { resolveSneakerBySku } from "@/lib/sneaker-server";

export type AdminInventoryPricingMode = "aggressive" | "balanced" | "manual";
export type AdminInventoryPreviewAction =
  | "create"
  | "update"
  | "no_change"
  | "manual_review"
  | "blocked";
export type AdminInventoryMatchConfidence =
  | "high"
  | "medium"
  | "low"
  | "unmatched";

export interface AdminInventorySellerOption {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  username: string;
}

export interface AdminInventoryPreviewRow {
  key: string;
  row_numbers: number[];
  source_name: string;
  source_sku: string;
  normalized_sku: string | null;
  size: string;
  quantity: number;
  condition: "new" | "used";
  box_condition: "perfect" | "good" | "damaged" | "no_box";
  uploaded_price: number | null;
  final_price: number | null;
  existing_price: number | null;
  existing_quantity: number | null;
  matched_product: string | null;
  matched_sku: string | null;
  matched_brand: string | null;
  matched_model: string | null;
  matched_nickname: string | null;
  matched_image_url: string | null;
  match_source: "sku" | "name_fallback" | "catalog" | "none";
  match_confidence: AdminInventoryMatchConfidence;
  requires_review_approval: boolean;
  pricing_source: "spreadsheet" | "stockx_aggressive" | "stockx_balanced" | "manual_required";
  action: AdminInventoryPreviewAction;
  action_reason: string | null;
  live_lookup_status: "pending" | "complete" | "failed";
  live_lookup_message: string | null;
  warnings: string[];
}

export interface AdminInventoryMissingVariant {
  key: string;
  normalized_sku: string;
  listing_id: string;
  listing_title: string;
  size: string;
  condition: "new" | "used";
  quantity: number;
  price: number;
  resolution:
    | "replaced_by_uploaded_sku"
    | "reconcile_missing_if_enabled";
}

export interface AdminInventoryPreviewReport {
  job_id?: string | null;
  seller_id: string;
  pricing_mode: AdminInventoryPricingMode;
  processing_status?: "queued" | "running" | "rate_limited" | "complete" | "failed";
  rows_read: number;
  source_rows_considered: number;
  grouped_rows: number;
  ready_rows: number;
  review_rows: number;
  blocked_rows: number;
  live_lookup_total: number;
  live_lookup_completed: number;
  waiting_until?: string | null;
  preview_rows: AdminInventoryPreviewRow[];
  missing_variants: AdminInventoryMissingVariant[];
  message: string;
}

export interface AdminInventoryCommitReport {
  seller_id: string;
  pricing_mode: AdminInventoryPricingMode;
  committed_skus: number;
  created_skus: number;
  updated_skus: number;
  skipped_skus: number;
  deactivated_variants: number;
  row_errors: Array<{ key: string; message: string }>;
  message: string;
}

interface PreviewOptions {
  pricing_mode: AdminInventoryPricingMode;
  reconcile_missing?: boolean;
}

interface CommitOptions extends PreviewOptions {
  manual_price_by_key?: Record<string, string>;
  review_decision_by_key?: Record<string, string>;
  preview_report?: AdminInventoryPreviewReport | null;
}

interface ParsedSpreadsheetRow {
  row_number: number;
  source_brand: string;
  source_name: string;
  source_sku: string;
  normalized_sku: string | null;
  size: string;
  quantity: number;
  condition: "new" | "used";
  box_condition: "perfect" | "good" | "damaged" | "no_box";
  uploaded_price: number | null;
  warnings: string[];
  parse_error: string | null;
}

interface GroupedSpreadsheetRow {
  key: string;
  normalized_sku: string | null;
  display_sku: string;
  source_brand: string;
  source_name: string;
  source_sku: string;
  size: string;
  quantity: number;
  condition: "new" | "used";
  box_condition: "perfect" | "good" | "damaged" | "no_box";
  uploaded_price: number | null;
  row_numbers: number[];
  warnings: string[];
  parse_error: string | null;
}

interface ExistingSellerVariant {
  listing_id: string;
  listing_title: string;
  normalized_sku: string;
  size: string;
  condition: "new" | "used";
  price: number;
  quantity: number;
  is_active: boolean;
}

interface ExistingSellerListing {
  listing_id: string;
  normalized_sku: string;
  display_sku: string;
  brand: string;
  model: string;
  nickname: string | null;
  condition:
    | "new"
    | "mixed"
    | "like_new"
    | "used_excellent"
    | "used_good"
    | "used_fair";
  box_condition: "perfect" | "good" | "damaged" | "no_box";
  approx_sizing: "lightweight" | "normal" | "heavy";
  description: string | null;
  images: string[];
  variants: ExistingSellerVariant[];
}

type PricingLookupResult =
  | {
      status: "priced";
      final_price: number;
      warning: string | null;
    }
  | {
      status: "manual_review";
      message: string;
    };

interface StockxPricingVariantSize {
  size: string;
}

interface StockxPricingVariant {
  size: string | null;
  lowest_ask: number | null;
  sizes: StockxPricingVariantSize[];
}

interface StockxPricingProduct {
  variants: StockxPricingVariant[];
}

interface KicksDbLiveLookup {
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
  variants: StockxPricingVariant[];
  match_source: "sku" | "name_fallback";
  requires_review_approval: boolean;
  review_reason: string | null;
}

export interface AdminInventoryPreviewContext {
  seller_id: string;
  pricing_mode: AdminInventoryPricingMode;
  grouped_rows: GroupedSpreadsheetRow[];
  lookup_seed_by_sku: Map<string, GroupedSpreadsheetRow>;
  existing_listings: ExistingSellerListing[];
  existing_variant_map: Map<string, ExistingSellerVariant>;
  catalog_by_sku: Map<string, ResolvedCatalogLike>;
  sneaker_by_sku: Map<string, ResolvedSneakerLike>;
  unique_lookup_skus: string[];
  live_lookup_by_sku: Map<string, KicksDbLiveLookup | null>;
  initial_report: AdminInventoryPreviewReport;
}

type ResolvedCatalogLike =
  | Awaited<ReturnType<typeof resolveCatalogProductBySku>>
  | null;
type ResolvedSneakerLike =
  | Awaited<ReturnType<typeof resolveSneakerBySku>>
  | null;

const COLUMN_ALIASES = {
  name: new Set(["name", "productname", "title", "model"]),
  sku: new Set(["sku", "styleid", "stylecode"]),
  size: new Set(["size", "shoesize"]),
  quantity: new Set(["quantity", "qty"]),
  condition: new Set(["condition", "shoecondition"]),
  price: new Set(["price", "listprice"]),
  brand: new Set(["brand"]),
} as const;

const BRAND_PREFIXES = [
  "nike",
  "jordan",
  "adidas",
  "reebok",
  "birkenstock",
  "ugg",
  "converse",
  "new balance",
  "asics",
  "puma",
  "crocs",
  "vans",
];

const PREVIEW_PRICING_LOOKUP_CONCURRENCY = 6;
const PREVIEW_PRICING_LOOKUP_TIMEOUT_MS = 7000;

export async function listAdminInventorySellers(
  supabase: SupabaseClient
): Promise<AdminInventorySellerOption[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, full_name, username")
    .eq("role", "seller")
    .eq("seller_application_status", "approved")
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("full_name", { ascending: true, nullsFirst: false })
    .order("username", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as AdminInventorySellerOption[];
}

export async function previewAdminInventoryIngest(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string,
  options: PreviewOptions
): Promise<AdminInventoryPreviewReport> {
  const context = await initializeAdminInventoryPreview(supabase, sellerId, csvText, options);
  if (!context) {
    return buildEmptyPreviewReport("", options.pricing_mode, "Select a seller before previewing an upload.");
  }

  return continueAdminInventoryPreview(supabase, context);
}

export async function initializeAdminInventoryPreview(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string,
  options: PreviewOptions
): Promise<AdminInventoryPreviewContext | null> {
  const normalizedSellerId = String(sellerId || "").trim();

  if (!normalizedSellerId) {
    return null;
  }

  const parsedRows = parseAdminInventoryRows(csvText);
  const groupedRows = groupParsedRows(parsedRows);
  const existingListings = await loadExistingSellerListings(supabase, normalizedSellerId);
  const existingVariantMap = buildExistingVariantMap(existingListings);
  const productResolution = await resolveGroupedProducts(supabase, groupedRows);
  const lookupSeedBySku = new Map<string, GroupedSpreadsheetRow>();
  for (const row of groupedRows) {
    if (row.normalized_sku && !lookupSeedBySku.has(row.normalized_sku)) {
      lookupSeedBySku.set(row.normalized_sku, row);
    }
  }
  const uniqueLookupSkus = Array.from(
    new Set(
      groupedRows
        .map((row) => row.normalized_sku)
        .filter((value): value is string => Boolean(value))
    )
  );

  const previewRows: AdminInventoryPreviewRow[] = groupedRows.map((row) =>
    buildPreviewRow({
      row,
      existingVariant: existingVariantMap.get(row.key) || null,
      catalogProduct: productResolution.catalogBySku.get(row.normalized_sku || "") || null,
      sneakerLookup: productResolution.sneakerBySku.get(row.normalized_sku || "") || null,
      pricingResult: null,
      pricingMode: options.pricing_mode,
      liveLookup: null,
      liveLookupStatus: row.normalized_sku ? "pending" : "complete",
      forcePendingLiveLookup: Boolean(row.normalized_sku),
    })
  );

  const baseReport = finalizePreviewReport({
    seller_id: normalizedSellerId,
    pricing_mode: options.pricing_mode,
    rows_read: parsedRows.rows_read,
    source_rows_considered: parsedRows.rows_considered,
    preview_rows: previewRows,
    missing_variants: buildMissingVariantPreview(existingListings, previewRows),
    grouped_rows: previewRows.length,
    processing_status: previewRows.length === 0 ? "complete" : "queued",
    live_lookup_total: uniqueLookupSkus.length,
    live_lookup_completed: 0,
    waiting_until: null,
    message:
      previewRows.length === 0
        ? "No importable rows were found in this spreadsheet."
        : "Preview started. Rows will continue updating as KicksDB results arrive.",
  });

  return {
    seller_id: normalizedSellerId,
    pricing_mode: options.pricing_mode,
    grouped_rows: groupedRows,
    lookup_seed_by_sku: lookupSeedBySku,
    existing_listings: existingListings,
    existing_variant_map: existingVariantMap,
    catalog_by_sku: productResolution.catalogBySku,
    sneaker_by_sku: productResolution.sneakerBySku,
    unique_lookup_skus: uniqueLookupSkus,
    live_lookup_by_sku: new Map<string, KicksDbLiveLookup | null>(),
    initial_report: baseReport,
  };
}

export async function continueAdminInventoryPreview(
  supabase: SupabaseClient,
  context: AdminInventoryPreviewContext,
  options?: {
    onProgress?: (report: AdminInventoryPreviewReport) => Promise<void> | void;
  }
): Promise<AdminInventoryPreviewReport> {
  let report: AdminInventoryPreviewReport = {
    ...context.initial_report,
    processing_status:
      context.initial_report.live_lookup_total > 0 ? "running" : "complete",
    message:
      context.initial_report.live_lookup_total > 0
        ? "Preview running. KicksDB matches and pricing are still loading."
        : context.initial_report.message,
  } satisfies AdminInventoryPreviewReport;

  if (options?.onProgress) {
    await options.onProgress(report);
  }

  let nextAllowedAt = Date.now();

  for (const normalizedSku of context.unique_lookup_skus) {
    const seedRow = context.lookup_seed_by_sku.get(normalizedSku);
    if (!seedRow) {
      continue;
    }
    const delayMs = Math.max(0, nextAllowedAt - Date.now());
    if (delayMs > 0) {
      report = finalizePreviewReport({
        ...report,
        processing_status: "rate_limited",
        waiting_until: new Date(Date.now() + delayMs).toISOString(),
        message: "Waiting for the KicksDB request window before continuing the preview.",
      });
      if (options?.onProgress) {
        await options.onProgress(report);
      }
      await sleep(delayMs);
    }

    const lookupResult = await fetchKicksDbLiveLookupForRow(seedRow);
    nextAllowedAt = Date.now() + 1000;

    if (lookupResult.status === "rate_limited") {
      const retryAfterMs = lookupResult.retry_after_ms;
      report = finalizePreviewReport({
        ...report,
        processing_status: "rate_limited",
        waiting_until: new Date(Date.now() + retryAfterMs).toISOString(),
        message: "KicksDB rate limited the preview. The remaining rows are queued and will resume automatically.",
      });
      if (options?.onProgress) {
        await options.onProgress(report);
      }
      await sleep(retryAfterMs);
    }

    const liveLookup =
      lookupResult.status === "ok" ? lookupResult.lookup : null;
    context.live_lookup_by_sku.set(normalizedSku, liveLookup);

    report = rebuildPreviewReportFromContext(context, {
      live_lookup_completed: context.live_lookup_by_sku.size,
      processing_status:
        context.live_lookup_by_sku.size >= context.unique_lookup_skus.length
          ? "complete"
          : "running",
      waiting_until: null,
      message:
        context.live_lookup_by_sku.size >= context.unique_lookup_skus.length
          ? "Preview ready. Review the populated rows before committing."
          : "Preview running. Additional KicksDB rows are still loading.",
      lookup_error_by_sku:
        lookupResult.status === "not_found"
          ? new Map([[normalizedSku, "KicksDB did not return a product for this SKU."]])
          : lookupResult.status === "error"
          ? new Map([[normalizedSku, lookupResult.message]])
          : undefined,
    });

    if (options?.onProgress) {
      await options.onProgress(report);
    }
  }

  return finalizePreviewReport({
    ...report,
    processing_status: "complete",
    waiting_until: null,
    live_lookup_completed: context.unique_lookup_skus.length,
    message:
      report.preview_rows.length === 0
        ? "No importable rows were found in this spreadsheet."
        : "Preview ready. Review the populated rows before committing.",
  });
}

export async function commitAdminInventoryIngest(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string,
  options: CommitOptions
): Promise<AdminInventoryCommitReport> {
  const preview =
    options.preview_report && options.preview_report.seller_id === sellerId
      ? options.preview_report
      : await previewAdminInventoryIngest(supabase, sellerId, csvText, options);
  const manualPriceByKey = options.manual_price_by_key || {};
  const reviewDecisionByKey = options.review_decision_by_key || {};

  const rowsBySku = new Map<string, AdminInventoryPreviewRow[]>();

  for (const row of preview.preview_rows) {
    const skuKey = row.normalized_sku || `__blocked__${row.key}`;
    const bucket = rowsBySku.get(skuKey) || [];
    bucket.push(row);
    rowsBySku.set(skuKey, bucket);
  }

  let committedSkus = 0;
  let createdSkus = 0;
  let updatedSkus = 0;
  let skippedSkus = 0;
  let deactivatedVariants = 0;
  const rowErrors: Array<{ key: string; message: string }> = [];
  const fullyCommittedSkuSet = new Set<string>();

  const existingListings = await loadExistingSellerListings(supabase, preview.seller_id);
  const existingListingBySku = new Map(existingListings.map((listing) => [listing.normalized_sku, listing]));

  for (const [skuKey, rows] of Array.from(rowsBySku.entries())) {
    if (!skuKey || skuKey.startsWith("__blocked__")) {
      skippedSkus += 1;
      for (const row of rows) {
        rowErrors.push({
          key: row.key,
          message: row.action_reason || "This row could not be matched to a valid SKU.",
        });
      }
      continue;
    }

    const normalizedRows: Array<
      AdminInventoryPreviewRow & {
        effective_price: number | null;
        review_decision: "approve" | "reject" | null;
        skip_reason: string | null;
      }
    > = rows.map((row) => {
      const manualPrice = parsePositiveNumber(manualPriceByKey[row.key]);
      const effectivePrice = row.final_price ?? manualPrice;
      const reviewDecision = normalizeReviewDecision(reviewDecisionByKey[row.key]);
      return {
        ...row,
        effective_price: effectivePrice,
        review_decision: reviewDecision,
        skip_reason: getPreviewRowSkipReason(row, effectivePrice, reviewDecision),
      };
    });

    const committableRows = normalizedRows.filter((row) => !row.skip_reason);
    const skippedRows = normalizedRows.filter((row) => row.skip_reason);

    if (committableRows.length === 0) {
      skippedSkus += 1;
      for (const row of normalizedRows) {
        rowErrors.push({
          key: row.key,
          message: row.skip_reason || "This SKU is not ready to import.",
        });
      }
      continue;
    }

    const primaryRow = committableRows[0];
    const resolvedSku =
      primaryRow.matched_sku || primaryRow.source_sku || primaryRow.normalized_sku!;
    const sneakerLookup = await resolveSneakerBySku(supabase, resolvedSku, {
      upsertClient: supabase,
    });
    const catalogProduct = await resolveCatalogProductBySku(supabase, resolvedSku);
    const existingListing = existingListingBySku.get(primaryRow.normalized_sku!);
    const shouldPreserveExistingVariants =
      Boolean(existingListing) && committableRows.length < normalizedRows.length;
    const variants = shouldPreserveExistingVariants
      ? mergeExistingListingVariantsWithPreview(existingListing!, committableRows)
      : buildInventoryVariantsFromPreviewRows(committableRows);

    const listingCondition = inferListingConditionFromPreviewRows(
      shouldPreserveExistingVariants ? variants : committableRows
    );

    const boxCondition = shouldPreserveExistingVariants
      ? committableRows.reduce(
          (current, row) => pickWorseBoxCondition(current, row.box_condition),
          existingListing?.box_condition || ("perfect" as "perfect" | "good" | "damaged" | "no_box")
        )
      : committableRows.reduce(
          (current, row) => pickWorseBoxCondition(current, row.box_condition),
          "perfect" as "perfect" | "good" | "damaged" | "no_box"
        );

    const resolvedTitle = primaryRow.matched_product || primaryRow.source_name || `SKU ${primaryRow.normalized_sku}`;
    const parsedName = splitBrandAndModelFromName(resolvedTitle);

    try {
      if (existingListing) {
        await replaceSellerSkuListingInventory(supabase, {
          seller_id: preview.seller_id,
          listing_id: existingListing.listing_id,
          sku: sneakerLookup?.sneaker.sku || catalogProduct?.sku || primaryRow.source_sku || primaryRow.normalized_sku!,
          product: {
            sneaker_id: sneakerLookup?.sneaker.id || null,
            catalog_product_id: catalogProduct?.id || null,
            brand:
              sneakerLookup?.sneaker.brand ||
              catalogProduct?.brand ||
              parsedName.brand ||
              existingListing.brand,
            model:
              sneakerLookup?.sneaker.model ||
              catalogProduct?.model ||
              parsedName.model ||
              existingListing.model,
            nickname:
              sneakerLookup?.sneaker.nickname ||
              catalogProduct?.nickname ||
              existingListing.nickname ||
              null,
            description:
              sneakerLookup?.sneaker.description ||
              catalogProduct?.description ||
              existingListing.description ||
              resolvedTitle,
            images: buildListingImages({
              sneakerGalleryImages: sneakerLookup?.sneaker.gallery_images || [],
              sneakerImageUrl: sneakerLookup?.sneaker.image_url || null,
              catalogImages: catalogProduct?.images || [],
              existingImages: existingListing.images,
            }),
            condition: listingCondition,
            box_condition: boxCondition,
            approx_sizing: existingListing.approx_sizing || "normal",
            status: "active",
          },
          variants,
          used_items: [],
        });
        updatedSkus += 1;
      } else {
        await upsertSellerSkuInventory(supabase, {
          seller_id: preview.seller_id,
          sku: sneakerLookup?.sneaker.sku || catalogProduct?.sku || primaryRow.source_sku || primaryRow.normalized_sku!,
          product: {
            sneaker_id: sneakerLookup?.sneaker.id || null,
            catalog_product_id: catalogProduct?.id || null,
            brand:
              sneakerLookup?.sneaker.brand ||
              catalogProduct?.brand ||
              parsedName.brand ||
              "Catalog Sneaker",
            model:
              sneakerLookup?.sneaker.model ||
              catalogProduct?.model ||
              parsedName.model ||
              resolvedTitle,
            nickname: sneakerLookup?.sneaker.nickname || catalogProduct?.nickname || null,
            description:
              sneakerLookup?.sneaker.description ||
              catalogProduct?.description ||
              resolvedTitle,
            images: buildListingImages({
              sneakerGalleryImages: sneakerLookup?.sneaker.gallery_images || [],
              sneakerImageUrl: sneakerLookup?.sneaker.image_url || null,
              catalogImages: catalogProduct?.images || [],
              existingImages: [],
            }),
            condition: listingCondition,
            box_condition: boxCondition,
            approx_sizing: "normal",
            status: "active",
          },
          variants,
          used_items: [],
        });
        createdSkus += 1;
      }

      committedSkus += 1;
      if (!shouldPreserveExistingVariants && primaryRow.normalized_sku) {
        fullyCommittedSkuSet.add(primaryRow.normalized_sku);
      }
      for (const row of skippedRows) {
        rowErrors.push({
          key: row.key,
          message: row.skip_reason || "This row was not committed.",
        });
      }
    } catch (error) {
      skippedSkus += 1;
      const message =
        error instanceof InventoryUpsertError
          ? error.message
          : "A server error prevented this SKU from being imported.";

      for (const row of rows) {
        rowErrors.push({
          key: row.key,
          message,
        });
      }
    }
  }

  if (options.reconcile_missing) {
    const uploadedSkuSet = new Set(
      preview.preview_rows
        .map((row) => row.normalized_sku)
        .filter((value): value is string => Boolean(value))
    );
    const committedSkuSet = new Set(
      preview.preview_rows
        .filter(
          (row: AdminInventoryPreviewRow) =>
            uploadedSkuSet.has(row.normalized_sku || "") &&
            !rowErrors.some((error) => error.key === row.key)
        )
        .map((row: AdminInventoryPreviewRow) => row.normalized_sku)
        .filter((value): value is string => Boolean(value))
    );

    const reconcileListingIds = existingListings
      .filter((listing) => !uploadedSkuSet.has(listing.normalized_sku))
      .map((listing) => listing.listing_id);

    for (const listingId of reconcileListingIds) {
      const variantCount = await deactivateEntireListingInventory(supabase, listingId);
      deactivatedVariants += variantCount;
    }

    for (const missingVariant of preview.missing_variants) {
      if (
        missingVariant.resolution === "replaced_by_uploaded_sku" &&
        fullyCommittedSkuSet.has(missingVariant.normalized_sku)
      ) {
        deactivatedVariants += 1;
      }
    }
  }

  return {
    seller_id: preview.seller_id,
    pricing_mode: options.pricing_mode,
    committed_skus: committedSkus,
    created_skus: createdSkus,
    updated_skus: updatedSkus,
    skipped_skus: skippedSkus,
    deactivated_variants: deactivatedVariants,
    row_errors: rowErrors,
    message:
      rowErrors.length > 0
        ? "Inventory ingest completed with skips. Review the row errors before running the next sheet."
        : "Inventory ingest completed successfully.",
  };
}

function normalizeReviewDecision(
  value: string | null | undefined
): "approve" | "reject" | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "approve" || normalized === "reject") {
    return normalized;
  }

  return null;
}

function getPreviewRowSkipReason(
  row: AdminInventoryPreviewRow,
  effectivePrice: number | null,
  reviewDecision: "approve" | "reject" | null
): string | null {
  if (!row.normalized_sku) {
    return row.action_reason || "This row could not be matched to a valid SKU.";
  }

  if (row.quantity <= 0) {
    return "Quantity must be greater than 0 before this row can be committed.";
  }

  if (row.live_lookup_status === "pending") {
    return "This row is still waiting for live KicksDB data.";
  }

  if (row.live_lookup_status === "failed" && row.match_confidence === "unmatched") {
    return row.live_lookup_message || row.action_reason || "KicksDB did not return a match for this row.";
  }

  if (row.requires_review_approval) {
    if (reviewDecision === "reject") {
      return "This fallback match was rejected during review.";
    }
    if (reviewDecision !== "approve") {
      return "Approve or reject this fallback match before committing it.";
    }
  }

  if (row.match_confidence === "low" || row.match_confidence === "unmatched") {
    return row.action_reason || "This row is not matched confidently enough to auto-commit.";
  }

  if (effectivePrice === null) {
    return "This row still needs a price before it can be committed.";
  }

  if (row.action === "blocked") {
    return row.action_reason || "This row is blocked.";
  }

  return null;
}

function buildInventoryVariantsFromPreviewRows(
  rows: Array<AdminInventoryPreviewRow & { effective_price: number | null }>
) {
  return rows.map((row) => ({
    size: row.size,
    quantity: row.quantity,
    price: row.effective_price!,
    condition: row.condition,
    is_active: row.condition === "used" ? false : row.quantity > 0,
    needs_condition_photo: row.condition === "used",
  }));
}

function mergeExistingListingVariantsWithPreview(
  existingListing: ExistingSellerListing,
  rows: Array<AdminInventoryPreviewRow & { effective_price: number | null }>
) {
  const variantMap = new Map<
    string,
    {
      size: string;
      quantity: number;
      price: number;
      condition: "new" | "used";
      is_active: boolean;
      needs_condition_photo: boolean;
    }
  >();

  for (const variant of existingListing.variants) {
    const key = `${variant.size}::${variant.condition}`;
    variantMap.set(key, {
      size: variant.size,
      quantity: variant.quantity,
      price: variant.price,
      condition: variant.condition,
      is_active: variant.is_active,
      needs_condition_photo: variant.condition === "used",
    });
  }

  for (const row of rows) {
    const key = `${row.size}::${row.condition}`;
    variantMap.set(key, {
      size: row.size,
      quantity: row.quantity,
      price: row.effective_price!,
      condition: row.condition,
      is_active: row.condition === "used" ? false : row.quantity > 0,
      needs_condition_photo: row.condition === "used",
    });
  }

  return Array.from(variantMap.values()).sort((left, right) => {
    const sizeCompare = left.size.localeCompare(right.size, undefined, { numeric: true });
    if (sizeCompare !== 0) {
      return sizeCompare;
    }

    return left.condition.localeCompare(right.condition);
  });
}

function inferListingConditionFromPreviewRows(
  rows: Array<
    | Pick<AdminInventoryPreviewRow, "condition">
    | {
        condition: "new" | "used";
      }
  >
): "new" | "mixed" | "used_good" {
  const hasUsed = rows.some((row) => row.condition === "used");
  const hasNew = rows.some((row) => row.condition === "new");

  if (hasUsed && hasNew) {
    return "mixed";
  }

  if (hasUsed) {
    return "used_good";
  }

  return "new";
}

function buildEmptyPreviewReport(
  sellerId: string,
  pricingMode: AdminInventoryPricingMode,
  message: string
): AdminInventoryPreviewReport {
  return {
    job_id: null,
    seller_id: sellerId,
    pricing_mode: pricingMode,
    processing_status: "complete",
    rows_read: 0,
    source_rows_considered: 0,
    grouped_rows: 0,
    ready_rows: 0,
    review_rows: 0,
    blocked_rows: 0,
    live_lookup_total: 0,
    live_lookup_completed: 0,
    waiting_until: null,
    preview_rows: [],
    missing_variants: [],
    message,
  };
}

function parseAdminInventoryRows(csvText: string): {
  rows_read: number;
  rows_considered: number;
  rows: ParsedSpreadsheetRow[];
} {
  const matrix = parseCsvMatrix(csvText);
  const headerRow = matrix[0] || [];
  const columnIndex = buildColumnIndex(headerRow);
  const rows: ParsedSpreadsheetRow[] = [];
  let rowsConsidered = 0;

  for (let index = 1; index < matrix.length; index += 1) {
    const rowNumber = index + 1;
    const cells = matrix[index] || [];
    const sourceBrand = readColumn(cells, columnIndex.brand);
    const sourceName = readColumn(cells, columnIndex.name);
    const sourceSku = readColumn(cells, columnIndex.sku);
    const sourceCondition = readColumn(cells, columnIndex.condition);
    const sourceSize = readColumn(cells, columnIndex.size);
    const sourceQuantity = readColumn(cells, columnIndex.quantity);
    const sourcePrice = readColumn(cells, columnIndex.price);

    if (
      !sourceName.trim() &&
      !sourceSku.trim() &&
      !sourceCondition.trim() &&
      !sourceSize.trim() &&
      !sourceQuantity.trim() &&
      !sourcePrice.trim()
    ) {
      continue;
    }

    rowsConsidered += 1;

    const warnings: string[] = [];
    const skuCandidate = extractBestSkuCandidate({
      sourceSku,
      sourceName,
      sourceCondition,
    });

    const size = normalizeSizeValue(sourceSize);
    if (!size) {
      rows.push({
        row_number: rowNumber,
        source_brand: sourceBrand.trim(),
        source_name: sourceName.trim(),
        source_sku: sourceSku.trim(),
        normalized_sku: null,
        size: "",
        quantity: 0,
        condition: "new",
        box_condition: "perfect",
        uploaded_price: parsePositiveNumber(sourcePrice),
        warnings,
        parse_error: "Missing size.",
      });
      continue;
    }

    const quantity = parseIntegerValue(sourceQuantity) ?? 1;
    if (parseIntegerValue(sourceQuantity) === null && sourceQuantity.trim()) {
      warnings.push("Quantity could not be parsed cleanly and defaulted to 1.");
    }

    const conditionInfo = parseConditionDetails(sourceCondition);
    warnings.push(...conditionInfo.warnings);
    warnings.push(...skuCandidate.warnings);

    rows.push({
      row_number: rowNumber,
      source_brand: sourceBrand.trim(),
      source_name: sourceName.trim(),
      source_sku: sourceSku.trim() || skuCandidate.display_sku,
      normalized_sku: skuCandidate.normalized_sku,
      size,
      quantity: quantity > 0 ? quantity : 1,
      condition: conditionInfo.condition,
      box_condition: conditionInfo.box_condition,
      uploaded_price: parsePositiveNumber(sourcePrice),
      warnings,
      parse_error: skuCandidate.normalized_sku ? null : "A usable SKU could not be extracted from this row.",
    });
  }

  return {
    rows_read: matrix.length > 0 ? Math.max(matrix.length - 1, 0) : 0,
    rows_considered: rowsConsidered,
    rows,
  };
}

function groupParsedRows(parsed: {
  rows_read: number;
  rows_considered: number;
  rows: ParsedSpreadsheetRow[];
}): GroupedSpreadsheetRow[] {
  const groups = new Map<string, GroupedSpreadsheetRow>();

  for (const row of parsed.rows) {
    const normalizedSku = row.normalized_sku;
    const groupKey = normalizedSku
      ? `${normalizedSku}::${row.size}::${row.condition}`
      : `row-${row.row_number}`;
    const existing = groups.get(groupKey);

    if (!existing) {
      groups.set(groupKey, {
        key: groupKey,
        normalized_sku: normalizedSku,
        display_sku: row.source_sku || normalizedSku || "",
        source_brand: row.source_brand,
        source_name: row.source_name,
        source_sku: row.source_sku,
        size: row.size,
        quantity: row.quantity,
        condition: row.condition,
        box_condition: row.box_condition,
        uploaded_price: row.uploaded_price,
        row_numbers: [row.row_number],
        warnings: [...row.warnings],
        parse_error: row.parse_error,
      });
      continue;
    }

    existing.quantity += row.quantity;
    existing.row_numbers.push(row.row_number);
    if (!existing.source_brand && row.source_brand) {
      existing.source_brand = row.source_brand;
    }
    existing.box_condition = pickWorseBoxCondition(existing.box_condition, row.box_condition);
    existing.warnings = uniqueStrings([...existing.warnings, ...row.warnings]);
    if (existing.uploaded_price === null && row.uploaded_price !== null) {
      existing.uploaded_price = row.uploaded_price;
    } else if (
      existing.uploaded_price !== null &&
      row.uploaded_price !== null &&
      Math.abs(existing.uploaded_price - row.uploaded_price) > 0.009
    ) {
      existing.parse_error = "Duplicate rows for this SKU and size had conflicting spreadsheet prices.";
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const skuCompare = String(a.normalized_sku || "").localeCompare(String(b.normalized_sku || ""));
    if (skuCompare !== 0) {
      return skuCompare;
    }

    const sizeCompare = a.size.localeCompare(b.size, undefined, { numeric: true });
    if (sizeCompare !== 0) {
      return sizeCompare;
    }

    return a.condition.localeCompare(b.condition);
  });
}

async function resolveGroupedProducts(
  supabase: SupabaseClient,
  groupedRows: GroupedSpreadsheetRow[]
): Promise<{
  catalogBySku: Map<string, ResolvedCatalogLike>;
  sneakerBySku: Map<string, ResolvedSneakerLike>;
}> {
  const uniqueRows = Array.from(
    new Map(
      groupedRows
        .filter((row) => row.normalized_sku)
        .map((row) => [row.normalized_sku as string, row])
    ).values()
  );
  const normalizedSkuKeys = uniqueRows
    .map((row) => row.normalized_sku)
    .filter((value): value is string => Boolean(value));

  const catalogBySku = new Map<string, ResolvedCatalogLike>();
  const sneakerBySku = new Map<string, ResolvedSneakerLike>();

  if (normalizedSkuKeys.length === 0) {
    return {
      catalogBySku,
      sneakerBySku,
    };
  }

  const [catalogResult, sneakerResult] = await Promise.all([
    supabase
      .from("catalog_products")
      .select("id, sku, sku_normalized, brand, model, nickname, description, images")
      .in("sku_normalized", normalizedSkuKeys),
    supabase
      .from("sneakers")
      .select(
        "id, sku, normalized_sku, brand, name, model, nickname, colorway, gender, release_date, retail_price, description, gallery_images, image_url, source"
      )
      .in("normalized_sku", normalizedSkuKeys),
  ]);

  if (catalogResult.error) {
    throw catalogResult.error;
  }

  if (sneakerResult.error) {
    throw sneakerResult.error;
  }

  for (const row of catalogResult.data || []) {
    catalogBySku.set(row.sku_normalized, {
      id: row.id,
      sku: row.sku,
      normalizedSku: row.sku_normalized,
      brand: row.brand,
      model: row.model,
      nickname: row.nickname || null,
      description: row.description || `Catalog placeholder for SKU ${row.sku}.`,
      images: Array.isArray(row.images) ? row.images.filter(Boolean) : [],
      source: "catalog",
    });
  }

  for (const row of sneakerResult.data || []) {
    sneakerBySku.set(row.normalized_sku, {
      source: "local",
      sneaker: {
        id: row.id,
        sku: row.sku,
        normalized_sku: row.normalized_sku,
        brand: row.brand || null,
        name: row.name || null,
        model: row.model || null,
        nickname: row.nickname || null,
        colorway: row.colorway || null,
        gender: row.gender || null,
        release_date: row.release_date || null,
        retail_price: row.retail_price === null ? null : Number(row.retail_price),
        description: typeof row.description === "string" ? row.description : null,
        gallery_images: Array.isArray(row.gallery_images) ? row.gallery_images.filter(Boolean) : [],
        image_url: row.image_url || null,
        source: typeof row.source === "string" ? row.source : "kicksdb",
      },
    });
  }

  return {
    catalogBySku,
    sneakerBySku,
  };
}

async function loadExistingSellerListings(
  supabase: SupabaseClient,
  sellerId: string
): Promise<ExistingSellerListing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, sku, sku_normalized, brand, model, nickname, condition, box_condition, approx_sizing, description, images, listing_variants(id, size, price, quantity, condition, is_active)"
    )
    .eq("seller_id", sellerId)
    .neq("status", "removed");

  if (error) {
    throw error;
  }

  return ((data || []) as Array<Record<string, unknown>>)
    .map((listing) => {
      const normalizedSku = String(listing.sku_normalized || "").trim();
      if (!normalizedSku) {
        return null;
      }

      const variants = Array.isArray(listing.listing_variants)
        ? listing.listing_variants
            .map((variant) => ({
              listing_id: String(listing.id),
              listing_title: buildListingTitle(
                String(listing.brand || ""),
                String(listing.model || ""),
                typeof listing.nickname === "string" ? listing.nickname : null
              ),
              normalized_sku: normalizedSku,
              size: String((variant as Record<string, unknown>).size || "").trim(),
              condition:
                String((variant as Record<string, unknown>).condition || "").trim() === "used"
                  ? "used"
                  : "new",
              price: Number((variant as Record<string, unknown>).price || 0),
              quantity: Number((variant as Record<string, unknown>).quantity || 0),
              is_active: (variant as Record<string, unknown>).is_active !== false,
            }))
            .filter((variant) => variant.size)
        : [];

      return {
        listing_id: String(listing.id),
        normalized_sku: normalizedSku,
        display_sku: String(listing.sku || normalizedSku),
        brand: String(listing.brand || ""),
        model: String(listing.model || ""),
        nickname: typeof listing.nickname === "string" ? listing.nickname : null,
        condition: (String(listing.condition || "new") ||
          "new") as ExistingSellerListing["condition"],
        box_condition: (String(listing.box_condition || "perfect") ||
          "perfect") as ExistingSellerListing["box_condition"],
        approx_sizing: (String(listing.approx_sizing || "normal") ||
          "normal") as ExistingSellerListing["approx_sizing"],
        description: typeof listing.description === "string" ? listing.description : null,
        images: Array.isArray(listing.images)
          ? listing.images.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [],
        variants,
      };
    })
    .filter((listing): listing is ExistingSellerListing => Boolean(listing));
}

function buildExistingVariantMap(
  existingListings: ExistingSellerListing[]
): Map<string, ExistingSellerVariant> {
  const map = new Map<string, ExistingSellerVariant>();

  for (const listing of existingListings) {
    for (const variant of listing.variants) {
      map.set(
        `${variant.normalized_sku}::${variant.size}::${variant.condition}`,
        variant
      );
    }
  }

  return map;
}

function buildPreviewRow(input: {
  row: GroupedSpreadsheetRow;
  existingVariant: ExistingSellerVariant | null;
  catalogProduct: ResolvedCatalogLike;
  sneakerLookup: ResolvedSneakerLike;
  pricingResult: PricingLookupResult | null;
  pricingMode: AdminInventoryPricingMode;
  liveLookup: KicksDbLiveLookup | null;
  liveLookupStatus: "pending" | "complete" | "failed";
  forcePendingLiveLookup?: boolean;
}): AdminInventoryPreviewRow {
  const {
    row,
    existingVariant,
    catalogProduct,
    sneakerLookup,
    pricingResult,
    pricingMode,
    liveLookup,
    liveLookupStatus,
    forcePendingLiveLookup,
  } = input;
  const warnings = [...row.warnings];
  const effectiveSneakerLookup = liveLookup
    ? buildResolvedSneakerFromLiveLookup(liveLookup)
    : sneakerLookup;
  const matchedProduct = buildMatchedProductName(effectiveSneakerLookup, catalogProduct, liveLookup);
  const matchSource: AdminInventoryPreviewRow["match_source"] = liveLookup
    ? liveLookup.match_source
    : sneakerLookup?.sneaker
    ? "sku"
    : catalogProduct
    ? "catalog"
    : "none";
  const requiresReviewApproval = Boolean(
    liveLookup?.requires_review_approval || matchSource === "name_fallback"
  );
  const matchConfidence = determineMatchConfidence({
    sourceName: row.source_name,
    sourceSku: row.source_sku || row.display_sku,
    normalizedSku: row.normalized_sku,
    matchedProduct,
    sneakerLookup: effectiveSneakerLookup,
    catalogProduct,
    warnings,
  });

  let finalPrice = row.uploaded_price;
  let pricingSource: AdminInventoryPreviewRow["pricing_source"] = row.uploaded_price !== null
    ? "spreadsheet"
    : "manual_required";

  if (row.uploaded_price === null && pricingMode !== "manual" && pricingResult) {
    if (pricingResult.status === "priced") {
      finalPrice = pricingResult.final_price;
      pricingSource =
        pricingMode === "aggressive"
          ? "stockx_aggressive"
          : "stockx_balanced";
      if (pricingResult.warning) {
        warnings.push(pricingResult.warning);
      }
    } else {
      warnings.push(pricingResult.message);
    }
  }

  let action: AdminInventoryPreviewAction = "blocked";
  let actionReason: string | null = null;

  if (row.parse_error) {
    action = "blocked";
    actionReason = row.parse_error;
  } else if (forcePendingLiveLookup && liveLookupStatus === "pending") {
    action = "manual_review";
    actionReason = "Waiting for live KicksDB data before this row can be reviewed.";
  } else if (requiresReviewApproval) {
    action = "manual_review";
    actionReason = liveLookup?.review_reason || "This match needs admin approval before it can be committed.";
  } else if (matchConfidence === "low" || matchConfidence === "unmatched") {
    action = "manual_review";
    actionReason = "The product match is not confident enough to auto-commit.";
  } else if (finalPrice === null) {
    action = "manual_review";
    actionReason = "This row still needs a price before it can be committed.";
  } else if (!existingVariant) {
    action = "create";
  } else if (
    Math.abs(existingVariant.price - finalPrice) < 0.009 &&
    existingVariant.quantity === row.quantity &&
    existingVariant.is_active
  ) {
    action = "no_change";
  } else {
    action = "update";
  }

  if (row.condition === "used") {
    warnings.push("Used inventory will be imported inactive until condition photos are added.");
  }

  return {
    key: row.key,
    row_numbers: row.row_numbers,
    source_name: row.source_name,
    source_sku: row.source_sku || row.display_sku,
    normalized_sku: row.normalized_sku,
    size: row.size,
    quantity: row.quantity,
    condition: row.condition,
    box_condition: row.box_condition,
    uploaded_price: row.uploaded_price,
    final_price: finalPrice,
    existing_price: existingVariant?.price ?? null,
    existing_quantity: existingVariant?.quantity ?? null,
    matched_product: matchedProduct,
    matched_sku:
      liveLookup?.sku ||
      effectiveSneakerLookup?.sneaker.sku ||
      catalogProduct?.sku ||
      null,
    matched_brand:
      liveLookup?.brand ||
      effectiveSneakerLookup?.sneaker.brand ||
      catalogProduct?.brand ||
      null,
    matched_model:
      liveLookup?.model ||
      effectiveSneakerLookup?.sneaker.model ||
      catalogProduct?.model ||
      null,
    matched_nickname:
      liveLookup?.nickname ||
      effectiveSneakerLookup?.sneaker.nickname ||
      catalogProduct?.nickname ||
      null,
    matched_image_url:
      liveLookup?.image_url ||
      effectiveSneakerLookup?.sneaker.image_url ||
      catalogProduct?.images?.[0] ||
      null,
    match_source: matchSource,
    match_confidence: matchConfidence,
    requires_review_approval: requiresReviewApproval,
    pricing_source: pricingSource,
    action,
    action_reason: actionReason,
    live_lookup_status: liveLookupStatus,
    live_lookup_message:
      liveLookupStatus === "pending"
        ? "Waiting for live KicksDB lookup."
        : liveLookupStatus === "failed"
        ? "Live KicksDB lookup failed for this SKU."
        : null,
    warnings: uniqueStrings(warnings),
  };
}

function buildMissingVariantPreview(
  existingListings: ExistingSellerListing[],
  previewRows: AdminInventoryPreviewRow[]
): AdminInventoryMissingVariant[] {
  const previewKeySet = new Set(
    previewRows
      .filter((row) => row.normalized_sku)
      .map((row) => `${row.normalized_sku}::${row.size}::${row.condition}`)
  );
  const uploadedSkuSet = new Set(
    previewRows
      .map((row) => row.normalized_sku)
      .filter((value): value is string => Boolean(value))
  );

  const missingVariants: AdminInventoryMissingVariant[] = [];

  for (const listing of existingListings) {
    for (const variant of listing.variants) {
      if (!variant.is_active || variant.quantity <= 0) {
        continue;
      }

      const key = `${variant.normalized_sku}::${variant.size}::${variant.condition}`;
      if (previewKeySet.has(key)) {
        continue;
      }

      missingVariants.push({
        key,
        normalized_sku: variant.normalized_sku,
        listing_id: listing.listing_id,
        listing_title: variant.listing_title,
        size: variant.size,
        condition: variant.condition,
        quantity: variant.quantity,
        price: variant.price,
        resolution: uploadedSkuSet.has(variant.normalized_sku)
          ? "replaced_by_uploaded_sku"
          : "reconcile_missing_if_enabled",
      });
    }
  }

  return missingVariants.sort((a, b) => a.normalized_sku.localeCompare(b.normalized_sku));
}

function rebuildPreviewReportFromContext(
  context: AdminInventoryPreviewContext,
  options?: {
    live_lookup_completed?: number;
    processing_status?: AdminInventoryPreviewReport["processing_status"];
    waiting_until?: string | null;
    message?: string;
    lookup_error_by_sku?: Map<string, string>;
  }
): AdminInventoryPreviewReport {
  const previewRows = context.grouped_rows.map((row) => {
    const normalizedSku = row.normalized_sku || "";
    const liveLookup = normalizedSku
      ? context.live_lookup_by_sku.get(normalizedSku) || null
      : null;
    const errorMessage = options?.lookup_error_by_sku?.get(normalizedSku) || null;

    const builtRow = buildPreviewRow({
      row,
      existingVariant: context.existing_variant_map.get(row.key) || null,
      catalogProduct: context.catalog_by_sku.get(normalizedSku) || null,
      sneakerLookup: context.sneaker_by_sku.get(normalizedSku) || null,
      pricingResult:
        row.uploaded_price !== null
          ? null
          : derivePricingResultFromLiveLookup(liveLookup, row.size, context.pricing_mode),
      pricingMode: context.pricing_mode,
      liveLookup,
      liveLookupStatus:
        !normalizedSku
          ? "failed"
          : liveLookup
          ? "complete"
          : context.live_lookup_by_sku.has(normalizedSku)
          ? "failed"
          : "pending",
      forcePendingLiveLookup: Boolean(normalizedSku),
    });

    if (errorMessage) {
      return {
        ...builtRow,
        live_lookup_status: "failed" as const,
        live_lookup_message: errorMessage,
        warnings: uniqueStrings([...builtRow.warnings, errorMessage]),
      };
    }

    return builtRow;
  });

  return finalizePreviewReport({
    job_id: context.initial_report.job_id || null,
    seller_id: context.seller_id,
    pricing_mode: context.pricing_mode,
    processing_status: options?.processing_status || "running",
    rows_read: context.initial_report.rows_read,
    source_rows_considered: context.initial_report.source_rows_considered,
    grouped_rows: previewRows.length,
    preview_rows: previewRows,
    missing_variants: buildMissingVariantPreview(context.existing_listings, previewRows),
    live_lookup_total: context.unique_lookup_skus.length,
    live_lookup_completed: options?.live_lookup_completed ?? context.live_lookup_by_sku.size,
    waiting_until: options?.waiting_until ?? null,
    message: options?.message || context.initial_report.message,
  });
}

function finalizePreviewReport(
  report: Omit<AdminInventoryPreviewReport, "ready_rows" | "review_rows" | "blocked_rows">
): AdminInventoryPreviewReport {
  const readyRows = report.preview_rows.filter(
    (row) => row.action === "create" || row.action === "update" || row.action === "no_change"
  ).length;
  const reviewRows = report.preview_rows.filter((row) => row.action === "manual_review").length;
  const blockedRows = report.preview_rows.filter((row) => row.action === "blocked").length;

  return {
    ...report,
    ready_rows: readyRows,
    review_rows: reviewRows,
    blocked_rows: blockedRows,
  };
}

function derivePricingResultFromLiveLookup(
  liveLookup: KicksDbLiveLookup | null,
  size: string,
  pricingMode: AdminInventoryPricingMode
): PricingLookupResult | null {
  if (!liveLookup || pricingMode === "manual") {
    return null;
  }

  const matchedVariant = matchVariantBySize(liveLookup.variants, size);
  if (!matchedVariant) {
    return {
      status: "manual_review",
      message: `No StockX size match was found for size ${size}.`,
    };
  }

  const lowestAsk = Number(matchedVariant.lowest_ask);
  if (!Number.isFinite(lowestAsk) || lowestAsk <= 0) {
    return {
      status: "manual_review",
      message: "StockX market pricing for this size is unavailable.",
    };
  }

  const finalPrice = pricingMode === "aggressive" ? Math.max(lowestAsk - 1, 1) : lowestAsk;
  return {
    status: "priced",
    final_price: Number(finalPrice.toFixed(2)),
    warning:
      pricingMode === "aggressive"
        ? "Price was set to lowest ask minus $1.00."
        : "Price was set to the current lowest ask.",
  };
}

async function fetchKicksDbLiveLookupForRow(
  row: GroupedSpreadsheetRow
): Promise<
  | { status: "ok"; lookup: KicksDbLiveLookup }
  | { status: "not_found" }
  | { status: "rate_limited"; retry_after_ms: number; message: string }
  | { status: "error"; message: string }
> {
  const apiKey = process.env.KICKSDB_API_KEY;
  const apiBaseUrl = process.env.KICKSDB_API_BASE_URL;
  const normalizedSku = row.normalized_sku || "";

  if (!apiKey || !apiBaseUrl || !normalizedSku) {
    return {
      status: "error",
      message: "KicksDB is not configured for this environment.",
    };
  }

  const baseUrl = apiBaseUrl.replace(/\/+$/, "");
  const expectedSkuCandidates = buildExpectedSkuCandidates(row);
  const searchTerms = buildKicksDbSkuSearchTerms(row, expectedSkuCandidates);

  for (const searchTerm of searchTerms) {
    const result = await lookupKicksDbLiveRecord(
      baseUrl,
      apiKey,
      searchTerm,
      expectedSkuCandidates
    );
    if (result.status === "ok") {
      return {
        status: "ok",
        lookup: mapRecordToKicksDbLiveLookup(result.record, normalizedSku, {
          match_source: "sku",
          requires_review_approval: false,
          review_reason: null,
        }),
      };
    }
    if (result.status === "rate_limited") {
      return result;
    }
    if (result.status === "error") {
      return result;
    }
  }

  const fallbackQuery = buildNameFallbackQuery(row);
  if (!fallbackQuery) {
    return { status: "not_found" };
  }

  await sleep(1000);
  const fallbackResult = await lookupKicksDbLiveRecordByName(
    baseUrl,
    apiKey,
    fallbackQuery,
    row
  );

  if (fallbackResult.status === "ok") {
    return {
      status: "ok",
      lookup: mapRecordToKicksDbLiveLookup(fallbackResult.record, normalizedSku, {
        match_source: "name_fallback",
        requires_review_approval: true,
        review_reason:
          "Matched by name fallback after SKU lookup failed. Review the product details and approve or reject this row.",
      }),
    };
  }

  if (fallbackResult.status === "rate_limited") {
    return fallbackResult;
  }

  if (fallbackResult.status === "error") {
    return fallbackResult;
  }

  return { status: "not_found" };
}

async function lookupKicksDbLiveRecord(
  baseUrl: string,
  apiKey: string,
  query: string,
  expectedSkuCandidates: string[]
): Promise<
  | { status: "ok"; record: Record<string, unknown> }
  | { status: "not_found" }
  | { status: "rate_limited"; retry_after_ms: number; message: string }
  | { status: "error"; message: string }
> {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    return {
      status: "error",
      message:
        error instanceof Error && error.name === "AbortError"
          ? "The KicksDB lookup timed out."
          : "The KicksDB lookup failed.",
    };
  }
  clearTimeout(timeout);

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = Number.parseInt(retryAfterHeader || "", 10);
    const retryAfterMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 60 * 1000;

    return {
      status: "rate_limited",
      retry_after_ms: retryAfterMs,
      message: "KicksDB rate limited the preview queue.",
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      message: `KicksDB returned ${response.status} for this SKU.`,
    };
  }

  const payload: unknown = await response.json();
  const records = extractStockxPricingRecords(payload);
  const bestRecord = pickBestPricingRecordForCandidates(records, expectedSkuCandidates);

  if (!bestRecord) {
    return { status: "not_found" };
  }

  return {
    status: "ok",
    record: bestRecord,
  };
}

function buildExpectedSkuCandidates(row: GroupedSpreadsheetRow): string[] {
  return uniqueStrings(
    [
      row.normalized_sku,
      normalizeSku(row.source_sku),
      normalizeSku(extractStyleCodeCandidate(row.source_sku)),
      normalizeSku(normalizeNumericStyleCode(row.source_sku)),
      normalizeSku(row.display_sku),
    ].filter((value): value is string => Boolean(value))
  );
}

function buildKicksDbSkuSearchTerms(
  row: GroupedSpreadsheetRow,
  expectedSkuCandidates: string[]
): string[] {
  return uniqueStrings(
    [
      row.source_sku,
      row.display_sku,
      ...expectedSkuCandidates,
      ...expectedSkuCandidates.map((candidate) => collapseSku(candidate)),
    ]
      .map((value) => String(value || "").trim())
      .filter((value) => value.length >= 4)
  );
}

async function lookupKicksDbLiveRecordByName(
  baseUrl: string,
  apiKey: string,
  query: string,
  row: GroupedSpreadsheetRow
): Promise<
  | { status: "ok"; record: Record<string, unknown> }
  | { status: "not_found" }
  | { status: "rate_limited"; retry_after_ms: number; message: string }
  | { status: "error"; message: string }
> {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    return {
      status: "error",
      message:
        error instanceof Error && error.name === "AbortError"
          ? "The fallback KicksDB lookup timed out."
          : "The fallback KicksDB lookup failed.",
    };
  }
  clearTimeout(timeout);

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = Number.parseInt(retryAfterHeader || "", 10);
    const retryAfterMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 60 * 1000;

    return {
      status: "rate_limited",
      retry_after_ms: retryAfterMs,
      message: "KicksDB rate limited the fallback preview queue.",
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      message: `KicksDB returned ${response.status} for the fallback name search.`,
    };
  }

  const payload: unknown = await response.json();
  const records = extractStockxPricingRecords(payload);
  const bestRecord = pickBestNameFallbackRecord(records, row);

  if (!bestRecord) {
    return { status: "not_found" };
  }

  return {
    status: "ok",
    record: bestRecord,
  };
}

function mapRecordToKicksDbLiveLookup(
  record: Record<string, unknown>,
  normalizedSku: string,
  options: {
    match_source: "sku" | "name_fallback";
    requires_review_approval: boolean;
    review_reason: string | null;
  }
): KicksDbLiveLookup {
  const rawSku =
    readStringFromRecord(record, ["sku", "styleCode", "style_code"]) || normalizedSku;
  const normalizedRecordSku = normalizeSku(rawSku) || normalizedSku;
  const brand = readStringFromRecord(record, ["brand", "brand_name"]) || null;
  const model =
    readStringFromRecord(record, ["model", "primary_title", "silhouette"]) || null;
  const nickname =
    readStringFromRecord(record, ["nickname", "secondary_title"]) || null;
  const colorway = readStringFromRecord(record, ["colorway", "color"]) || null;
  const gender = readStringFromRecord(record, ["gender"]) || null;
  const releaseDate =
    readStringFromRecord(record, ["release_date", "releaseDate"]) || null;
  const retailPrice =
    readNumberFromRecord(record, ["retail_price", "retailPrice"]) || null;
  const description = readStringFromRecord(record, ["description"]) || null;
  const galleryImages = readStringArrayFromUnknown(record.gallery).slice(0, 6);
  const imageUrl =
    galleryImages[0] ||
    readStringFromRecord(record, ["image_url", "image", "imageUrl", "thumbnail"]) ||
    readFirstStringFromArray(record.images) ||
    null;
  const name =
    readStringFromRecord(record, ["name", "title", "product_name"]) ||
    [brand, model, nickname].filter(Boolean).join(" ").trim() ||
    null;

  const variants = Array.isArray(record.variants)
    ? record.variants
        .map((variant) => normalizePricingVariant(variant))
        .filter((variant): variant is StockxPricingVariant => Boolean(variant))
    : [];

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
    variants,
    match_source: options.match_source,
    requires_review_approval: options.requires_review_approval,
    review_reason: options.review_reason,
  };
}

function buildNameFallbackQuery(row: GroupedSpreadsheetRow): string | null {
  const cleanedName = sanitizeProductNameForLookup(row.source_name);
  const parts = uniqueStrings([row.source_brand, cleanedName]);
  return parts.length > 0 ? parts.join(" ") : null;
}

function sanitizeProductNameForLookup(value: string): string {
  return String(value || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[A-Z]{1,5}\d{2,}[A-Z0-9]*(?:[- ]\d{2,}[A-Z0-9]*)?/g, " ")
    .replace(/\b(?:DS|GS|PS|TD|WMNS|WOMENS|MENS|NEW|USED|NO BOX|DAMAGED BOX)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestNameFallbackRecord(
  records: Array<Record<string, unknown>>,
  row: GroupedSpreadsheetRow
): Record<string, unknown> | null {
  const scored = records
    .map((record) => ({
      record,
      score: scoreNameFallbackRecord(record, row),
    }))
    .filter((entry) => entry.score >= 45)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.record || null;
}

function scoreNameFallbackRecord(
  record: Record<string, unknown>,
  row: GroupedSpreadsheetRow
): number {
  const recordSku = readStringFromRecord(record, ["sku", "styleCode", "style_code"]);
  const recordBrand = readStringFromRecord(record, ["brand", "brand_name"]);
  const recordModel =
    readStringFromRecord(record, ["model", "primary_title", "silhouette"]);
  const recordNickname =
    readStringFromRecord(record, ["nickname", "secondary_title"]);
  const recordName =
    readStringFromRecord(record, ["name", "title", "product_name"]) ||
    [recordBrand, recordModel, recordNickname].filter(Boolean).join(" ").trim();

  const nameSimilarity = compareNameSimilarity(row.source_name, recordName);
  const brandSimilarity = compareBrandSimilarity(row.source_brand, row.source_name, recordBrand);
  const skuSimilarity = compareBestSkuSimilarity(buildExpectedSkuCandidates(row), recordSku);

  let score = nameSimilarity * 70 + brandSimilarity * 15 + skuSimilarity * 15;
  if (row.normalized_sku && normalizeSku(recordSku) === row.normalized_sku) {
    score += 20;
  }

  return score;
}

function compareBrandSimilarity(
  sourceBrand: string,
  sourceName: string,
  recordBrand: string
): number {
  const normalizedRecordBrand = normalizeBrandValue(recordBrand);
  if (!normalizedRecordBrand) {
    return 0;
  }

  const normalizedSourceBrand = normalizeBrandValue(sourceBrand);
  if (normalizedSourceBrand && normalizedSourceBrand === normalizedRecordBrand) {
    return 1;
  }

  const normalizedSourceName = normalizeBrandValue(sourceName);
  if (normalizedSourceName.startsWith(normalizedRecordBrand)) {
    return 0.7;
  }

  return 0;
}

function normalizeBrandValue(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function compareBestSkuSimilarity(candidates: string[], recordSku: string): number {
  const normalizedRecordSku = collapseSku(recordSku);
  if (!normalizedRecordSku) {
    return 0;
  }

  let bestScore = 0;
  for (const candidate of candidates) {
    const collapsedCandidate = collapseSku(candidate);
    if (!collapsedCandidate) {
      continue;
    }

    if (collapsedCandidate === normalizedRecordSku) {
      return 1;
    }

    bestScore = Math.max(
      bestScore,
      computeStringSimilarity(collapsedCandidate, normalizedRecordSku)
    );
  }

  return bestScore;
}

function computeStringSimilarity(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 1;
  }

  const distance = computeLevenshteinDistance(left, right);
  return Math.max(0, 1 - distance / maxLength);
}

function computeLevenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    matrix[rowIndex][0] = rowIndex;
  }

  for (let colIndex = 0; colIndex < cols; colIndex += 1) {
    matrix[0][colIndex] = colIndex;
  }

  for (let rowIndex = 1; rowIndex < rows; rowIndex += 1) {
    for (let colIndex = 1; colIndex < cols; colIndex += 1) {
      const substitutionCost = left[rowIndex - 1] === right[colIndex - 1] ? 0 : 1;
      matrix[rowIndex][colIndex] = Math.min(
        matrix[rowIndex - 1][colIndex] + 1,
        matrix[rowIndex][colIndex - 1] + 1,
        matrix[rowIndex - 1][colIndex - 1] + substitutionCost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

async function priceGroupedRowsWithKicksDb(
  groupedRows: GroupedSpreadsheetRow[],
  pricingMode: Exclude<AdminInventoryPricingMode, "manual">
): Promise<Map<string, PricingLookupResult>> {
  const results = new Map<string, PricingLookupResult>();
  const uniqueSkus = Array.from(
    new Set(
      groupedRows
        .filter((row) => !row.parse_error && row.uploaded_price === null && row.normalized_sku)
        .map((row) => row.normalized_sku)
        .filter((value): value is string => Boolean(value))
    )
  );

  const productBySku = new Map<string, StockxPricingProduct | null>();
  await runWithConcurrency(
    uniqueSkus,
    PREVIEW_PRICING_LOOKUP_CONCURRENCY,
    async (normalizedSku) => {
      const product = await withTimeout(
        fetchStockxPricingProductBySku(normalizedSku),
        PREVIEW_PRICING_LOOKUP_TIMEOUT_MS,
        null
      );
      productBySku.set(normalizedSku, product);
    }
  );

  for (const row of groupedRows) {
    if (row.parse_error || row.uploaded_price !== null || !row.normalized_sku) {
      continue;
    }

    const product = productBySku.get(row.normalized_sku) || null;
    if (!product) {
      results.set(row.key, {
        status: "manual_review",
        message: "No StockX market data was found for this SKU.",
      });
      continue;
    }

    const matchedVariant = matchVariantBySize(product.variants, row.size);
    if (!matchedVariant) {
      results.set(row.key, {
        status: "manual_review",
        message: `No StockX size match was found for size ${row.size}.`,
      });
      continue;
    }

    const lowestAsk = Number(matchedVariant.lowest_ask);
    if (!Number.isFinite(lowestAsk) || lowestAsk <= 0) {
      results.set(row.key, {
        status: "manual_review",
        message: "StockX market pricing for this size is unavailable.",
      });
      continue;
    }

    const finalPrice = pricingMode === "aggressive" ? Math.max(lowestAsk - 1, 1) : lowestAsk;
    results.set(row.key, {
      status: "priced",
      final_price: Number(finalPrice.toFixed(2)),
      warning:
        pricingMode === "aggressive"
          ? "Price was set to lowest ask minus $1.00."
          : "Price was set to the current lowest ask.",
    });
  }

  return results;
}

function matchVariantBySize(
  variants: StockxPricingVariant[],
  targetSize: string
): StockxPricingVariant | null {
  const normalizedTarget = normalizeComparableSize(targetSize);

  for (const variant of variants) {
    const directSize = normalizeComparableSize(variant.size || "");
    if (directSize === normalizedTarget) {
      return variant;
    }

    if (
      Array.isArray(variant.sizes) &&
      variant.sizes.some(
        (sizeRecord: StockxPricingVariantSize) =>
          normalizeComparableSize(sizeRecord.size) === normalizedTarget
      )
    ) {
      return variant;
    }
  }

  return null;
}

function normalizeComparableSize(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringFromRecord(
  record: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function readNumberFromRecord(
  record: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readStringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function readFirstStringFromArray(value: unknown): string | null {
  return readStringArrayFromUnknown(value)[0] || null;
}

function collapseSku(value: string | null | undefined): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStockxPricingProductBySku(
  normalizedSku: string
): Promise<StockxPricingProduct | null> {
  const apiKey = process.env.KICKSDB_API_KEY;
  const apiBaseUrl = process.env.KICKSDB_API_BASE_URL;

  if (!apiKey || !apiBaseUrl || !normalizedSku) {
    return null;
  }

  const baseUrl = apiBaseUrl.replace(/\/+$/, "");
  const searchTerms = Array.from(
    new Set([normalizedSku, collapseSku(normalizedSku)].filter(Boolean))
  );

  for (const searchTerm of searchTerms) {
    const record = await withTimeout(
      lookupPricingStockxProduct(baseUrl, apiKey, searchTerm, normalizedSku),
      PREVIEW_PRICING_LOOKUP_TIMEOUT_MS,
      null
    );
    if (record) {
      return record;
    }
  }

  return null;
}

async function lookupPricingStockxProduct(
  baseUrl: string,
  apiKey: string,
  query: string,
  normalizedSku: string
): Promise<StockxPricingProduct | null> {
  const url = new URL(`${baseUrl}/v3/stockx/products`);
  url.search = new URLSearchParams({
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

  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), PREVIEW_PRICING_LOOKUP_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(abortTimeout);
    return null;
  }
  clearTimeout(abortTimeout);

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  const records = extractStockxPricingRecords(payload);
  const bestRecord = pickBestPricingRecord(records, normalizedSku);
  if (!bestRecord) {
    return null;
  }

  const variants = Array.isArray(bestRecord.variants)
    ? bestRecord.variants
        .map((variant) => normalizePricingVariant(variant))
        .filter((variant): variant is StockxPricingVariant => Boolean(variant))
    : [];

  return { variants };
}

function extractStockxPricingRecords(
  payload: unknown
): Array<Record<string, unknown>> {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return [];
  }

  return payload.data.filter(isRecord);
}

function pickBestPricingRecord(
  records: Array<Record<string, unknown>>,
  normalizedSku: string
): Record<string, unknown> | null {
  const collapsedTarget = collapseSku(normalizedSku);

  const scored = records
    .map((record) => ({
      record,
      score: scorePricingRecord(record, normalizedSku, collapsedTarget),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.record || null;
}

function pickBestPricingRecordForCandidates(
  records: Array<Record<string, unknown>>,
  skuCandidates: string[]
): Record<string, unknown> | null {
  const normalizedCandidates = uniqueStrings(
    skuCandidates
      .map((candidate) => normalizeSku(candidate))
      .filter((value): value is string => Boolean(value))
  );

  const scored = records
    .map((record) => ({
      record,
      score: normalizedCandidates.reduce((bestScore, candidate) => {
        return Math.max(
          bestScore,
          scorePricingRecord(record, candidate, collapseSku(candidate))
        );
      }, 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.record || null;
}

function scorePricingRecord(
  record: Record<string, unknown>,
  normalizedSku: string,
  collapsedTarget: string
): number {
  const recordSku = readStringFromRecord(record, ["sku", "styleCode", "style_code"]);
  const normalizedRecordSku = normalizeSku(recordSku);
  const collapsedRecordSku = collapseSku(normalizedRecordSku);

  if (normalizedRecordSku === normalizedSku) {
    return 100;
  }

  if (collapsedRecordSku && collapsedRecordSku === collapsedTarget) {
    return 90;
  }

  const identifiers = extractPricingIdentifiers(record).map((value) => collapseSku(value));
  if (identifiers.some((value) => value === collapsedTarget)) {
    return 70;
  }

  return 0;
}

function extractPricingIdentifiers(record: Record<string, unknown>): string[] {
  if (!Array.isArray(record.variants)) {
    return [];
  }

  const values: string[] = [];
  for (const variant of record.variants) {
    if (!isRecord(variant) || !Array.isArray(variant.identifiers)) {
      continue;
    }

    for (const identifier of variant.identifiers) {
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

function normalizePricingVariant(value: unknown): StockxPricingVariant | null {
  if (!isRecord(value)) {
    return null;
  }

  const sizes = Array.isArray(value.sizes)
    ? value.sizes
        .filter(isRecord)
        .map((sizeRecord) => ({
          size: String(sizeRecord.size || "").trim(),
        }))
        .filter((sizeRecord) => sizeRecord.size)
    : [];

  return {
    size: typeof value.size === "string" ? value.size : null,
    lowest_ask: typeof value.lowest_ask === "number" ? value.lowest_ask : null,
    sizes,
  };
}

async function deactivateEntireListingInventory(
  supabase: SupabaseClient,
  listingId: string
): Promise<number> {
  const { data: variants, error: variantLookupError } = await supabase
    .from("listing_variants")
    .select("id")
    .eq("listing_id", listingId)
    .gt("quantity", 0);

  if (variantLookupError) {
    throw variantLookupError;
  }

  const { error: variantError } = await supabase
    .from("listing_variants")
    .update({
      quantity: 0,
      is_active: false,
    })
    .eq("listing_id", listingId);

  if (variantError) {
    throw variantError;
  }

  const { error: usedItemError } = await supabase
    .from("listing_used_items")
    .update({
      is_active: false,
    })
    .eq("listing_id", listingId);

  if (usedItemError) {
    throw usedItemError;
  }

  const { error: listingError } = await supabase
    .from("listings")
    .update({
      status: "inactive",
    })
    .eq("id", listingId);

  if (listingError) {
    throw listingError;
  }

  return Array.isArray(variants) ? variants.length : 0;
}

function buildColumnIndex(headerRow: string[]) {
  const normalizedHeader = headerRow.map(normalizeHeaderName);

  return {
    name: findColumnIndex(normalizedHeader, COLUMN_ALIASES.name),
    sku: findColumnIndex(normalizedHeader, COLUMN_ALIASES.sku),
    size: findColumnIndex(normalizedHeader, COLUMN_ALIASES.size),
    quantity: findColumnIndex(normalizedHeader, COLUMN_ALIASES.quantity),
    condition: findColumnIndex(normalizedHeader, COLUMN_ALIASES.condition),
    price: findColumnIndex(normalizedHeader, COLUMN_ALIASES.price),
    brand: findColumnIndex(normalizedHeader, COLUMN_ALIASES.brand),
  };
}

function readColumn(cells: string[], index: number): string {
  if (index < 0 || index >= cells.length) {
    return "";
  }

  return String(cells[index] || "").replace(/\u00A0/g, " ").trim();
}

function findColumnIndex(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((header) => aliases.has(header));
}

function parseCsvMatrix(csvText: string): string[][] {
  const sanitized = String(csvText || "").replace(/^\uFEFF/, "");
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
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeSizeValue(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function parseIntegerValue(value: string): number | null {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function parsePositiveNumber(value: string | null | undefined): number | null {
  const normalized = String(value || "")
    .trim()
    .replace(/[$,]/g, "");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractBestSkuCandidate(input: {
  sourceSku: string;
  sourceName: string;
  sourceCondition: string;
}): {
  display_sku: string;
  normalized_sku: string | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const rawCandidates: string[] = [];
  const sourceSku = String(input.sourceSku || "").replace(/\u00A0/g, " ").trim().toUpperCase();

  if (sourceSku) {
    rawCandidates.push(...sourceSku.split(/[\/|]/).map((part) => part.trim()).filter(Boolean));
    const normalizedDirect = normalizeBulkImportSku(sourceSku);
    if (normalizedDirect.normalized_sku) {
      if (sourceSku.includes("/") || sourceSku.includes("|")) {
        warnings.push("Multiple SKU fragments were provided; the first usable candidate was selected.");
      }
      if (normalizedDirect.match_warning) {
        warnings.push(normalizedDirect.match_warning);
      }
      return {
        display_sku: normalizedDirect.display_sku,
        normalized_sku: normalizedDirect.normalized_sku,
        warnings,
      };
    }
  }

  const combinedText = [input.sourceSku, input.sourceName, input.sourceCondition]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  const regexCandidates = combinedText.match(/[A-Z]{1,5}\d{2,}[A-Z0-9]*(?:[- ]\d{2,}[A-Z0-9]*)?|\d{6,}(?:\.\d+)?/g) || [];
  rawCandidates.push(...regexCandidates);

  const cleanedCandidates = uniqueStrings(
    rawCandidates
      .map((candidate) =>
        candidate
          .replace(/\(.*?\)/g, " ")
          .replace(/SPECIAL BOX/g, " ")
          .replace(/[^A-Z0-9.\- ]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean)
  );

  for (const candidate of cleanedCandidates) {
    const normalized = normalizeBulkImportSku(candidate);
    if (normalized.normalized_sku) {
      if (candidate !== sourceSku && sourceSku) {
        warnings.push(`SKU was inferred from surrounding text as ${normalized.display_sku}.`);
      }
      return {
        display_sku: normalized.display_sku,
        normalized_sku: normalized.normalized_sku,
        warnings,
      };
    }

    const sanitizedNumeric = normalizeNumericStyleCode(candidate);
    if (sanitizedNumeric) {
      return {
        display_sku: sanitizedNumeric,
        normalized_sku: normalizeSku(sanitizedNumeric),
        warnings: [...warnings, `SKU was inferred from surrounding text as ${sanitizedNumeric}.`],
      };
    }
  }

  return {
    display_sku: sourceSku,
    normalized_sku: null,
    warnings,
  };
}

function normalizeNumericStyleCode(candidate: string): string | null {
  const normalized = String(candidate || "")
    .trim()
    .replace(/\.00$/, "")
    .replace(/^[A-Z]{2,}\s+/g, "")
    .replace(/\s+/g, "");

  if (!/^\d{6,}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeBulkImportSku(rawSku: string): {
  display_sku: string;
  normalized_sku: string | null;
  match_warning: string | null;
} {
  const originalSku = String(rawSku || "").trim().toUpperCase();
  const extractedStyleCode = extractStyleCodeCandidate(originalSku);
  const displaySku = extractedStyleCode || originalSku.replace(/\s+/g, "");
  const normalized = normalizeSku(displaySku);

  return {
    display_sku: displaySku,
    normalized_sku: normalized,
    match_warning:
      extractedStyleCode && extractedStyleCode !== originalSku
        ? `Matched using extracted style code ${extractedStyleCode}.`
        : null,
  };
}

function extractStyleCodeCandidate(value: string): string | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const matches = normalized.match(/[A-Z]{1,5}\d{2,}[A-Z0-9]*(?:-\d{2,}[A-Z0-9]*)?|\d{6,}(?:\.\d+)?/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const candidate = matches[0].replace(/\.00$/, "");
  return candidate || null;
}

function parseConditionDetails(value: string): {
  condition: "new" | "used";
  box_condition: "perfect" | "good" | "damaged" | "no_box";
  warnings: string[];
} {
  const normalized = String(value || "").trim().toLowerCase();
  const warnings: string[] = [];

  let condition: "new" | "used" = "new";
  let boxCondition: "perfect" | "good" | "damaged" | "no_box" = "perfect";

  if (normalized.includes("used")) {
    condition = "used";
  } else if (!normalized || normalized.includes("new")) {
    condition = "new";
  } else if (/[a-z]/.test(normalized)) {
    warnings.push(`Condition value "${value}" was treated as new.`);
  }

  if (normalized.includes("no box")) {
    boxCondition = "no_box";
  } else if (normalized.includes("damaged box") || normalized.includes("defect")) {
    boxCondition = "damaged";
  } else if (normalized.includes("rep box") || normalized.includes("replacement box")) {
    boxCondition = "good";
  }

  return {
    condition,
    box_condition: boxCondition,
    warnings,
  };
}

function determineMatchConfidence(input: {
  sourceName: string;
  sourceSku: string;
  normalizedSku: string | null;
  matchedProduct: string | null;
  sneakerLookup: ResolvedSneakerLike;
  catalogProduct: ResolvedCatalogLike;
  warnings: string[];
}): AdminInventoryMatchConfidence {
  if (!input.normalizedSku) {
    return "unmatched";
  }

  if (!input.matchedProduct) {
    return "unmatched";
  }

  const normalizedInputSku = normalizeSku(input.sourceSku);
  const normalizedMatchedSku =
    input.sneakerLookup?.sneaker.normalized_sku ||
    input.catalogProduct?.normalizedSku ||
    null;
  const exactSkuMatch =
    Boolean(normalizedInputSku) &&
    Boolean(normalizedMatchedSku) &&
    normalizedInputSku === normalizedMatchedSku;

  const nameSimilarity = compareNameSimilarity(input.sourceName, input.matchedProduct);
  const placeholderOnly =
    !input.sneakerLookup &&
    Boolean(input.catalogProduct) &&
    input.catalogProduct?.source === "placeholder";

  if (placeholderOnly) {
    return "low";
  }

  if (exactSkuMatch && (nameSimilarity >= 0.45 || !input.sourceName.trim())) {
    return input.warnings.some((warning) => warning.toLowerCase().includes("inferred"))
      ? "medium"
      : "high";
  }

  if (exactSkuMatch && nameSimilarity >= 0.2) {
    return "medium";
  }

  if (nameSimilarity >= 0.45) {
    return "medium";
  }

  return "low";
}

function compareNameSimilarity(left: string, right: string): number {
  const leftTokens = tokenizeName(left);
  const rightTokens = tokenizeName(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of Array.from(leftTokens)) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function tokenizeName(value: string): Set<string> {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function buildMatchedProductName(
  sneakerLookup: ResolvedSneakerLike,
  catalogProduct: ResolvedCatalogLike,
  liveLookup?: KicksDbLiveLookup | null
): string | null {
  if (liveLookup) {
    return (
      liveLookup.name ||
      [liveLookup.brand, liveLookup.model, liveLookup.nickname]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      null
    );
  }

  if (sneakerLookup?.sneaker) {
    return (
      sneakerLookup.sneaker.name ||
      [sneakerLookup.sneaker.brand, sneakerLookup.sneaker.model, sneakerLookup.sneaker.nickname]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      null
    );
  }

  if (catalogProduct) {
    return [catalogProduct.brand, catalogProduct.model, catalogProduct.nickname]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return null;
}

function buildResolvedSneakerFromLiveLookup(
  liveLookup: KicksDbLiveLookup
): ResolvedSneakerLike {
  return {
    source: "kicksdb",
    sneaker: {
      id: `live-${liveLookup.normalized_sku}`,
      sku: liveLookup.sku,
      normalized_sku: liveLookup.normalized_sku,
      brand: liveLookup.brand,
      name: liveLookup.name,
      model: liveLookup.model,
      nickname: liveLookup.nickname,
      colorway: liveLookup.colorway,
      gender: liveLookup.gender,
      release_date: liveLookup.release_date,
      retail_price: liveLookup.retail_price,
      description: liveLookup.description,
      gallery_images: liveLookup.gallery_images,
      image_url: liveLookup.image_url,
      source: "kicksdb",
    },
  };
}

function splitBrandAndModelFromName(value: string): {
  brand: string | null;
  model: string | null;
} {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return { brand: null, model: null };
  }

  const lower = normalized.toLowerCase();
  const matchedBrand = BRAND_PREFIXES.find((brand) => lower.startsWith(brand));

  if (!matchedBrand) {
    return {
      brand: null,
      model: normalized,
    };
  }

  const brand = normalizeTitleCase(matchedBrand);
  const model = normalized.slice(matchedBrand.length).trim() || normalized;
  return {
    brand,
    model,
  };
}

function normalizeTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildListingImages(input: {
  sneakerGalleryImages: string[];
  sneakerImageUrl: string | null;
  catalogImages: string[];
  existingImages: string[];
}): string[] {
  const result: string[] = [];

  for (const candidate of [
    ...input.sneakerGalleryImages,
    input.sneakerImageUrl,
    ...input.catalogImages,
    ...input.existingImages,
  ]) {
    const normalized = String(candidate || "").trim();
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  }

  return result.slice(0, 6);
}

function buildListingTitle(brand: string, model: string, nickname: string | null): string {
  return [brand, model, nickname].filter(Boolean).join(" ").trim() || model || brand || "Untitled Listing";
}

function pickWorseBoxCondition(
  left: "perfect" | "good" | "damaged" | "no_box",
  right: "perfect" | "good" | "damaged" | "no_box"
): "perfect" | "good" | "damaged" | "no_box" {
  const ranking = {
    perfect: 0,
    good: 1,
    damaged: 2,
    no_box: 3,
  } as const;

  return ranking[right] > ranking[left] ? right : left;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  );
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        await worker(items[currentIndex]);
      }
    })
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });

  const result = await Promise.race([promise, timeoutPromise]);
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  return result;
}
