import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { logRelayAuditEvent } from "@/lib/relay-audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tagId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const action = body?.action as "assign" | "void" | "unassign";

    const { data: tag, error: tagError } = await adminClient
      .from("relay_tags")
      .select("*")
      .eq("id", tagId)
      .single();

    if (tagError || !tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    const isUsedTag = [
      "bound_to_order",
      "submitted_by_seller",
      "shipped",
      "buyer_scanned",
      "completed",
      "disputed",
    ].includes(tag.status);

    let updatePayload: Record<string, unknown> = {};

    if (action === "assign") {
      if (isUsedTag || tag.assigned_order_id) {
        return NextResponse.json({ error: "Used Relay tags cannot be reassigned" }, { status: 400 });
      }

      if (tag.status === "voided") {
        return NextResponse.json({ error: "Voided Relay tags cannot be reassigned" }, { status: 400 });
      }

      const sellerId = typeof body?.sellerId === "string" ? body.sellerId : null;
      if (!sellerId) {
        return NextResponse.json({ error: "sellerId is required" }, { status: 400 });
      }

      updatePayload = {
        assigned_seller_id: sellerId,
        assigned_to_seller_at: new Date().toISOString(),
        assigned_by_admin_id: user.id,
        status: "assigned_to_seller",
      };
    } else if (action === "void") {
      if (isUsedTag || tag.assigned_order_id) {
        return NextResponse.json({ error: "Used Relay tags cannot be voided from inventory" }, { status: 400 });
      }

      updatePayload = {
        status: "voided",
        voided_at: new Date().toISOString(),
        voided_by_admin_id: user.id,
        void_reason: typeof body?.reason === "string" ? body.reason : null,
      };
    } else if (action === "unassign") {
      if (isUsedTag || tag.assigned_order_id) {
        return NextResponse.json({ error: "Used Relay tags cannot be unassigned" }, { status: 400 });
      }

      if (tag.status === "voided") {
        return NextResponse.json({ error: "Voided Relay tags cannot be unassigned" }, { status: 400 });
      }

      updatePayload = {
        assigned_seller_id: null,
        assigned_order_id: null,
        assigned_to_seller_at: null,
        assigned_by_admin_id: null,
        status: "unassigned",
      };
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { data: updatedTag, error: updateError } = await adminClient
      .from("relay_tags")
      .update(updatePayload)
      .eq("id", tagId)
      .select("*")
      .single();

    if (updateError || !updatedTag) {
      return NextResponse.json({ error: updateError?.message || "Failed to update tag" }, { status: 500 });
    }

    await logRelayAuditEvent(adminClient, {
      actorUserId: user.id,
      actorRole: "admin",
      eventType:
        action === "assign"
          ? "relay_tag.assigned"
          : action === "void"
            ? "relay_tag.voided"
            : "relay_tag.unassigned",
      sellerId: (updatePayload.assigned_seller_id as string | null) || tag.assigned_seller_id || null,
      orderId: tag.assigned_order_id || null,
      metadata: {
        relayTagId: tagId,
        reason: typeof body?.reason === "string" ? body.reason : null,
      },
    });

    return NextResponse.json(updatedTag);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update Relay tag" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
