import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { listAdminDisputes } from "@/lib/admin-disputes";

export async function GET() {
  try {
    const { adminClient } = await requireAdminSession();
    const data = await listAdminDisputes(adminClient);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load admin disputes" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
