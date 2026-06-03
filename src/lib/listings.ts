import type { SupabaseClient } from "@supabase/supabase-js";
import { SPECIAL_BRANDS } from "@/lib/constants";

export interface VariantInput {
  size: string;
  price: number;
  quantity: number;
  is_active?: boolean;
}

export interface ListingVariantRow extends VariantInput {
  id: string;
  listing_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
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
  const bySize = new Map<string, VariantInput>();

  for (const row of rows) {
    const size = String(row.size || "").trim();
    const price = Number(row.price);
    const quantity = Number(row.quantity);

    if (!size || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity < 0) {
      continue;
    }

    bySize.set(size, {
      size,
      price,
      quantity,
      is_active: row.is_active ?? true,
    });
  }

  return Array.from(bySize.values()).sort(compareVariantSizes);
}

export function buildLegacySizes(rows: VariantInput[]): Array<{ size: string; price: number; quantity: number }> {
  return buildVariantPayload(rows).map((row) => ({
    size: row.size,
    price: row.price,
    quantity: row.quantity,
  }));
}

export function mergeVariantInputs(existing: VariantInput[], incoming: VariantInput[]): VariantInput[] {
  const merged = new Map<string, VariantInput>();

  for (const row of buildVariantPayload(existing)) {
    merged.set(row.size, { ...row, is_active: row.is_active ?? true });
  }

  for (const row of buildVariantPayload(incoming)) {
    const current = merged.get(row.size);
    if (current) {
      merged.set(row.size, {
        size: row.size,
        price: row.price,
        quantity: current.quantity + row.quantity,
        is_active: true,
      });
    } else {
      merged.set(row.size, { ...row, is_active: true });
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
    .select("id, listing_id, size, price, quantity, is_active, created_at, updated_at")
    .eq("listing_id", listingId)
    .order("size", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as ListingVariantRow[];
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
  const existingBySize = new Map(existingRows.map((row) => [row.size, row]));

  for (const row of incoming) {
    const existing = existingBySize.get(row.size);

    if (existing) {
      const { error } = await supabase
        .from("listing_variants")
        .update({
          price: row.price,
          quantity: existing.quantity + row.quantity,
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
  const existingBySize = new Map(existingRows.map((row) => [row.size, row]));
  const seenSizes = new Set<string>();

  for (const row of incoming) {
    seenSizes.add(row.size);
    const existing = existingBySize.get(row.size);

    if (existing) {
      const { error } = await supabase
        .from("listing_variants")
        .update({
          price: row.price,
          quantity: row.quantity,
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
        is_active: row.is_active ?? true,
      });

      if (error) {
        throw error;
      }
    }
  }

  const rowsToDisable = existingRows.filter((row) => !seenSizes.has(row.size));
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
    return aSize - bSize;
  }

  return a.size.localeCompare(b.size, undefined, { numeric: true });
}
