import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { logRelayAuditEvent } from "@/lib/relay-audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const action = body?.action as "remove";

    if (action !== "remove") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { data: sku, error: skuError } = await adminClient
      .from("high_risk_skus")
      .select("*")
      .eq("id", id)
      .single();

    if (skuError || !sku) {
      return NextResponse.json({ error: skuError?.message || "High-risk SKU not found" }, { status: 404 });
    }

    const { error: updateError } = await adminClient
      .from("high_risk_skus")
      .update({
        is_active: false,
        removed_by_admin_id: user.id,
        removed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await logRelayAuditEvent(adminClient, {
      actorUserId: user.id,
      actorRole: "admin",
      eventType: "auth_risk.high_risk_sku_removed",
      metadata: {
        skuId: id,
        skuNormalized: sku.sku_normalized,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove high-risk SKU" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
