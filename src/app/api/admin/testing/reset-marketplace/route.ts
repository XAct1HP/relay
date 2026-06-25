import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import {
  getTestingResetConfirmationText,
  getTestingResetEnvironmentLabel,
  isTestingResetAllowed,
  resetTestingMarketplaceData,
} from "@/lib/testing-reset";

export async function GET() {
  try {
    await requireAdminSession();

    return NextResponse.json({
      allowed: isTestingResetAllowed(),
      environment: getTestingResetEnvironmentLabel(),
      confirmationText: getTestingResetConfirmationText(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load testing reset status.";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json().catch(() => ({}));
    const confirmation =
      typeof body?.confirmation === "string" ? body.confirmation : "";

    const result = await resetTestingMarketplaceData(adminClient, {
      actorUserId: user.id,
      confirmation,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reset testing marketplace data.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : message.includes("Confirmation text")
            ? 400
            : message.includes("blocked outside preview")
              ? 403
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
