import { NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { syncSellerIdentityProfile } from "@/lib/seller-identity";

export async function GET() {
  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const syncResult = await syncSellerIdentityProfile(user.id, {
      adminClient,
      actorUserId: user.id,
      actorRole: "seller",
    });

    return NextResponse.json({
      stripeAccountId: syncResult.identityProfile.stripe_account_id,
      onboardingComplete: syncResult.onboardingComplete,
      verificationStatus: syncResult.verificationStatus,
      adminReviewRequired: syncResult.adminReviewRequired,
      matchReasons: syncResult.matchReasons,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Stripe Connect status" },
      { status: 500 }
    );
  }
}
