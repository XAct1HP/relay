import { NextResponse } from "next/server";
import { calculateSellerProceeds, calculateStripeFeeEstimateCents } from "@/lib/money-policy";
import { requireSellerSession } from "@/lib/seller-access";
import { formatListingTitle } from "@/lib/listing-display";

function toDollars(value: number) {
  return Math.round((value / 100) * 100) / 100;
}

function dollarsToCents(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric * 100);
}

function resolveOrderSubtotalCents(order: {
  price?: number | string | null;
}) {
  return dollarsToCents(order.price);
}

function resolveSellerProceedsCents(order: {
  price?: number | string | null;
  seller_earnings?: number | string | null;
  seller_proceeds_cents?: number | null;
  stripe_fee_estimate_cents?: number | null;
}) {
  if (typeof order.seller_proceeds_cents === "number") {
    return Math.max(0, Math.round(order.seller_proceeds_cents));
  }

  if (order.seller_earnings !== null && order.seller_earnings !== undefined) {
    return dollarsToCents(order.seller_earnings);
  }

  const subtotalCents = resolveOrderSubtotalCents(order);
  const stripeFeeCents =
    typeof order.stripe_fee_estimate_cents === "number"
      ? Math.max(0, Math.round(order.stripe_fee_estimate_cents))
      : calculateStripeFeeEstimateCents(subtotalCents);

  return calculateSellerProceeds(subtotalCents, stripeFeeCents);
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
  });
}

export async function GET() {
  try {
    const { user, adminClient } = await requireSellerSession();

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      ordersResult,
      activeListingsCountResult,
      newListingsThisMonthCountResult,
      recentConversationsResult,
      totalConversationsCountResult,
      reviewsResult,
    ] = await Promise.all([
      adminClient
        .from("orders")
        .select(
          "id, listing_id, buyer_id, status, price, seller_earnings, seller_proceeds_cents, stripe_fee_estimate_cents, created_at, updated_at"
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false }),
      adminClient
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .eq("status", "active"),
      adminClient
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .eq("status", "active")
        .gte("created_at", thisMonthStart.toISOString()),
      adminClient
        .from("conversations")
        .select("id, participant_ids, last_message, last_message_at, created_at")
        .contains("participant_ids", [user.id])
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(5),
      adminClient
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .contains("participant_ids", [user.id]),
      adminClient.from("reviews").select("rating").eq("seller_id", user.id),
    ]);

    if (ordersResult.error) {
      throw new Error(ordersResult.error.message || "Failed to load seller orders");
    }

    if (activeListingsCountResult.error) {
      throw new Error(
        activeListingsCountResult.error.message || "Failed to load listing totals"
      );
    }

    if (newListingsThisMonthCountResult.error) {
      throw new Error(
        newListingsThisMonthCountResult.error.message ||
          "Failed to load listing trend data"
      );
    }

    if (recentConversationsResult.error) {
      throw new Error(
        recentConversationsResult.error.message || "Failed to load recent conversations"
      );
    }

    if (totalConversationsCountResult.error) {
      throw new Error(
        totalConversationsCountResult.error.message || "Failed to load conversation count"
      );
    }

    if (reviewsResult.error) {
      throw new Error(reviewsResult.error.message || "Failed to load seller reviews");
    }

    const orders = ordersResult.data || [];
    const reviews = reviewsResult.data || [];
    const recentConversations = recentConversationsResult.data || [];

    const listingIds = Array.from(
      new Set(orders.map((order) => order.listing_id).filter(Boolean))
    );
    const buyerIds = Array.from(
      new Set(orders.map((order) => order.buyer_id).filter(Boolean))
    );
    const conversationPartnerIds = Array.from(
      new Set(
        recentConversations
          .flatMap((conversation) => conversation.participant_ids || [])
          .filter((participantId) => participantId && participantId !== user.id)
      )
    );
    const profileIds = Array.from(new Set([...buyerIds, ...conversationPartnerIds]));

    const [listingRowsResult, profileRowsResult] = await Promise.all([
      listingIds.length > 0
        ? adminClient
            .from("listings")
            .select("id, brand, model")
            .in("id", listingIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length > 0
        ? adminClient
            .from("profiles")
            .select("id, display_name, full_name, avatar_url")
            .in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (listingRowsResult.error) {
      throw new Error(listingRowsResult.error.message || "Failed to load listing details");
    }

    if (profileRowsResult.error) {
      throw new Error(profileRowsResult.error.message || "Failed to load profile details");
    }

    const listingMap = new Map(
      (listingRowsResult.data || []).map((listing) => [listing.id, listing])
    );
    const profileMap = new Map(
      (profileRowsResult.data || []).map((profile) => [profile.id, profile])
    );

    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
        : 0;

    const completedOrders = orders.filter((order) => order.status === "completed");
    const totalRevenueCents = completedOrders.reduce(
      (sum, order) => sum + resolveSellerProceedsCents(order),
      0
    );
    const averageOrderValueCents =
      completedOrders.length > 0 ? Math.round(totalRevenueCents / completedOrders.length) : 0;

    const thisMonthOrders = orders.filter(
      (order) => new Date(order.created_at).getTime() >= thisMonthStart.getTime()
    );
    const lastMonthOrders = orders.filter((order) => {
      const createdAt = new Date(order.created_at);
      return createdAt >= lastMonthStart && createdAt <= lastMonthEnd;
    });

    const thisMonthRevenueCents = completedOrders
      .filter((order) => new Date(order.updated_at || order.created_at) >= thisMonthStart)
      .reduce((sum, order) => sum + resolveSellerProceedsCents(order), 0);

    const lastMonthRevenueCents = completedOrders
      .filter((order) => {
        const completedAt = new Date(order.updated_at || order.created_at);
        return completedAt >= lastMonthStart && completedAt <= lastMonthEnd;
      })
      .reduce((sum, order) => sum + resolveSellerProceedsCents(order), 0);

    const revenueTrendPct =
      lastMonthRevenueCents > 0
        ? ((thisMonthRevenueCents - lastMonthRevenueCents) / lastMonthRevenueCents) * 100
        : thisMonthRevenueCents > 0
          ? 100
          : 0;

    const ordersTrendPct =
      lastMonthOrders.length > 0
        ? ((thisMonthOrders.length - lastMonthOrders.length) / lastMonthOrders.length) * 100
        : thisMonthOrders.length > 0
          ? 100
          : 0;

    const monthlyRevenue = new Map<string, { month: string; revenue: number; orders: number }>();
    completedOrders.forEach((order) => {
      const completedAt = new Date(order.updated_at || order.created_at);
      const key = getMonthKey(completedAt);
      const existing = monthlyRevenue.get(key) || {
        month: getMonthLabel(completedAt),
        revenue: 0,
        orders: 0,
      };

      existing.revenue += toDollars(resolveSellerProceedsCents(order));
      existing.orders += 1;
      monthlyRevenue.set(key, existing);
    });

    const chartData = Array.from(monthlyRevenue.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-6)
      .map(([, value]) => value);

    const recentOrders = orders.slice(0, 5).map((order) => {
      const listing = order.listing_id ? listingMap.get(order.listing_id) : null;
      const buyer = order.buyer_id ? profileMap.get(order.buyer_id) : null;

      return {
        id: order.id,
        shoe:
          listing?.brand && listing?.model
            ? formatListingTitle(listing.brand, listing.model, undefined, "Unknown Shoe")
            : "Unknown Shoe",
        price: Number(order.price || 0),
        buyer:
          buyer?.display_name || buyer?.full_name || "Unknown Buyer",
        date: order.created_at,
        status: order.status,
      };
    });

    const recentMessages = recentConversations.map((conversation) => {
      const otherUserId = (conversation.participant_ids || []).find(
        (participantId: string) => participantId !== user.id
      );
      const otherUser = otherUserId ? profileMap.get(otherUserId) : null;
      const name =
        otherUser?.display_name || otherUser?.full_name || "Unknown User";

      return {
        id: conversation.id,
        name,
        lastMessage: conversation.last_message || "No messages yet",
        time: conversation.last_message_at || conversation.created_at || new Date().toISOString(),
        avatar: name.charAt(0).toUpperCase() || "U",
        avatarUrl: otherUser?.avatar_url || null,
      };
    });

    return NextResponse.json({
      metrics: {
        totalRevenue: toDollars(totalRevenueCents),
        activeListings: activeListingsCountResult.count || 0,
        ordersThisMonth: thisMonthOrders.length,
        sellerRating: Math.round(averageRating * 10) / 10,
        totalSales: completedOrders.length,
        avgOrderValue: toDollars(averageOrderValueCents),
        revenueTrend: {
          direction: revenueTrendPct >= 0 ? "up" : "down",
          value: `${revenueTrendPct >= 0 ? "+" : ""}${revenueTrendPct.toFixed(1)}%`,
        },
        listingsTrend: {
          direction: "up",
          value: `+${newListingsThisMonthCountResult.count || 0}`,
        },
        ordersTrend: {
          direction: ordersTrendPct >= 0 ? "up" : "down",
          value: `${ordersTrendPct >= 0 ? "+" : ""}${ordersTrendPct.toFixed(0)}%`,
        },
        ratingTrend: {
          direction: "up",
          value: reviews.length > 0 ? `${reviews.length} reviews` : "No reviews",
        },
        totalConversations: totalConversationsCountResult.count || 0,
      },
      chartData,
      recentOrders,
      recentMessages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load seller dashboard";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 }
    );
  }
}
