import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { getAdminMoneyOverview } from "@/lib/admin-money";

export async function GET() {
  try {
    const { adminClient } = await requireAdminSession();
    const overview = await getAdminMoneyOverview(adminClient);

    return NextResponse.json(overview);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load admin money overview";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 403 }
    );
  }
}
