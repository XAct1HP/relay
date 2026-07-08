"use server";

import {
  commitBulkInventoryImport,
  previewBulkInventoryImport,
  type CsvQuantityPreference,
  type InventoryImportReport,
} from "@/lib/inventory-import";
import { createServerClientInstance } from "@/lib/supabase-server";

export async function previewBulkInventoryImportAction(formData: FormData): Promise<InventoryImportReport> {
  return runBulkInventoryImportAction(formData, "preview");
}

export async function commitBulkInventoryImportAction(formData: FormData): Promise<InventoryImportReport> {
  return runBulkInventoryImportAction(formData, "commit");
}

async function runBulkInventoryImportAction(
  formData: FormData,
  mode: "preview" | "commit"
): Promise<InventoryImportReport> {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      outcome: "blocked",
      committed: false,
      rows_read: 0,
      rows_valid: 0,
      rows_invalid: 0,
      rows_created: 0,
      rows_updated: 0,
      row_errors: [{ row: 0, field: "import", message: "You must be logged in to import inventory." }],
      skus_processed: 0,
      message: "Authentication required.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || (profile.role !== "seller" && profile.role !== "admin")) {
    return {
      outcome: "blocked",
      committed: false,
      rows_read: 0,
      rows_valid: 0,
      rows_invalid: 0,
      rows_created: 0,
      rows_updated: 0,
      row_errors: [{ row: 0, field: "import", message: "Only sellers can import inventory." }],
      skus_processed: 0,
      message: "Seller access required.",
    };
  }

  const csvText = await extractCsvText(formData);
  if (!csvText) {
    return {
      outcome: "blocked",
      committed: false,
      rows_read: 0,
      rows_valid: 0,
      rows_invalid: 0,
      rows_created: 0,
      rows_updated: 0,
      row_errors: [{ row: 0, field: "import", message: "Upload a CSV file or provide CSV text." }],
      skus_processed: 0,
      message: "No CSV data received.",
    };
  }

  const quantityPreference = extractQuantityPreference(formData);

  if (mode === "commit") {
    return commitBulkInventoryImport(supabase, user.id, csvText, quantityPreference);
  }

  return previewBulkInventoryImport(supabase, user.id, csvText, quantityPreference);
}

function extractQuantityPreference(formData: FormData): CsvQuantityPreference {
  const raw = formData.get("quantity_mode");
  if (raw === "with_quantity" || raw === "single_row_per_shoe") {
    return raw;
  }
  return "auto";
}

async function extractCsvText(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File) {
    return file.text();
  }

  const csv = formData.get("csv");
  return typeof csv === "string" ? csv : "";
}
