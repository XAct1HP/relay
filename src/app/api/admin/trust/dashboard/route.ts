import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";

export async function GET() {
  try {
    const { adminClient } = await requireAdminSession();

    const [
      sellersResult,
      relayBalancesResult,
      disputesResult,
      legacyDisputedOrdersResult,
      custodyReviewResult,
      checkcheckReviewResult,
      tagReviewResult,
      tagsResult,
    ] = await Promise.all([
      adminClient
        .from("profiles")
        .select(`
          id,
          email,
          display_name,
          full_name,
          username,
          seller_tier,
          recommended_seller_tier,
          trust_score,
          recommended_trust_score,
          completed_order_count,
          lifetime_gmv_cents,
          trailing_180d_order_count,
          trailing_180d_dispute_count,
          buyer_completion_rate_bps,
          authenticity_violation_count,
          tier_locked,
          is_founding_seller,
          tier_3_approved_at,
          is_banned,
          tier_last_evaluated_at
        `)
        .eq("role", "seller")
        .order("trust_score", { ascending: false }),
      adminClient
        .from("relay_balances")
        .select("seller_id, pending_balance_cents, available_balance_cents, exposure_cents, admin_frozen"),
      adminClient
        .from("order_disputes")
        .select("id, order_id, seller_id, category, status")
        .in("status", ["open", "seller_responded", "under_review"]),
      adminClient
        .from("orders")
        .select("id, seller_id, status")
        .eq("status", "disputed"),
      adminClient
        .from("order_chain_of_custody")
        .select("order_id, verification_status, admin_review_required"),
      adminClient
        .from("orders")
        .select("id, seller_id, checkcheck_status, random_audit_required")
        .eq("checkcheck_status", "admin_review"),
      adminClient
        .from("relay_tags")
        .select("id, assigned_seller_id, assigned_order_id, status, photo_verification_status")
        .eq("photo_verification_status", "admin_review"),
      adminClient
        .from("relay_tags")
        .select("id, assigned_seller_id, status"),
    ]);

    if (sellersResult.error) {
      throw new Error(sellersResult.error.message);
    }

    const sellers = sellersResult.data || [];
    const relayBalanceBySeller = new Map(
      (relayBalancesResult.data || []).map((entry) => [entry.seller_id, entry])
    );
    const openDisputes = disputesResult.data || [];
    const legacyDisputedOrders = legacyDisputedOrdersResult.data || [];
    const custodyReviewOrders = (custodyReviewResult.data || []).filter(
      (entry) => entry.admin_review_required || entry.verification_status === "admin_review"
    );
    const checkcheckReviewOrders = checkcheckReviewResult.data || [];
    const tagReviewRows = tagReviewResult.data || [];
    const allTags = tagsResult.data || [];

    const sellersWithSummary = sellers.map((seller) => {
      const relayBalance = relayBalanceBySeller.get(seller.id);
      const disputes =
        openDisputes.filter((dispute) => dispute.seller_id === seller.id).length +
        legacyDisputedOrders.filter((order) => order.seller_id === seller.id).length;
      const reviewOrders =
        custodyReviewOrders.filter((entry) => {
          const matchingOrder = checkcheckReviewOrders.find((order) => order.id === entry.order_id);
          return matchingOrder?.seller_id === seller.id;
        }).length +
        checkcheckReviewOrders.filter((order) => order.seller_id === seller.id).length +
        tagReviewRows.filter((tag) => tag.assigned_seller_id === seller.id).length;

      return {
        ...seller,
        pending_balance_cents: relayBalance?.pending_balance_cents || 0,
        available_balance_cents: relayBalance?.available_balance_cents || 0,
        exposure_cents: relayBalance?.exposure_cents || 0,
        withdrawable_balance_cents: relayBalance?.admin_frozen
          ? 0
          : relayBalance?.available_balance_cents || 0,
        open_dispute_count: disputes,
        review_queue_count: reviewOrders,
        tag_inventory_count: allTags.filter((tag) => tag.assigned_seller_id === seller.id).length,
      };
    });

    const pendingTier3Approvals = sellersWithSummary.filter(
      (seller) =>
        seller.recommended_seller_tier === "tier_3" &&
        !seller.tier_3_approved_at
    ).length;

    return NextResponse.json({
      sellers: sellersWithSummary,
      metrics: {
        sellerCount: sellersWithSummary.length,
        tier1Count: sellersWithSummary.filter((seller) => seller.seller_tier === "tier_1").length,
        tier2Count: sellersWithSummary.filter((seller) => seller.seller_tier === "tier_2").length,
        tier3Count: sellersWithSummary.filter((seller) => seller.seller_tier === "tier_3").length,
        lockedCount: sellersWithSummary.filter((seller) => seller.tier_locked).length,
        foundingSellerCount: sellersWithSummary.filter((seller) => seller.is_founding_seller).length,
        bannedSellerCount: sellersWithSummary.filter((seller) => seller.is_banned).length,
        pendingTier3Approvals,
        openDisputeCount: openDisputes.length + legacyDisputedOrders.length,
        custodyReviewCount: custodyReviewOrders.length,
        checkcheckReviewCount: checkcheckReviewOrders.length,
        tagReviewCount: tagReviewRows.length,
        totalPendingBalanceCents: (relayBalancesResult.data || []).reduce(
          (sum, entry) => sum + (entry.pending_balance_cents || 0),
          0
        ),
        totalAvailableBalanceCents: (relayBalancesResult.data || []).reduce(
          (sum, entry) => sum + (entry.available_balance_cents || 0),
          0
        ),
        totalExposureCents: (relayBalancesResult.data || []).reduce(
          (sum, entry) => sum + (entry.exposure_cents || 0),
          0
        ),
        totalWithdrawableBalanceCents: (relayBalancesResult.data || []).reduce(
          (sum, entry) => sum + (entry.admin_frozen ? 0 : entry.available_balance_cents || 0),
          0
        ),
        totalTagInventory: allTags.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load trust dashboard" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
