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
      identityProfileResult,
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
        .from("seller_identity_profiles")
        .select("*")
        .eq("seller_id", sellerId)
        .maybeSingle(),
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
          payout_status,
          seller_amount_paid_cents,
          seller_amount_held_in_reserve_cents,
          seller_amount_frozen_cents,
          seller_amount_refunded_cents,
          payout_frozen_at,
          payout_last_trigger,
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
    const [custodyRowsResult, disputeRowsResult, payoutRowsResult, reserveByOrderResult] = await Promise.all([
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
      orderIds.length > 0
        ? adminClient
            .from("order_payouts")
            .select("*")
            .in("order_id", orderIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      orderIds.length > 0
        ? adminClient
            .from("seller_reserve_entries")
            .select("order_id, amount_cents, status, release_eligible_at, entry_type, is_frozen")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const custodyByOrder = new Map(
      ((custodyRowsResult.data || []) as Array<{ order_id: string; verification_status: string; admin_review_required: boolean }>).map((row) => [row.order_id, row])
    );
    const disputeByOrder = new Map(
      ((disputeRowsResult.data || []) as Array<{ order_id: string; category: string; status: string }>).map((row) => [row.order_id, row])
    );
    const payoutRowsByOrder = new Map<string, any[]>();
    for (const row of payoutRowsResult.data || []) {
      const bucket = payoutRowsByOrder.get(row.order_id) || [];
      bucket.push(row);
      payoutRowsByOrder.set(row.order_id, bucket);
    }
    const reserveRowsByOrder = new Map<string, any[]>();
    for (const row of reserveByOrderResult.data || []) {
      const bucket = reserveRowsByOrder.get(row.order_id) || [];
      bucket.push(row);
      reserveRowsByOrder.set(row.order_id, bucket);
    }

    const recentOrders = (reviewOrdersResult.data || []).map((order) => {
      const reserveRows = reserveRowsByOrder.get(order.id) || [];
      const heldReserveCents = reserveRows.reduce((sum, row) => {
        return row.status === "held" ? sum + (row.amount_cents || 0) : sum;
      }, 0);
      const consumedReserveCents = reserveRows.reduce((sum, row) => {
        return row.status === "consumed" ? sum + (row.amount_cents || 0) : sum;
      }, 0);
      const nextReserveReleaseAt = reserveRows
        .filter((row) => row.status === "held" && row.release_eligible_at)
        .map((row) => row.release_eligible_at as string)
        .sort()[0] || null;

      return {
        ...order,
        orderPayouts: payoutRowsByOrder.get(order.id) || [],
        heldReserveCents,
        consumedReserveCents,
        frozenReserveCents: reserveRows.reduce((sum, row) => {
          return row.is_frozen ? sum + (row.amount_cents || 0) : sum;
        }, 0),
        nextReserveReleaseAt,
      };
    });

    const reviewOrders = recentOrders.filter((order) => {
      const custody = custodyByOrder.get(order.id);
      const dispute = disputeByOrder.get(order.id);

      return (
        order.checkcheck_status === "admin_review" ||
        order.status === "disputed" ||
        order.payout_status === "frozen" ||
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
      identityProfile: identityProfileResult.data || null,
      tierHistory: tierHistoryResult.data || [],
      evaluations: evaluationsResult.data || [],
      violations: violationsResult.data || [],
      tags: tagsResult.data || [],
      recentOrders,
      reviewOrders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load seller trust details" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
