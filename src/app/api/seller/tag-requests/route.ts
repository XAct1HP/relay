import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { determineSellerTagInventoryPolicy } from "@/lib/relay-tags";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, seller_tier, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "seller") {
      return NextResponse.json({ error: "Seller profile not found" }, { status: 403 });
    }

    const body = await request.json();
    const quantity = Number(body?.requestedQuantity);
    const reason = typeof body?.requestReason === "string" ? body.requestReason.trim() : null;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "A positive requested quantity is required" }, { status: 400 });
    }

    const policy = determineSellerTagInventoryPolicy(profile.seller_tier);
    const policyType =
      profile.seller_tier === "tier_3"
        ? "monthly_replenishment"
        : profile.seller_tier === "tier_2"
          ? "bundle_250"
          : "additional_request";

    const { data: tagRequest, error: insertError } = await supabase
      .from("seller_tag_requests")
      .insert({
        seller_id: user.id,
        requested_quantity: quantity,
        seller_tier_snapshot: profile.seller_tier,
        policy_type: policyType,
        request_reason: reason,
        metadata: {
          policyDescription: policy.description,
        },
      })
      .select("*")
      .single();

    if (insertError || !tagRequest) {
      return NextResponse.json({ error: insertError?.message || "Failed to create tag request" }, { status: 500 });
    }

    await logRelayAuditEvent(createAdminClient(), {
      actorUserId: user.id,
      actorRole: "seller",
      sellerId: user.id,
      eventType: "relay_tag.request_created",
      metadata: {
        requestId: tagRequest.id,
        requestedQuantity: quantity,
        policyType,
      },
    });

    return NextResponse.json(tagRequest);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to request Relay tags" },
      { status: 500 }
    );
  }
}
