import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { getAdminOrderMoneyDetail } from "@/lib/admin-money";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { adminClient } = await requireAdminSession();
    const detail = await getAdminOrderMoneyDetail(adminClient, orderId);

    return NextResponse.json(detail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load order money detail";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 403 }
    );
  }
}
