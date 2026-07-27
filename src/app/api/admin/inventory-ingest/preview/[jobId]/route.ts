import { NextResponse } from "next/server";
import { getAdminInventoryPreviewJob } from "@/lib/admin-inventory-preview-jobs";
import { createServerClientInstance } from "@/lib/supabase-server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAdminUser();
  if (!auth.success) {
    return NextResponse.json(
      { error: auth.error || "Admin access is required." },
      { status: 403 }
    );
  }

  const { jobId } = await context.params;
  const report = getAdminInventoryPreviewJob(jobId);

  if (!report) {
    return NextResponse.json({ error: "Preview job not found." }, { status: 404 });
  }

  return NextResponse.json(report);
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
