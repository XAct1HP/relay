import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminEmails = getAdminEmails();
  const isAdmin = Boolean(user.email && adminEmails.has(user.email.toLowerCase()));

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json();

  const enabled = Boolean(body.enabled);
  const disabledMessage =
    typeof body.disabledMessage === "string" && body.disabledMessage.trim()
      ? body.disabledMessage.trim()
      : "The marketplace is temporarily unavailable.";

  const { error } = await supabaseAdmin.from("site_settings").upsert({
    key: "marketplace",
    value: {
      enabled,
      disabledMessage,
    },
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}