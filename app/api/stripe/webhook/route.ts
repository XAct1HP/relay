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
    const shippingAmountCents = Number(session.metadata?.shipping_amount_cents ?? "0");
    const relayFeeCents = Number(session.metadata?.relay_fee_cents ?? "0");
    const offerId = session.metadata?.offer_id || null;

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

      const { data: lock, error: lockError } = await supabaseAdmin
        .from("checkout_locks")
        .select(
          "shipping_address_json, shipping_amount_cents, shippo_shipment_id, shippo_rate_id"
        )
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      if (lockError) {
        console.error("Failed loading checkout lock:", lockError);
        return new NextResponse("Database error", { status: 500 });
      }

      if (!existingOrder) {
        const { error: insertError } = await supabaseAdmin.from("orders").insert({
          listing_id: listingId,
          buyer_id: buyerId,
          seller_id: sellerId,
          amount_cents: amountCents,
          shipping_amount_cents: lock?.shipping_amount_cents ?? shippingAmountCents,
          total_amount_cents:
            amountCents + (lock?.shipping_amount_cents ?? shippingAmountCents),
          relay_fee_cents: relayFeeCents,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          shipping_address_json: lock?.shipping_address_json ?? null,
          shippo_shipment_id: lock?.shippo_shipment_id ?? null,
          shippo_rate_id: lock?.shippo_rate_id ?? null,
          status: "paid",
        });

        if (insertError) {
          console.error("Failed to insert order after checkout:", insertError);
          return new NextResponse("Database error", { status: 500 });
        }
      }

      await supabaseAdmin
        .from("listings")
        .update({ status: "sold" })
        .eq("id", listingId);

      if (offerId) {
        await supabaseAdmin
          .from("offers")
          .update({ status: "accepted" })
          .eq("id", offerId);

        await supabaseAdmin
          .from("offers")
          .update({ status: "cancelled" })
          .eq("listing_id", listingId)
          .eq("status", "pending")
          .neq("id", offerId);
      }

      await supabaseAdmin
        .from("checkout_locks")
        .delete()
        .eq("listing_id", listingId);
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const listingId = session.metadata?.listing_id;
    const offerId = session.metadata?.offer_id || null;

    if (listingId) {
      await supabaseAdmin
        .from("checkout_locks")
        .delete()
        .eq("listing_id", listingId);
    }

    if (offerId) {
      await supabaseAdmin
        .from("offers")
        .update({ status: "expired" })
        .eq("id", offerId)
        .eq("status", "pending");
    }
  }

  return NextResponse.json({ received: true });
}