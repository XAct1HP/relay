import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  evaluateBuyerCompletionEligibility,
  loadBuyerOrderReviewContext,
  markOrderTagCompleted,
} from "@/lib/buyer-order-review";
import { processOrderPayoutTrigger } from "@/lib/payouts";
import { logRelayAuditEvent } from "@/lib/relay-audit";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    const { data: candidateOrders, error: queryError } = await adminClient
      .from("orders")
      .select("id")
      .in("status", ["delivered", "review_window"])
      .lt("review_deadline", now);

    if (queryError) {
      return NextResponse.json(
        { error: "Failed to query orders" },
        { status: 500 }
      );
    }

    if (!candidateOrders || candidateOrders.length === 0) {
      return NextResponse.json({
        message: "No orders to auto-complete",
        processed: 0,
      });
    }

    const results: { orderId: string; status: string; error?: string }[] = [];

    for (const candidate of candidateOrders) {
      try {
        const reviewContext = await loadBuyerOrderReviewContext(
          adminClient,
          candidate.id
        );
        const eligibility = evaluateBuyerCompletionEligibility(reviewContext);

        if (!eligibility.canAutoComplete) {
          results.push({
            orderId: candidate.id,
            status: "blocked",
            error: eligibility.autoCompleteBlockedReasons.join(" "),
          });
          continue;
        }

        const payoutResult = await processOrderPayoutTrigger(adminClient, {
          orderId: candidate.id,
          trigger: "review_window_expiry",
          actorRole: "system",
        });

        const { data: order, error: orderError } = await adminClient
          .from("orders")
          .select("id, seller_id, relay_tag_id")
          .eq("id", candidate.id)
          .single();

        if (orderError || !order) {
          results.push({
            orderId: candidate.id,
            status: "error",
            error: orderError?.message || "Order not found",
          });
          continue;
        }

        const { error: updateError } = await adminClient
          .from("orders")
          .update({
            status: "completed",
            seller_funds_frozen: false,
          })
          .eq("id", order.id)
          .in("status", ["delivered", "review_window"]);

        if (updateError) {
          results.push({
            orderId: order.id,
            status: "error",
            error: "DB update failed",
          });
          continue;
        }

        await markOrderTagCompleted(adminClient, {
          relayTagId: order.relay_tag_id,
          orderId: order.id,
        });

        await logRelayAuditEvent(adminClient, {
          actorRole: "system",
          orderId: order.id,
          sellerId: order.seller_id,
          eventType: "order.auto_completed_after_review_window",
          metadata: {
            reviewDeadlinePassed: true,
            payoutStepsProcessed: payoutResult.processedSteps.length,
          },
        });

        results.push({ orderId: order.id, status: "completed" });
      } catch (error) {
        results.push({
          orderId: candidate.id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const completed = results.filter((result) => result.status === "completed").length;
    const failed = results.filter((result) => result.status !== "completed").length;

    return NextResponse.json({
      message: `Auto-complete finished: ${completed} completed, ${failed} blocked or failed`,
      processed: results.length,
      completed,
      failed,
      results,
    });
  } catch (error) {
    console.error("Auto-complete cron error:", error);
    return NextResponse.json(
      { error: "Auto-complete cron failed" },
      { status: 500 }
    );
  }
}
