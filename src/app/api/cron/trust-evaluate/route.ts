import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { evaluateAllSellerTrust } from "@/lib/seller-trust-admin";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const results = await evaluateAllSellerTrust(adminClient, {
      actorRole: "system",
      source: "automated",
    });

    return NextResponse.json({
      processed: results.length,
      changed: results.filter((result) => result.changed).length,
      banned: results.filter((result) => result.banned).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run trust evaluation cron" },
      { status: 500 }
    );
  }
}
