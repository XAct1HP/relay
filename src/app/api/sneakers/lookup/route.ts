import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resolveSneakerBySku } from "@/lib/sneaker-server";
import { normalizeSku } from "../../../../../lib/sneakers/normalizeSku";

export async function GET(request: NextRequest) {
  try {
    const rawSku = request.nextUrl.searchParams.get("sku");

    if (!rawSku) {
      return NextResponse.json({ error: "Missing sku parameter." }, { status: 400 });
    }

    const normalizedSku = normalizeSku(rawSku);

    if (!normalizedSku) {
      return NextResponse.json({ error: "Missing sku parameter." }, { status: 400 });
    }

    const supabase = await createServerClientInstance();
    const admin = createAdminClient();
    const resolved = await resolveSneakerBySku(supabase, normalizedSku, {
      upsertClient: admin,
    });

    if (!resolved) {
      return NextResponse.json({
        found: false,
        source: null,
        sneaker: null,
      });
    }

    return NextResponse.json({
      found: true,
      source: resolved.source,
      sneaker: resolved.sneaker,
    });
  } catch (error) {
    console.error("Sneaker lookup route error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
