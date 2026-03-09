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
    const targetUserId = body.targetUserId as string | undefined;
    const mode = body.mode as "temporary" | "permanent" | "clear" | undefined;
    const reason = (body.reason as string | undefined)?.trim() || null;
    const days = Number(body.days ?? 0);

    if (!targetUserId || !mode) {
      return NextResponse.json(
        { error: "Missing moderation inputs." },
        { status: 400 }
      );
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "You cannot ban your own account." },
        { status: 400 }
      );
    }

    if (mode === "clear") {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          banned_until: null,
          banned_permanently: false,
          ban_reason: null,
        })
        .eq("id", targetUserId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    if (mode === "permanent") {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          banned_until: null,
          banned_permanently: true,
          ban_reason: reason,
        })
        .eq("id", targetUserId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    if (mode === "temporary") {
      if (!days || days <= 0) {
        return NextResponse.json(
          { error: "Temporary bans require a valid day count." },
          { status: 400 }
        );
      }

      const bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          banned_until: bannedUntil,
          banned_permanently: false,
          ban_reason: reason,
        })
        .eq("id", targetUserId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid moderation mode." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update user moderation." },
      { status: 500 }
    );
  }
}