import type { SupabaseClient } from "@supabase/supabase-js";
import { SPECIAL_BRANDS } from "@/lib/constants";

export interface VariantInput {
  size: string;
  price: number;
  quantity: number;
  condition?: VariantCondition;
  is_active?: boolean;
}

export type VariantCondition = "new" | "used";

export interface ListingVariantRow extends VariantInput {
  id: string;
  listing_id: string;
  condition: VariantCondition;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ResolveListingVariantOptions {
  variantId?: string | null;
  size?: string | null;
  allowedCondition?: "new" | "used" | "any";
}

export function normalizeSku(rawSku: string | null | undefined): string | null {
  if (!rawSku) {
    return null;
  }

  const normalized = rawSku.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}

export function isManualListingBrand(brand: string | null | undefined): boolean {
  return SPECIAL_BRANDS.includes((brand || "") as (typeof SPECIAL_BRANDS)[number]);
}

export function buildVariantPayload(rows: VariantInput[]): VariantInput[] {
  const byVariant = new Map<string, VariantInput>();

  for (const row of rows) {
    const size = String(row.size || "").trim();
    const price = Number(row.price);
    const quantity = Number(row.quantity);
    const condition = normalizeVariantCondition(row.condition);

    if (!size || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity < 0) {
      continue;
    }

    byVariant.set(getVariantKey(size, condition), {
      size,
      price,
      quantity,
      condition,
      is_active: row.is_active ?? true,
    });
  }

  return Array.from(byVariant.values()).sort(compareVariantSizes);
}

export function buildLegacySizes(rows: VariantInput[]): Array<{ size: string; price: number; quantity: number; condition: VariantCondition }> {
  return buildVariantPayload(rows).map((row) => ({
    size: row.size,
    price: row.price,
    quantity: row.quantity,
    condition: normalizeVariantCondition(row.condition),
  }));
}

export function mergeVariantInputs(existing: VariantInput[], incoming: VariantInput[]): VariantInput[] {
  const merged = new Map<string, VariantInput>();

  for (const row of buildVariantPayload(existing)) {
    merged.set(getVariantKey(row.size, normalizeVariantCondition(row.condition)), {
      ...row,
      condition: normalizeVariantCondition(row.condition),
      is_active: row.is_active ?? true,
    });
  }

  for (const row of buildVariantPayload(incoming)) {
    const condition = normalizeVariantCondition(row.condition);
    const key = getVariantKey(row.size, condition);
    const current = merged.get(key);
    if (current) {
      merged.set(key, {
        size: row.size,
        price: row.price,
        quantity: current.quantity + row.quantity,
        condition,
        is_active: true,
      });
    } else {
      merged.set(key, { ...row, condition, is_active: true });
    }
  }

  return Array.from(merged.values()).sort(compareVariantSizes);
}

export async function fetchListingVariants(
  supabase: SupabaseClient,
  listingId: string
): Promise<ListingVariantRow[]> {
  const { data, error } = await supabase
    .from("listing_variants")
    .select("id, listing_id, size, price, quantity, condition, is_active, created_at, updated_at")
    .eq("listing_id", listingId)
    .order("size", { ascending: true })
    .order("condition", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as ListingVariantRow[];
}

export async function resolveListingVariant(
  supabase: SupabaseClient,
  listingId: string,
  options: ResolveListingVariantOptions
): Promise<ListingVariantRow | null> {
  const variantId = options.variantId ? String(options.variantId).trim() : "";
  const size = options.size ? String(options.size).trim() : "";
  const allowedCondition = options.allowedCondition || "new";

  if (variantId) {
    const { data, error } = await supabase
      .from("listing_variants")
      .select("id, listing_id, size, price, quantity, condition, is_active, created_at, updated_at")
      .eq("id", variantId)
      .eq("listing_id", listingId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (
      data &&
      data.is_active !== false &&
      (allowedCondition === "any" || data.condition === allowedCondition)
    ) {
      return data as ListingVariantRow;
    }
  }

  if (!size) {
    return null;
  }

  const { data, error } = await supabase
    .from("listing_variants")
    .select("id, listing_id, size, price, quantity, condition, is_active, created_at, updated_at")
    .eq("listing_id", listingId)
    .eq("size", size)
    .in("condition", allowedCondition === "any" ? ["new", "used"] : [allowedCondition])
    .order("condition", { ascending: true });

  if (error) {
    throw error;
  }

  const firstActive = ((data || []) as ListingVariantRow[]).find((row) => row.is_active !== false);

  if (!firstActive) {
    return null;
  }

  return firstActive;
}

export async function mergeListingVariants(
  supabase: SupabaseClient,
  listingId: string,
  incomingRows: VariantInput[]
): Promise<void> {
  const incoming = buildVariantPayload(incomingRows);
  if (incoming.length === 0) {
    return;
  }

  const existingRows = await fetchListingVariants(supabase, listingId);
  const existingByVariant = new Map(
    existingRows.map((row) => [getVariantKey(row.size, row.condition), row])
  );

  for (const row of incoming) {
    const condition = normalizeVariantCondition(row.condition);
    const existing = existingByVariant.get(getVariantKey(row.size, condition));

    if (existing) {
      const { error } = await supabase
        .from("listing_variants")
        .update({
          price: row.price,
          quantity: existing.quantity + row.quantity,
          condition,
          is_active: true,
        })
        .eq("id", existing.id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.from("listing_variants").insert({
        listing_id: listingId,
        size: row.size,
        price: row.price,
        quantity: row.quantity,
        condition,
        is_active: true,
      });

      if (error) {
        throw error;
      }
    }
  }
}

export async function replaceListingVariants(
  supabase: SupabaseClient,
  listingId: string,
  rows: VariantInput[]
): Promise<void> {
  const incoming = buildVariantPayload(rows);
  const existingRows = await fetchListingVariants(supabase, listingId);
  const existingByVariant = new Map(
    existingRows.map((row) => [getVariantKey(row.size, row.condition), row])
  );
  const seenVariants = new Set<string>();

  for (const row of incoming) {
    const condition = normalizeVariantCondition(row.condition);
    const key = getVariantKey(row.size, condition);
    seenVariants.add(key);
    const existing = existingByVariant.get(key);

    if (existing) {
      const { error } = await supabase
        .from("listing_variants")
        .update({
          price: row.price,
          quantity: row.quantity,
          condition,
          is_active: row.is_active ?? true,
        })
        .eq("id", existing.id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.from("listing_variants").insert({
        listing_id: listingId,
        size: row.size,
        price: row.price,
        quantity: row.quantity,
        condition,
        is_active: row.is_active ?? true,
      });

      if (error) {
        throw error;
      }
    }
  }

  const rowsToDisable = existingRows.filter(
    (row) => !seenVariants.has(getVariantKey(row.size, row.condition))
  );
  for (const row of rowsToDisable) {
    const { error } = await supabase
      .from("listing_variants")
      .update({
        quantity: 0,
        is_active: false,
      })
      .eq("id", row.id);

    if (error) {
      throw error;
    }
  }
}

function compareVariantSizes(a: VariantInput, b: VariantInput): number {
  const aSize = Number(a.size);
  const bSize = Number(b.size);

  if (Number.isFinite(aSize) && Number.isFinite(bSize)) {
    if (aSize !== bSize) {
      return aSize - bSize;
    }
  } else {
    const sizeCompare = a.size.localeCompare(b.size, undefined, { numeric: true });
    if (sizeCompare !== 0) {
      return sizeCompare;
    }
  }

  return normalizeVariantCondition(a.condition).localeCompare(normalizeVariantCondition(b.condition));
}

function getVariantKey(size: string, condition: VariantCondition) {
  return `${size}::${condition}`;
}

function normalizeVariantCondition(condition: string | null | undefined): VariantCondition {
  return condition === "used" ? "used" : "new";
}
