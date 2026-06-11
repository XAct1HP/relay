import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { logRelayAuditEvent } from "@/lib/relay-audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const status = body?.status as "approved" | "fulfilled" | "rejected";

    if (!["approved", "fulfilled", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const { data: updatedRequest, error } = await adminClient
      .from("seller_tag_requests")
      .update({
        status,
        admin_notes: typeof body?.adminNotes === "string" ? body.adminNotes : null,
        reviewed_by_admin_id: user.id,
        reviewed_at: nowIso,
        fulfilled_at: status === "fulfilled" ? nowIso : null,
      })
      .eq("id", requestId)
      .select("*")
      .single();

    if (error || !updatedRequest) {
      return NextResponse.json({ error: error?.message || "Failed to update tag request" }, { status: 500 });
    }

    await logRelayAuditEvent(adminClient, {
      actorUserId: user.id,
      actorRole: "admin",
      eventType: `relay_tag.request_${status}`,
      sellerId: updatedRequest.seller_id,
      metadata: {
        requestId,
        requestedQuantity: updatedRequest.requested_quantity,
      },
    });

    return NextResponse.json(updatedRequest);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update tag request" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
