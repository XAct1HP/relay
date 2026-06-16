import { NextRequest, NextResponse } from "next/server";
import { cancelSellerWithdrawalRequest, reviewSellerWithdrawalRequest } from "@/lib/money-policy";
import { requireAdminSession } from "@/lib/admin-access";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : null;

    if (action === "mark_reviewed") {
      const result = await reviewSellerWithdrawalRequest(
        id,
        {
          reviewNotes:
            typeof body?.reviewNotes === "string" ? body.reviewNotes : null,
          processAfterReview: body?.processAfterReview !== false,
        },
        {
          adminClient,
          actorRole: "admin",
          actorUserId: user.id,
        }
      );

      return NextResponse.json({
        success: true,
        result,
      });
    }

    if (action === "cancel") {
      const result = await cancelSellerWithdrawalRequest(
        id,
        {
          reason: typeof body?.reason === "string" ? body.reason : null,
        },
        {
          adminClient,
          actorRole: "admin",
          actorUserId: user.id,
        }
      );

      return NextResponse.json({
        success: true,
        result,
      });
    }

    return NextResponse.json({ error: "Invalid withdrawal action" }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update withdrawal";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
