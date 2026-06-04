import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  createSellerApiKey,
  listSellerApiKeys,
  requireApprovedSellerProfile,
  SellerApiKeyError,
} from "@/lib/seller-api-keys";

export async function GET() {
  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireApprovedSellerProfile(supabase, user.id);

    const admin = createAdminClient();
    const apiKeys = await listSellerApiKeys(admin, user.id);

    return NextResponse.json({ apiKeys });
  } catch (error) {
    if (error instanceof SellerApiKeyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Seller API key list error:", error);
    return NextResponse.json({ error: "Failed to load API keys." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireApprovedSellerProfile(supabase, user.id);

    const body = await request.json();
    const admin = createAdminClient();
    const createdKey = await createSellerApiKey(admin, {
      sellerId: user.id,
      name: body?.name,
    });

    return NextResponse.json({
      apiKey: createdKey.apiKey,
      record: createdKey.record,
    });
  } catch (error) {
    if (error instanceof SellerApiKeyError) {
      const status = error.code === "invalid_name" ? 400 : error.code === "seller_not_approved" ? 403 : 500;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }

    console.error("Seller API key create error:", error);
    return NextResponse.json({ error: "Failed to create API key." }, { status: 500 });
  }
}
