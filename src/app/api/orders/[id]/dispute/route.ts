import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  createBuyerDispute,
  normalizeBuyerDisputeInput,
} from "@/lib/buyer-order-review";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createServerClientInstance();
    const adminClient = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const normalized = normalizeBuyerDisputeInput({
      category: body?.category,
      description: body?.description,
      evidenceUrls: body?.evidenceUrls,
    });

    const result = await createBuyerDispute(adminClient, {
      orderId,
      buyerId: user.id,
      category: normalized.category,
      description: normalized.description,
      evidenceUrls: normalized.evidenceUrls,
    });

    return NextResponse.json({
      success: true,
      dispute: result.dispute,
      status: "disputed",
    });
  } catch (error) {
    console.error("Dispute filing error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to file dispute",
      },
      { status: 400 }
    );
  }
}
