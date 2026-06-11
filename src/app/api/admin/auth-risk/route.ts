import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { logRelayAuditEvent } from "@/lib/relay-audit";

export async function GET() {
  try {
    const { adminClient } = await requireAdminSession();

    const [settingsResult, skusResult, ordersResult] = await Promise.all([
      adminClient
        .from("site_settings")
        .select("id, tier_3_random_audit_rate_bps, updated_at")
        .limit(1)
        .single(),
      adminClient
        .from("high_risk_skus")
        .select("*")
        .order("updated_at", { ascending: false }),
      adminClient
        .from("orders")
        .select(`
          id,
          seller_id,
          status,
          price,
          created_at,
          relay_tag_required,
          checkcheck_required,
          checkcheck_reason,
          checkcheck_status,
          checkcheck_admin_notes,
          random_audit_required,
          high_risk_sku_required,
          auth_requirements_evaluated_at,
          listing:listings(brand, model, sku, sku_normalized),
          seller:profiles!orders_seller_id_fkey(id, username, display_name, full_name, seller_tier)
        `)
        .in("status", ["paid", "auth_submitted"])
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const orderIds = (ordersResult.data || []).map((order) => order.id);
    const [custodyResult, relayTagResult] = await Promise.all([
      orderIds.length > 0
        ? adminClient
            .from("order_chain_of_custody")
            .select("order_id, verification_status, admin_review_required")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length > 0
        ? adminClient
            .from("orders")
            .select("id, relay_tag:relay_tags!orders_relay_tag_id_fkey(status)")
            .in("id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const custodyByOrder = new Map(
      ((custodyResult.data || []) as Array<{ order_id: string; verification_status: string; admin_review_required: boolean }>).map((row) => [row.order_id, row])
    );
    const relayTagByOrder = new Map(
      ((relayTagResult.data || []) as Array<{ id: string; relay_tag?: { status?: string } | Array<{ status?: string }> | null }>).map((row) => {
        const relayTag = Array.isArray(row.relay_tag) ? row.relay_tag[0] : row.relay_tag;
        return [row.id, relayTag];
      })
    );

    const reviewQueue = (ordersResult.data || []).map((order) => {
      const custody = custodyByOrder.get(order.id);
      const relayTag = relayTagByOrder.get(order.id);
      const legacyAuthFlow = !order.auth_requirements_evaluated_at;
      const needsCheckcheckReview =
        order.checkcheck_required &&
        order.checkcheck_status !== "approved" &&
        order.checkcheck_status !== "not_required";
      const needsCustodyReview =
        !legacyAuthFlow &&
        order.relay_tag_required &&
        (
          !custody ||
          custody.admin_review_required ||
          custody.verification_status !== "verified"
        );

      return {
        ...order,
        legacyAuthFlow,
        chainOfCustodyStatus: custody?.verification_status || null,
        chainOfCustodyAdminReviewRequired: Boolean(custody?.admin_review_required),
        relayTagStatus: relayTag?.status || null,
        needsReview: needsCheckcheckReview || needsCustodyReview,
      };
    }).filter((order) => order.needsReview);

    return NextResponse.json({
      settings: settingsResult.data,
      highRiskSkus: skusResult.data || [],
      reviewQueue,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load auth risk admin data" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const action = body?.action as "add_high_risk_sku" | "set_random_audit_rate";

    if (action === "set_random_audit_rate") {
      const rateBps = Number(body?.tier3RandomAuditRateBps);
      if (!Number.isFinite(rateBps) || rateBps < 0 || rateBps > 10000) {
        return NextResponse.json({ error: "Random audit rate must be between 0 and 10000 bps" }, { status: 400 });
      }

      const { data: settings, error: settingsError } = await adminClient
        .from("site_settings")
        .select("id")
        .limit(1)
        .single();

      if (settingsError || !settings) {
        return NextResponse.json({ error: settingsError?.message || "Site settings not found" }, { status: 500 });
      }

      const { error: updateError } = await adminClient
        .from("site_settings")
        .update({
          tier_3_random_audit_rate_bps: rateBps,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      await logRelayAuditEvent(adminClient, {
        actorUserId: user.id,
        actorRole: "admin",
        eventType: "auth_risk.random_audit_rate_updated",
        metadata: { tier3RandomAuditRateBps: rateBps },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "add_high_risk_sku") {
      const sku = String(body?.sku || "").trim();
      const normalizedSku = sku.toUpperCase();
      const riskReason = String(body?.riskReason || "").trim();

      if (!normalizedSku || !riskReason) {
        return NextResponse.json({ error: "SKU and risk reason are required" }, { status: 400 });
      }

      const { data: existing, error: existingError } = await adminClient
        .from("high_risk_skus")
        .select("id")
        .eq("sku_normalized", normalizedSku)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }

      if (existing?.id) {
        const { error: reactivateError } = await adminClient
          .from("high_risk_skus")
          .update({
            display_sku: sku,
            risk_reason: riskReason,
            is_active: true,
            removed_by_admin_id: null,
            removed_at: null,
          })
          .eq("id", existing.id);

        if (reactivateError) {
          return NextResponse.json({ error: reactivateError.message }, { status: 500 });
        }
      } else {
        const { error: insertError } = await adminClient
          .from("high_risk_skus")
          .insert({
            sku_normalized: normalizedSku,
            display_sku: sku,
            risk_reason: riskReason,
            created_by_admin_id: user.id,
          });

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      }

      await logRelayAuditEvent(adminClient, {
        actorUserId: user.id,
        actorRole: "admin",
        eventType: "auth_risk.high_risk_sku_added",
        metadata: {
          skuNormalized: normalizedSku,
          riskReason,
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update auth risk settings" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
