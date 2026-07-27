import { NextResponse } from "next/server";
import { startAdminInventoryPreviewJob } from "@/lib/admin-inventory-preview-jobs";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerClientInstance } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (!auth.success) {
    return NextResponse.json(
      { error: auth.error || "Admin access is required." },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const sellerId = String(formData.get("seller_id") || "").trim();
  const pricingMode = extractPricingMode(formData);
  const csvText = await extractCsvText(formData);

  if (!sellerId) {
    return NextResponse.json(
      { error: "Choose a seller before previewing this upload." },
      { status: 400 }
    );
  }

  if (!csvText) {
    return NextResponse.json(
      { error: "Upload a CSV file before previewing this upload." },
      { status: 400 }
    );
  }

  try {
    const report = await startAdminInventoryPreviewJob(createAdminClient(), sellerId, csvText, {
      pricing_mode: pricingMode,
      reconcile_missing: formData.get("reconcile_missing") === "true",
    });

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start the preview job.",
      },
      { status: 500 }
    );
  }
}

async function requireAdminUser(): Promise<{ success: boolean; error?: string }> {
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

function extractPricingMode(formData: FormData) {
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
