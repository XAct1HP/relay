import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  requireApprovedSellerProfile,
  revokeSellerApiKey,
  SellerApiKeyError,
} from "@/lib/seller-api-keys";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const revokedKey = await revokeSellerApiKey(admin, {
      sellerId: user.id,
      keyId: id,
    });

    return NextResponse.json({ record: revokedKey });
  } catch (error) {
    if (error instanceof SellerApiKeyError) {
      const status =
        error.code === "not_found" ? 404 : error.code === "seller_not_approved" ? 403 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }

    console.error("Seller API key revoke error:", error);
    return NextResponse.json({ error: "Failed to revoke API key." }, { status: 500 });
  }
}
