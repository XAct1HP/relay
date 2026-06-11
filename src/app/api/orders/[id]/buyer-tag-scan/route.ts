import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { recordBuyerRelayTagScan } from "@/lib/relay-tags";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    await recordBuyerRelayTagScan(createAdminClient(), {
      orderId,
      buyerId: user.id,
      scannedValue: String(body?.scannedValue || ""),
      buyerTagPhotoUrl: typeof body?.buyerTagPhotoUrl === "string" ? body.buyerTagPhotoUrl : null,
      buyerPairPhotoUrl: typeof body?.buyerPairPhotoUrl === "string" ? body.buyerPairPhotoUrl : null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record buyer tag scan" },
      { status: 400 }
    );
  }
}
