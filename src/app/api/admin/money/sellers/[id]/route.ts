import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { getAdminSellerMoneyDetail } from "@/lib/admin-money";
import {
  createAdminBalanceAdjustment,
  setSellerRelayBalanceFrozen,
} from "@/lib/money-policy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sellerId } = await params;
    const { adminClient } = await requireAdminSession();
    const detail = await getAdminSellerMoneyDetail(adminClient, sellerId);

    return NextResponse.json(detail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load seller money detail";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 403 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sellerId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const reason = typeof body?.reason === "string" ? body.reason : "";

    if (action === "freeze" || action === "unfreeze") {
      const relayBalance = await setSellerRelayBalanceFrozen(
        sellerId,
        {
          frozen: action === "freeze",
          reason,
        },
        {
          adminClient,
          actorRole: "admin",
          actorUserId: user.id,
        }
      );

      return NextResponse.json({
        success: true,
        relayBalance,
      });
    }

    if (action === "manual_adjustment") {
      const amountCents =
        typeof body?.amountCents === "number"
          ? body.amountCents
          : Number(body?.amountCents || 0);

      const result = await createAdminBalanceAdjustment(
        sellerId,
        {
          amountCents,
          reason,
          orderId: typeof body?.orderId === "string" ? body.orderId : null,
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

    return NextResponse.json({ error: "Invalid admin money action" }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update seller money state";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
