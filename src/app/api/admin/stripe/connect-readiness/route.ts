import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { backfillStripeConnectTransferReadiness } from "@/lib/seller-identity";

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json().catch(() => ({}));
    const sellerId =
      typeof body?.sellerId === "string" && body.sellerId.trim().length > 0
        ? body.sellerId.trim()
        : null;
    const limit =
      typeof body?.limit === "number" && Number.isFinite(body.limit) ? body.limit : undefined;

    const result = await backfillStripeConnectTransferReadiness({
      adminClient,
      actorUserId: user.id,
      actorRole: "admin",
      sellerId,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to backfill Stripe Connect transfer readiness";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
