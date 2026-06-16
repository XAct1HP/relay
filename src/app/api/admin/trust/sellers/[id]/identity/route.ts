import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import {
  banSellerIdentity,
  clearSellerIdentityFalsePositive,
  getSellerIdentityProfile,
  syncSellerIdentityProfile,
} from "@/lib/seller-identity";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sellerId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const action = String(body?.action || "").trim();

    if (!["sync", "clear_false_positive", "ban_identity"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "sync") {
      const result = await syncSellerIdentityProfile(sellerId, {
        adminClient,
        actorUserId: user.id,
        actorRole: "admin",
      });

      return NextResponse.json({
        success: true,
        identityProfile: result.identityProfile,
        onboardingComplete: result.onboardingComplete,
        verificationStatus: result.verificationStatus,
        adminReviewRequired: result.adminReviewRequired,
        matchReasons: result.matchReasons,
      });
    }

    if (action === "clear_false_positive") {
      const identityProfile = await clearSellerIdentityFalsePositive(sellerId, {
        adminClient,
        actorUserId: user.id,
        actorRole: "admin",
      });

      return NextResponse.json({
        success: true,
        identityProfile,
      });
    }

    const reason = String(body?.reason || "").trim();
    if (!reason) {
      return NextResponse.json({ error: "A ban reason is required." }, { status: 400 });
    }

    const identityProfile = await banSellerIdentity(sellerId, {
      adminClient,
      actorUserId: user.id,
      actorRole: "admin",
      reason,
    });

    return NextResponse.json({
      success: true,
      identityProfile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update seller identity status";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sellerId } = await params;
    const { adminClient } = await requireAdminSession();
    const identityProfile = await getSellerIdentityProfile(sellerId, adminClient);

    return NextResponse.json({
      identityProfile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load seller identity profile";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
