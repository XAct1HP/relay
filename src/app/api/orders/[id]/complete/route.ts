import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  evaluateBuyerCompletionEligibility,
  loadBuyerOrderReviewContext,
  markBuyerCustodyVerified,
  markOrderTagCompleted,
} from "@/lib/buyer-order-review";
import { processOrderPayoutTrigger } from "@/lib/payouts";
import { logRelayAuditEvent } from "@/lib/relay-audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createServerClientInstance();
    const adminClient = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const rating = Number(body?.rating);
    const comment =
      typeof body?.comment === "string" && body.comment.trim().length > 0
        ? body.comment.trim()
        : null;

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating is required and must be between 1 and 5" },
        { status: 400 }
      );
    }

    const reviewContext = await loadBuyerOrderReviewContext(adminClient, orderId);
    if (reviewContext.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "Only the buyer can complete this order" },
        { status: 403 }
      );
    }

    if (reviewContext.status === "completed") {
      return NextResponse.json({ message: "Order already completed" });
    }

    const eligibility = evaluateBuyerCompletionEligibility(reviewContext);
    if (!eligibility.canComplete) {
      return NextResponse.json(
        {
          error: eligibility.blockedReasons[0] || "Order cannot be completed yet",
          blockedReasons: eligibility.blockedReasons,
          requiresBuyerCustody: eligibility.requiresBuyerCustody,
          legacyFlow: eligibility.legacyFlow,
        },
        { status: 400 }
      );
    }

    const { data: existingReview } = await adminClient
      .from("reviews")
      .select("id")
      .eq("order_id", orderId)
      .eq("reviewer_id", user.id)
      .maybeSingle();

    if (existingReview?.id) {
      const { error: reviewUpdateError } = await adminClient
        .from("reviews")
        .update({
          rating,
          comment,
        })
        .eq("id", existingReview.id);

      if (reviewUpdateError) {
        return NextResponse.json(
          { error: "Failed to update review" },
          { status: 500 }
        );
      }
    } else {
      const { error: reviewInsertError } = await adminClient.from("reviews").insert({
        order_id: orderId,
        reviewer_id: user.id,
        seller_id: reviewContext.seller_id,
        rating,
        comment,
      });

      if (reviewInsertError) {
        return NextResponse.json(
          { error: "Failed to create review" },
          { status: 500 }
        );
      }
    }

    if (eligibility.requiresBuyerCustody && eligibility.chainStatus.status === "verified") {
      await markBuyerCustodyVerified(adminClient, {
        orderId,
        sellerId: reviewContext.seller_id,
        actorUserId: user.id,
      });
    }

    const payoutResult = await processOrderPayoutTrigger(adminClient, {
      orderId,
      trigger: "buyer_confirmation",
      actorUserId: user.id,
      actorRole: "buyer",
    });

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, seller_id, relay_tag_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { error: updateError } = await adminClient
      .from("orders")
      .update({
        status: "completed",
        review_rating: rating,
        review_comment: comment,
        seller_funds_frozen: false,
      })
      .eq("id", orderId)
      .in("status", ["delivered", "review_window"]);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update order" },
        { status: 500 }
      );
    }

    await markOrderTagCompleted(adminClient, {
      relayTagId: order.relay_tag_id,
      orderId,
    });

    await logRelayAuditEvent(adminClient, {
      actorUserId: user.id,
      actorRole: "buyer",
      orderId,
      sellerId: order.seller_id,
      eventType: "order.completed_by_buyer",
      metadata: {
        rating,
        reviewWindowExpired: eligibility.reviewWindowExpired,
        payoutStepsProcessed: payoutResult.processedSteps.length,
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: orderId,
        status: "completed",
        review_rating: rating,
        review_comment: comment,
      },
    });
  } catch (error) {
    console.error("Order completion error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to complete order",
      },
      { status: 500 }
    );
  }
}
