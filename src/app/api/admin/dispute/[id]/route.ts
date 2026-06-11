import { NextRequest, NextResponse } from "next/server";
import { requireAdminBearerToken, requireAdminSession } from "@/lib/admin-access";
import {
  getAdminDisputeDetail,
  runAdminDisputeAction,
  type AdminDisputeAction,
} from "@/lib/admin-disputes";

async function requireAdminAccess(request: NextRequest) {
  if (request.headers.get("authorization")) {
    return requireAdminBearerToken(request);
  }

  return requireAdminSession();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { adminClient } = await requireAdminAccess(request);
    const detail = await getAdminDisputeDetail(adminClient, orderId);

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load dispute detail" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { user, adminClient } = await requireAdminAccess(request);
    const body = await request.json();
    const ruling = typeof body?.ruling === "string" ? body.ruling : null;
    const action = (typeof body?.action === "string" ? body.action : null) as AdminDisputeAction | null;

    const normalizedAction =
      action ||
      (ruling === "buyer"
        ? "approve_buyer_claim"
        : ruling === "seller"
          ? "deny_buyer_claim"
          : null);

    if (!normalizedAction) {
      return NextResponse.json({ error: "Invalid dispute action" }, { status: 400 });
    }

    const detail = await runAdminDisputeAction(adminClient, {
      orderId,
      action: normalizedAction,
      adminUserId: user.id,
      notes:
        typeof body?.notes === "string"
          ? body.notes
          : typeof body?.adminNotes === "string"
            ? body.adminNotes
            : null,
      targetTier:
        typeof body?.targetTier === "string" &&
        ["tier_1", "tier_2", "tier_3"].includes(body.targetTier)
          ? body.targetTier
          : null,
      consumeAmountCents:
        typeof body?.consumeAmountCents === "number"
          ? body.consumeAmountCents
          : typeof body?.consumeAmountDollars === "number"
            ? Math.round(body.consumeAmountDollars * 100)
            : null,
      outcome: typeof body?.outcome === "string" ? body.outcome : null,
    });

    return NextResponse.json({
      success: true,
      detail,
    });
  } catch (error) {
    console.error("Admin dispute action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update dispute" },
      { status: 500 }
    );
  }
}
