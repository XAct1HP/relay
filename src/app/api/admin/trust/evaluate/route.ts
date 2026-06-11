import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { evaluateAllSellerTrust, evaluateSellerTrustById } from "@/lib/seller-trust-admin";

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json().catch(() => ({}));
    const sellerId = typeof body?.sellerId === "string" ? body.sellerId : null;

    const results = sellerId
      ? [await evaluateSellerTrustById(adminClient, sellerId, { actorUserId: user.id, actorRole: "admin", source: "manual" })]
      : await evaluateAllSellerTrust(adminClient, { actorUserId: user.id, actorRole: "admin", source: "manual" });

    return NextResponse.json({
      processed: results.length,
      changed: results.filter((result) => result.changed).length,
      banned: results.filter((result) => result.banned).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to evaluate seller trust" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
