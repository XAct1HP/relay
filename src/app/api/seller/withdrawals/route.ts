import { NextRequest, NextResponse } from "next/server";
import { createSellerWithdrawalRequest } from "@/lib/money-policy";
import { requireSellerSession } from "@/lib/seller-access";

export async function GET() {
  try {
    const { user, adminClient } = await requireSellerSession();
    const { data, error } = await adminClient
      .from("withdrawal_requests")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Failed to load withdrawal history");
    }

    return NextResponse.json({
      withdrawals: data || [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load withdrawal history";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireSellerSession();
    const body = await request.json();
    const amountCents =
      typeof body?.amountCents === "number"
        ? body.amountCents
        : typeof body?.amountDollars === "number"
          ? Math.round(body.amountDollars * 100)
          : NaN;
    const idempotencyKey =
      typeof body?.idempotencyKey === "string" ? body.idempotencyKey : undefined;

    if (!Number.isFinite(amountCents)) {
      return NextResponse.json({ error: "Invalid withdrawal amount" }, { status: 400 });
    }

    const result = await createSellerWithdrawalRequest(user.id, amountCents, {
      adminClient,
      actorRole: "seller",
      actorUserId: user.id,
      idempotencyKey,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create withdrawal";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 }
    );
  }
}
