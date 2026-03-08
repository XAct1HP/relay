import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new NextResponse("Webhook Error", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const listingId = session.metadata?.listing_id;
    const buyerId = session.metadata?.buyer_id;
    const sellerId = session.metadata?.seller_id;
    const amountCents = Number(session.metadata?.amount_cents ?? "0");
    const relayFeeCents = Number(session.metadata?.relay_fee_cents ?? "0");
    const offerId = session.metadata?.offer_id || null;

    console.log("Webhook received checkout.session.completed", {
      listingId,
      buyerId,
      sellerId,
      amountCents,
      relayFeeCents,
      offerId,
      sessionId: session.id,
    });

    if (listingId && buyerId && sellerId && amountCents > 0) {
      const { data: existingOrder, error: existingOrderError } =
        await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("listing_id", listingId)
          .maybeSingle();

      if (existingOrderError) {
        console.error("Failed checking existing order:", existingOrderError);
        return new NextResponse("Database error", { status: 500 });
      }

      if (!existingOrder) {
        const { error: insertError } = await supabaseAdmin.from("orders").insert({
          listing_id: listingId,
          buyer_id: buyerId,
          seller_id: sellerId,
          amount_cents: amountCents,
          relay_fee_cents: relayFeeCents,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          status: "paid",
        });

        if (insertError) {
          console.error("Failed to insert order after checkout:", insertError);
          return new NextResponse("Database error", { status: 500 });
        }

        console.log("Order inserted successfully for listing:", listingId);
      } else {
        console.log("Order already exists for listing:", listingId);
      }

      if (offerId) {
        const { error: acceptOfferError } = await supabaseAdmin
          .from("offers")
          .update({ status: "accepted" })
          .eq("id", offerId);

        if (acceptOfferError) {
          console.error("Failed to mark offer accepted:", acceptOfferError);
        }

        const { error: cancelOtherOffersError } = await supabaseAdmin
          .from("offers")
          .update({ status: "cancelled" })
          .eq("listing_id", listingId)
          .eq("status", "pending")
          .neq("id", offerId);

        if (cancelOtherOffersError) {
          console.error("Failed to cancel other offers:", cancelOtherOffersError);
        }
      }

      const { error: deleteLockError } = await supabaseAdmin
        .from("checkout_locks")
        .delete()
        .eq("listing_id", listingId);

      if (deleteLockError) {
        console.error("Failed to delete checkout lock after success:", deleteLockError);
      }
    } else {
      console.error("Missing webhook metadata:", {
        listingId,
        buyerId,
        sellerId,
        amountCents,
        relayFeeCents,
        offerId,
      });
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const listingId = session.metadata?.listing_id;
    const offerId = session.metadata?.offer_id || null;

    console.log("Webhook received checkout.session.expired", {
      listingId,
      offerId,
      sessionId: session.id,
    });

    if (listingId) {
      const { error: deleteLockError } = await supabaseAdmin
        .from("checkout_locks")
        .delete()
        .eq("listing_id", listingId);

      if (deleteLockError) {
        console.error("Failed to delete checkout lock after expiration:", deleteLockError);
        return new NextResponse("Database error", { status: 500 });
      }
    }

    if (offerId) {
      const { error: expireOfferError } = await supabaseAdmin
        .from("offers")
        .update({ status: "expired" })
        .eq("id", offerId)
        .eq("status", "pending");

      if (expireOfferError) {
        console.error("Failed to expire offer after session expiration:", expireOfferError);
      }
    }
  }

  return NextResponse.json({ received: true });
}