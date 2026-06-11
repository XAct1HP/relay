import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { evaluateSellerTrustById, recordSellerViolation } from "@/lib/seller-trust-admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sellerId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();

    const violationType = body?.violationType;
    if (!["authenticity", "tag_tampering", "dispute_rate", "manual_demotion", "other"].includes(violationType)) {
      return NextResponse.json({ error: "Invalid violation type" }, { status: 400 });
    }

    const violation = await recordSellerViolation(adminClient, {
      sellerId,
      actorUserId: user.id,
      violationType,
      orderId: typeof body?.orderId === "string" ? body.orderId : null,
      severity: body?.severity,
      penaltyOutcome: typeof body?.penaltyOutcome === "string" ? body.penaltyOutcome : null,
      notes: typeof body?.notes === "string" ? body.notes : null,
      metadata: typeof body?.metadata === "object" && body.metadata ? body.metadata : {},
    });

    const evaluation = await evaluateSellerTrustById(adminClient, sellerId, {
      actorUserId: user.id,
      actorRole: "admin",
      source: "manual",
    });

    return NextResponse.json({
      violation,
      evaluation,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record trust violation" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
