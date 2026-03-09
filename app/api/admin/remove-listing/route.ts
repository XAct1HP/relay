import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getAdminEmails() {
  return new Set(
    (process.env.RELAY_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email || !getAdminEmails().has(user.email.toLowerCase())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const listingId = body.listingId as string | undefined;
    const reason = (body.reason as string | undefined)?.trim() || null;

    if (!listingId) {
      return NextResponse.json({ error: "Missing listingId." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("listings")
      .update({
        status: "removed",
        admin_removed: true,
        admin_removed_at: new Date().toISOString(),
        admin_removed_reason: reason,
      })
      .eq("id", listingId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to remove listing." },
      { status: 500 }
    );
  }
}