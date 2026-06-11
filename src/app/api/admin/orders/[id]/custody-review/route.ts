import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { approveOrderCustodyReview } from "@/lib/relay-tags";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();

    await approveOrderCustodyReview(adminClient, {
      orderId,
      adminUserId: user.id,
      approve: Boolean(body?.approve),
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
