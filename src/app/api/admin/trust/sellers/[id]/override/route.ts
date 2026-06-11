import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { evaluateSellerTrustById } from "@/lib/seller-trust-admin";
import { logRelayAuditEvent } from "@/lib/relay-audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sellerId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const action = body?.action as
      | "set_tier"
      | "lock"
      | "unlock"
      | "set_founding"
      | "approve_tier_3";

    const { data: seller, error: sellerError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", sellerId)
      .single();

    if (sellerError || !seller) {
      return NextResponse.json({ error: "Seller not found" }, { status: 404 });
    }

    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    let updatePayload: Record<string, unknown> = {};
    let historySource:
      | "manual_override"
      | "manual_unlock"
      | "admin_approval" = "manual_override";
    let previousTier = seller.seller_tier;
    let nextTier = seller.seller_tier;

    if (action === "set_tier") {
      const targetTier = body?.targetTier;
      if (!["tier_1", "tier_2", "tier_3"].includes(targetTier)) {
        return NextResponse.json({ error: "Invalid target tier" }, { status: 400 });
      }

      updatePayload = {
        seller_tier: targetTier,
        tier_manually_overridden: true,
        tier_manually_overridden_by: user.id,
        tier_override_reason: reason || "Manual tier override",
        tier_locked: body?.lock !== false,
        tier_locked_at: body?.lock === false ? null : new Date().toISOString(),
      };

      if (targetTier === "tier_3") {
        updatePayload.tier_3_approved_at = new Date().toISOString();
        updatePayload.tier_3_approved_by = user.id;
      }

      nextTier = targetTier;
    } else if (action === "lock") {
      updatePayload = {
        tier_locked: true,
        tier_locked_at: new Date().toISOString(),
      };
      historySource = "manual_override";
    } else if (action === "unlock") {
      updatePayload = {
        tier_locked: false,
        tier_locked_at: null,
        tier_manually_overridden: false,
        tier_manually_overridden_by: null,
        tier_override_reason: reason || null,
      };
      historySource = "manual_unlock";
    } else if (action === "set_founding") {
      updatePayload = {
        is_founding_seller: Boolean(body?.isFoundingSeller),
      };
      historySource = "manual_override";
    } else if (action === "approve_tier_3") {
      updatePayload = {
        tier_3_approved_at: new Date().toISOString(),
        tier_3_approved_by: user.id,
      };
      historySource = "admin_approval";
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { error: updateError } = await adminClient
      .from("profiles")
      .update(updatePayload)
      .eq("id", sellerId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (action === "set_tier" && previousTier !== nextTier) {
      await adminClient.from("seller_tier_history").insert({
        seller_id: sellerId,
        previous_tier: previousTier,
        new_tier: nextTier,
        recommended_tier: seller.recommended_seller_tier || nextTier,
        trust_score: seller.trust_score || 0,
        change_source: historySource,
        actor_user_id: user.id,
        reason: reason || "Manual tier override",
        metadata: {
          locked: body?.lock !== false,
        },
      });
    }

    const evaluation = await evaluateSellerTrustById(adminClient, sellerId, {
      actorUserId: user.id,
      actorRole: "admin",
      source: "manual",
    });

    await logRelayAuditEvent(adminClient, {
      actorUserId: user.id,
      actorRole: "admin",
      eventType: "seller_tier.override",
      sellerId,
      metadata: {
        action,
        previousTier,
        nextTier,
        reason: reason || null,
        updatePayload,
      },
    });

    return NextResponse.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update trust override" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
