import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const listingId = body.listingId as string | undefined;

    if (!listingId) {
      return NextResponse.json({ error: "Missing listingId" }, { status: 400 });
    }

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, brand, model, nickname, price_cents, seller_id, status")
      .eq("id", listingId)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.seller_id === user.id) {
      return NextResponse.json(
        { error: "You cannot buy your own listing." },
        { status: 400 }
      );
    }

    if (listing.status !== "active") {
      return NextResponse.json(
        { error: "Listing is no longer available." },
        { status: 400 }
      );
    }

    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("listing_id", listing.id)
      .maybeSingle();

    if (existingOrder) {
      return NextResponse.json(
        { error: "An order already exists for this listing." },
        { status: 400 }
      );
    }

    const { data: sellerProfile, error: sellerProfileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, username")
      .eq("id", listing.seller_id)
      .single();

    if (sellerProfileError || !sellerProfile) {
      return NextResponse.json(
        { error: "Seller profile not found." },
        { status: 404 }
      );
    }

    if (!sellerProfile.stripe_account_id) {
      return NextResponse.json(
        { error: "Seller has not enabled payouts yet." },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: lockError } = await supabaseAdmin
      .from("checkout_locks")
      .insert({
        listing_id: listing.id,
        buyer_id: user.id,
        expires_at: expiresAt,
      });

    if (lockError) {
      return NextResponse.json(
        { error: "This listing is currently being purchased by another buyer." },
        { status: 409 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const relayFee = Math.round(listing.price_cents * 0.03);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/listings/${listing.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: listing.price_cents,
            product_data: {
              name: `${listing.brand} ${listing.model}${
                listing.nickname ? ` - ${listing.nickname}` : ""
              }`,
              description: `Relay marketplace purchase from @${
                sellerProfile.username ?? "seller"
              }`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: relayFee,
        transfer_data: {
          destination: sellerProfile.stripe_account_id,
        },
      },
      metadata: {
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        amount_cents: String(listing.price_cents),
        relay_fee_cents: String(relayFee),
      },
      expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
    });

    await supabaseAdmin
      .from("checkout_locks")
      .update({ stripe_session_id: session.id })
      .eq("listing_id", listing.id)
      .eq("buyer_id", user.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}