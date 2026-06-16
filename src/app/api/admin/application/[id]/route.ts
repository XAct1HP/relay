import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import {
  enforceSellerApprovalIdentityRequirements,
  getSellerIdentityProfile,
  syncSellerIdentityProfile,
} from "@/lib/seller-identity";

async function loadApplicationForAdmin(adminClient: Awaited<ReturnType<typeof requireAdminSession>>["adminClient"], applicationId: string) {
  const { data: application, error: applicationError } = await adminClient
    .from("seller_applications")
    .select("*")
    .eq("id", applicationId)
    .single();

  if (applicationError || !application) {
    throw new Error(applicationError?.message || "Application not found");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", application.user_id)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message || "Applicant profile not found");
  }

  return {
    adminClient,
    application,
    profile,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, adminClient } = await requireAdminSession();
    const { id: applicationId } = await params;
    const { application, profile } = await loadApplicationForAdmin(adminClient, applicationId);
    let currentProfile = profile;

    let identityProfile = await getSellerIdentityProfile(profile.id, adminClient);
    let identitySyncError: string | null = null;

    try {
      const syncResult = await syncSellerIdentityProfile(profile.id, {
        adminClient,
        actorUserId: user.id,
        actorRole: "admin",
      });
      identityProfile = syncResult.identityProfile;

      const { data: refreshedProfile } = await adminClient
        .from("profiles")
        .select("*")
        .eq("id", profile.id)
        .single();

      if (refreshedProfile) {
        currentProfile = refreshedProfile;
      }
    } catch (error) {
      identitySyncError =
        error instanceof Error ? error.message : "Failed to sync seller identity profile.";
    }

    return NextResponse.json({
      application,
      profile: currentProfile,
      identityProfile,
      identitySyncError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load application";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 404;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, adminClient } = await requireAdminSession();
    const { id: applicationId } = await params;
    const { application, profile } = await loadApplicationForAdmin(adminClient, applicationId);
    const { action, adminNotes } = await request.json();

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "approve") {
      let identityResult;

      try {
        identityResult = await enforceSellerApprovalIdentityRequirements(application.user_id, {
          adminClient,
          actorUserId: user.id,
          actorRole: "admin",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Seller is not eligible for approval yet.";
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const { data: updatedApplication, error: updateError } = await adminClient
        .from("seller_applications")
        .update({
          status: "approved",
          admin_notes: adminNotes || null,
          stripe_connected: identityResult.onboardingComplete,
        })
        .eq("id", applicationId)
        .select("*")
        .single();

      if (updateError || !updatedApplication) {
        return NextResponse.json(
          { error: `Failed to update application: ${updateError?.message || "unknown error"}` },
          { status: 500 }
        );
      }

      const questionnaire = application.questionnaire_responses as Record<string, string> | null;
      const profileUpdate: Record<string, unknown> = {
        role: "seller",
        is_verified_seller: true,
        seller_application_status: "approved",
      };

      if (!profile.display_name && profile.full_name) {
        profileUpdate.display_name = profile.full_name;
      }

      if (!profile.ship_from_address && application.ship_from_address) {
        profileUpdate.ship_from_address = application.ship_from_address;
      }

      if (!profile.instagram_url && questionnaire?.instagram_url) {
        profileUpdate.instagram_url = questionnaire.instagram_url;
      }

      const { data: updatedProfile, error: updateUserError } = await adminClient
        .from("profiles")
        .update(profileUpdate)
        .eq("id", application.user_id)
        .select("*")
        .single();

      if (updateUserError || !updatedProfile) {
        return NextResponse.json(
          {
            error: `Application approved but failed to update user role: ${
              updateUserError?.message || "unknown error"
            }`,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        application: updatedApplication,
        profile: updatedProfile,
        identityProfile: identityResult.identityProfile,
      });
    }

    const rejectionCount = (application.rejection_count || 0) + 1;
    const { data: updatedApplication, error: updateError } = await adminClient
      .from("seller_applications")
      .update({
        status: "rejected",
        rejection_count: rejectionCount,
        admin_notes: adminNotes || null,
      })
      .eq("id", applicationId)
      .select("*")
      .single();

    if (updateError || !updatedApplication) {
      return NextResponse.json(
        { error: `Failed to update application: ${updateError?.message || "unknown error"}` },
        { status: 500 }
      );
    }

    const isFinalRejection = rejectionCount >= 2;
    const { data: updatedProfile } = await adminClient
      .from("profiles")
      .update({
        seller_application_status: isFinalRejection ? "rejected_final" : "rejected",
      })
      .eq("id", application.user_id)
      .select("*")
      .single();

    return NextResponse.json({
      application: updatedApplication,
      profile: updatedProfile || profile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to review application";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
