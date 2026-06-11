import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { processOrderPayoutTrigger } from "@/lib/payouts";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json().catch(() => ({}));

    const result = await processOrderPayoutTrigger(adminClient, {
      orderId,
      trigger: "manual_override",
      actorUserId: user.id,
      actorRole: "admin",
      allowFrozenProcessing: false,
      overrideReason:
        typeof body?.reason === "string" ? body.reason : "Admin manual payout override",
    });

    const { data: order } = await adminClient
      .from("orders")
      .select("id, payout_status, seller_amount_paid_cents, seller_amount_held_in_reserve_cents")
      .eq("id", orderId)
      .single();

    return NextResponse.json({
      success: true,
      processedSteps: result.processedSteps,
      order,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process manual payout" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
