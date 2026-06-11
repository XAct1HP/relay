import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sellerId } = await params;
    const { adminClient } = await requireAdminSession();

    const [
      sellerResult,
      reserveAccountResult,
      reserveEntriesResult,
      tierHistoryResult,
      evaluationsResult,
      violationsResult,
      tagsResult,
      reviewOrdersResult,
    ] = await Promise.all([
      adminClient.from("profiles").select("*").eq("id", sellerId).single(),
      adminClient.from("seller_reserve_accounts").select("*").eq("seller_id", sellerId).maybeSingle(),
      adminClient
        .from("seller_reserve_entries")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(25),
      adminClient
        .from("seller_tier_history")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(50),
      adminClient
        .from("seller_trust_evaluations")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(25),
      adminClient
        .from("seller_violations")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(25),
      adminClient
        .from("relay_tags")
        .select("*")
        .eq("assigned_seller_id", sellerId)
        .order("created_at", { ascending: false }),
      adminClient
        .from("orders")
        .select(`
          id,
          seller_id,
          status,
          price,
          created_at,
          checkcheck_status,
          random_audit_required,
          high_risk_sku_required,
          listing:listings(brand, model)
        `)
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (sellerResult.error || !sellerResult.data) {
      throw new Error(sellerResult.error?.message || "Seller not found");
    }

    const seller = sellerResult.data;
    const orderIds = (reviewOrdersResult.data || []).map((order) => order.id);
    const [custodyRowsResult, disputeRowsResult] = await Promise.all([
      orderIds.length > 0
        ? adminClient
            .from("order_chain_of_custody")
            .select("order_id, verification_status, admin_review_required")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length > 0
        ? adminClient
            .from("order_disputes")
            .select("order_id, category, status")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const custodyByOrder = new Map(
      ((custodyRowsResult.data || []) as Array<{ order_id: string; verification_status: string; admin_review_required: boolean }>).map((row) => [row.order_id, row])
    );
    const disputeByOrder = new Map(
      ((disputeRowsResult.data || []) as Array<{ order_id: string; category: string; status: string }>).map((row) => [row.order_id, row])
    );

    const reviewOrders = (reviewOrdersResult.data || []).filter((order) => {
      const custody = custodyByOrder.get(order.id);
      const dispute = disputeByOrder.get(order.id);

      return (
        order.checkcheck_status === "admin_review" ||
        order.status === "disputed" ||
        order.random_audit_required ||
        custody?.admin_review_required ||
        custody?.verification_status === "admin_review" ||
        dispute?.status === "open" ||
        dispute?.status === "under_review"
      );
    });

    return NextResponse.json({
      seller,
      reserveAccount: reserveAccountResult.data || null,
      reserveEntries: reserveEntriesResult.data || [],
      tierHistory: tierHistoryResult.data || [],
      evaluations: evaluationsResult.data || [],
      violations: violationsResult.data || [],
      tags: tagsResult.data || [],
      reviewOrders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load seller trust details" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
