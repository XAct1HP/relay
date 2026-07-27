"use server";

import {
  commitAdminInventoryIngest,
  listAdminInventorySellers,
  previewAdminInventoryIngest,
  type AdminInventoryCommitReport,
  type AdminInventoryPreviewReport,
  type AdminInventoryPricingMode,
  type AdminInventorySellerOption,
} from "@/lib/admin-inventory-ingest";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerClientInstance } from "@/lib/supabase-server";

export async function listAdminInventorySellersAction(): Promise<{
  success: boolean;
  sellers: AdminInventorySellerOption[];
  error?: string;
}> {
  const auth = await requireAdminUser();
  if (!auth.success) {
    return {
      success: false,
      sellers: [],
      error: auth.error,
    };
  }

  try {
    const sellers = await listAdminInventorySellers(createAdminClient());
    return {
      success: true,
      sellers,
    };
  } catch (error) {
    console.error("Failed to list sellers for admin inventory ingest:", error);
    return {
      success: false,
      sellers: [],
      error: "Failed to load sellers.",
    };
  }
}

export async function previewAdminInventoryIngestAction(
  formData: FormData
): Promise<AdminInventoryPreviewReport> {
  const auth = await requireAdminUser();
  if (!auth.success) {
    return emptyPreview(auth.error || "Admin access is required.");
  }

  const sellerId = String(formData.get("seller_id") || "").trim();
  const pricingMode = extractPricingMode(formData);
  const csvText = await extractCsvText(formData);

  if (!sellerId) {
    return emptyPreview("Choose a seller before previewing this upload.");
  }

  if (!csvText) {
    return emptyPreview("Upload a CSV file before previewing this upload.");
  }

  try {
    return previewAdminInventoryIngest(createAdminClient(), sellerId, csvText, {
      pricing_mode: pricingMode,
      reconcile_missing: formData.get("reconcile_missing") === "true",
    });
  } catch (error) {
    console.error("Admin inventory ingest preview failed:", error);
    return emptyPreview("Preview failed. Please try again.");
  }
}

export async function commitAdminInventoryIngestAction(
  formData: FormData
): Promise<AdminInventoryCommitReport> {
  const auth = await requireAdminUser();
  if (!auth.success) {
    return {
      seller_id: "",
      pricing_mode: extractPricingMode(formData),
      committed_skus: 0,
      created_skus: 0,
      updated_skus: 0,
      skipped_skus: 0,
      deactivated_variants: 0,
      row_errors: [{ key: "auth", message: auth.error || "Admin access is required." }],
      message: auth.error || "Admin access is required.",
    };
  }

  const sellerId = String(formData.get("seller_id") || "").trim();
  const pricingMode = extractPricingMode(formData);
  const csvText = await extractCsvText(formData);

  if (!sellerId || !csvText) {
    return {
      seller_id: sellerId,
      pricing_mode: pricingMode,
      committed_skus: 0,
      created_skus: 0,
      updated_skus: 0,
      skipped_skus: 0,
      deactivated_variants: 0,
      row_errors: [
        {
          key: "upload",
          message: !sellerId
            ? "Choose a seller before committing this upload."
            : "Upload a CSV file before committing this upload.",
        },
      ],
      message: "The upload could not be committed.",
    };
  }

  try {
    return commitAdminInventoryIngest(createAdminClient(), sellerId, csvText, {
      pricing_mode: pricingMode,
      reconcile_missing: formData.get("reconcile_missing") === "true",
      manual_price_by_key: extractManualPriceMap(formData),
    });
  } catch (error) {
    console.error("Admin inventory ingest commit failed:", error);
    return {
      seller_id: sellerId,
      pricing_mode: pricingMode,
      committed_skus: 0,
      created_skus: 0,
      updated_skus: 0,
      skipped_skus: 0,
      deactivated_variants: 0,
      row_errors: [
        {
          key: "server",
          message: "Commit failed because of a server error.",
        },
      ],
      message: "The upload could not be committed.",
    };
  }
}

async function requireAdminUser(): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "You must be logged in as an admin to manage seller inventory.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
    return {
      success: false,
      error: "Only admins can use this inventory ingest tool.",
    };
  }

  return { success: true };
}

function extractPricingMode(formData: FormData): AdminInventoryPricingMode {
  const raw = String(formData.get("pricing_mode") || "").trim();
  if (raw === "aggressive" || raw === "balanced" || raw === "manual") {
    return raw;
  }

  return "balanced";
}

async function extractCsvText(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File) {
    return file.text();
  }

  const csv = formData.get("csv");
  return typeof csv === "string" ? csv : "";
}

function extractManualPriceMap(formData: FormData): Record<string, string> {
  const raw = formData.get("manual_price_by_key");
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")])
    );
  } catch {
    return {};
  }
}

function emptyPreview(message: string): AdminInventoryPreviewReport {
  return {
    seller_id: "",
    pricing_mode: "balanced",
    rows_read: 0,
    source_rows_considered: 0,
    grouped_rows: 0,
    ready_rows: 0,
    review_rows: 0,
    blocked_rows: 0,
    preview_rows: [],
    missing_variants: [],
    message,
  };
}
