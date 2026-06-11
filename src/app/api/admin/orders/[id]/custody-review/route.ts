import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { setOrderCustodyManualReview } from "@/lib/order-auth";
import { approveOrderCustodyReview } from "@/lib/relay-tags";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const action = body?.action as "approve" | "reject" | "force_manual_review" | undefined;

    if (action === "force_manual_review") {
      await setOrderCustodyManualReview(adminClient, {
        orderId,
        adminUserId: user.id,
        reason: typeof body?.reason === "string" ? body.reason : null,
      });

      return NextResponse.json({ success: true });
    }

    await approveOrderCustodyReview(adminClient, {
      orderId,
      adminUserId: user.id,
      approve: action ? action === "approve" : Boolean(body?.approve),
      reason: typeof body?.reason === "string" ? body.reason : null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to review custody evidence" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
