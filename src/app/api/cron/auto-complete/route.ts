import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  evaluateBuyerCompletionEligibility,
  loadBuyerOrderReviewContext,
  markOrderTagCompleted,
} from "@/lib/buyer-order-review";
import { logRelayAuditEvent } from "@/lib/relay-audit";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

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
      .lt("review_deadline", now)
      .is("stripe_transfer_id", null);

    if (queryError) {
      console.error("Auto-complete query error:", queryError);
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

        const { data: payoutOrder, error: payoutOrderError } = await adminClient
          .from("orders")
          .select(
            "id, seller_id, seller_earnings, stripe_transfer_id, relay_tag_id, status"
          )
          .eq("id", candidate.id)
          .single();

        if (payoutOrderError || !payoutOrder) {
          results.push({
            orderId: candidate.id,
            status: "error",
            error: payoutOrderError?.message || "Order not found",
          });
          continue;
        }

        const { data: sellerProfile } = await adminClient
          .from("profiles")
          .select("stripe_account_id")
          .eq("id", payoutOrder.seller_id)
          .single();

        if (!sellerProfile?.stripe_account_id) {
          await adminClient
            .from("orders")
            .update({ status: "payout_failed" })
            .eq("id", payoutOrder.id);

          results.push({
            orderId: payoutOrder.id,
            status: "payout_failed",
            error: "No seller Stripe account",
          });
          continue;
        }

        let transferId = payoutOrder.stripe_transfer_id;
        if (payoutOrder.seller_earnings > 0 && !transferId) {
          const transfer = await stripe.transfers.create(
            {
              amount: Math.round(payoutOrder.seller_earnings * 100),
              currency: "usd",
              destination: sellerProfile.stripe_account_id,
              metadata: {
                orderId: payoutOrder.id,
              },
            },
            {
              idempotencyKey: `order-complete-${payoutOrder.id}`,
            }
          );
          transferId = transfer.id;
        }

        const { error: updateError } = await adminClient
          .from("orders")
          .update({
            status: "completed",
            stripe_transfer_id: transferId,
            seller_funds_frozen: false,
          })
          .eq("id", payoutOrder.id)
          .eq("status", payoutOrder.status);

        if (updateError) {
          console.error(
            `Auto-complete: failed to update order ${payoutOrder.id}:`,
            updateError
          );
          results.push({
            orderId: payoutOrder.id,
            status: "error",
            error: "DB update failed",
          });
          continue;
        }

        await markOrderTagCompleted(adminClient, {
          relayTagId: payoutOrder.relay_tag_id,
          orderId: payoutOrder.id,
        });

        await logRelayAuditEvent(adminClient, {
          actorRole: "system",
          orderId: payoutOrder.id,
          sellerId: payoutOrder.seller_id,
          eventType: "order.auto_completed_after_review_window",
          metadata: {
            reviewDeadlinePassed: true,
          },
        });

        results.push({ orderId: payoutOrder.id, status: "completed" });
      } catch (error) {
        console.error("Auto-complete order error:", candidate.id, error);
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
