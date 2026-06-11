import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { reviewCheckCheckSubmission } from "@/lib/order-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const action = body?.action as "approve" | "reject" | "request_resubmission" | "force_manual_review";

    if (!["approve", "reject", "request_resubmission", "force_manual_review"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await reviewCheckCheckSubmission(adminClient, {
      orderId,
      adminUserId: user.id,
      action,
      reason: typeof body?.reason === "string" ? body.reason : null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to review CheckCheck submission" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
