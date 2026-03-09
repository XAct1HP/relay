import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import {
  createShippoShipment,
  getLowestShippoRate,
  RelayAddress,
} from "@/lib/shippo";

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
    const offerId = body.offerId as string | undefined;
    const shippingAddress = body.shippingAddress as RelayAddress | undefined;

    if (!listingId && !offerId) {
      return NextResponse.json(
        { error: "Missing listingId or offerId" },
        { status: 400 }
      );
    }

    if (
      !shippingAddress ||
      !shippingAddress.name ||
      !shippingAddress.street1 ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.zip
    ) {
      return NextResponse.json(
        { error: "Shipping address is required." },
        { status: 400 }
      );
    }

    let listing:
      | {
          id: string;
          brand: string;
          model: string;
          nickname: string | null;
          price_cents: number;
          seller_id: string;
          status: string;
          shipping_weight_oz: number;
        }
      | null = null;

    let finalAmountCents = 0;
    let finalBuyerId = user.id;
    let finalSellerId = "";
    let acceptedOfferId: string | null = null;

    if (offerId) {
      const { data: offer, error: offerError } = await supabaseAdmin
        .from("offers")
        .select(
          "id, listing_id, seller_id, buyer_id, amount_cents, status, expires_at"
        )
        .eq("id", offerId)
        .single();

      if (offerError || !offer) {
        return NextResponse.json({ error: "Offer not found" }, { status: 404 });
      }

      if (offer.buyer_id !== user.id) {
        return NextResponse.json(
          { error: "You cannot accept someone else's offer." },
          { status: 403 }
        );
      }

      if (offer.status !== "pending") {
        return NextResponse.json(
          { error: "This offer is no longer available." },
          { status: 400 }
        );
      }

      if (
        offer.expires_at &&
        new Date(offer.expires_at).getTime() < Date.now()
      ) {
        await supabaseAdmin
          .from("offers")
          .update({ status: "expired" })
          .eq("id", offer.id);

        return NextResponse.json(
          { error: "This offer has expired." },
          { status: 400 }
        );
      }

      const { data: foundListing, error: listingError } = await supabaseAdmin
        .from("listings")
        .select(
          "id, brand, model, nickname, price_cents, seller_id, status, shipping_weight_oz"
        )
        .eq("id", offer.listing_id)
        .single();

      if (listingError || !foundListing) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }

      listing = foundListing;
      finalAmountCents = offer.amount_cents;
      finalSellerId = offer.seller_id;
      acceptedOfferId = offer.id;
    } else {
      const { data: foundListing, error: listingError } = await supabaseAdmin
        .from("listings")
        .select(
          "id, brand, model, nickname, price_cents, seller_id, status, shipping_weight_oz"
        )
        .eq("id", listingId!)
        .single();

      if (listingError || !foundListing) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }

      listing = foundListing;
      finalAmountCents = foundListing.price_cents;
      finalSellerId = foundListing.seller_id;
    }

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (finalSellerId === user.id) {
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
      .select(`
        stripe_account_id,
        username,
        ship_from_name,
        ship_from_phone,
        ship_from_street1,
        ship_from_street2,
        ship_from_city,
        ship_from_state,
        ship_from_zip,
        ship_from_country
      `)
      .eq("id", finalSellerId)
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

    if (
      !sellerProfile.ship_from_name ||
      !sellerProfile.ship_from_street1 ||
      !sellerProfile.ship_from_city ||
      !sellerProfile.ship_from_state ||
      !sellerProfile.ship_from_zip
    ) {
      return NextResponse.json(
        { error: "Seller has not finished shipping setup yet." },
        { status: 400 }
      );
    }

    const connectedAccount = await stripe.accounts.retrieve(
      sellerProfile.stripe_account_id
    );

    if (!connectedAccount.charges_enabled) {
      return NextResponse.json(
        { error: "Seller payout account is not fully enabled yet." },
        { status: 400 }
      );
    }

    const shipment = await createShippoShipment({
      toAddress: shippingAddress,
      fromAddress: {
        name: sellerProfile.ship_from_name,
        phone: sellerProfile.ship_from_phone,
        street1: sellerProfile.ship_from_street1,
        street2: sellerProfile.ship_from_street2,
        city: sellerProfile.ship_from_city,
        state: sellerProfile.ship_from_state,
        zip: sellerProfile.ship_from_zip,
        country: sellerProfile.ship_from_country || "US",
      },
      weightOz: listing.shipping_weight_oz || 32,
    });

    const bestRate = getLowestShippoRate(shipment);
    const shippingAmountCents = Math.round(Number(bestRate.amount) * 100);

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: lockError } = await supabaseAdmin.from("checkout_locks").insert({
      listing_id: listing.id,
      buyer_id: finalBuyerId,
      expires_at: expiresAt,
      shipping_address_json: shippingAddress,
      shipping_amount_cents: shippingAmountCents,
      shippo_shipment_id: shipment.object_id,
      shippo_rate_id: bestRate.object_id,
    });

    if (lockError) {
      return NextResponse.json(
        { error: "This listing is currently being purchased by another buyer." },
        { status: 409 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const relayFee = Math.round(finalAmountCents * 0.03);
    const totalAppFee = relayFee + shippingAmountCents;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/listings/${listing.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: finalAmountCents,
            product_data: {
              name: `${listing.brand} ${listing.model}${
                listing.nickname ? ` - ${listing.nickname}` : ""
              }`,
              description: acceptedOfferId
                ? `Relay negotiated offer purchase from @${
                    sellerProfile.username ?? "seller"
                  }`
                : `Relay marketplace purchase from @${
                    sellerProfile.username ?? "seller"
                  }`,
            },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: shippingAmountCents,
            product_data: {
              name: "Shipping",
              description: `${bestRate.provider} ${
                bestRate.servicelevel?.name || "Shipping"
              } prepaid label`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: totalAppFee,
        transfer_data: {
          destination: sellerProfile.stripe_account_id,
        },
      },
      metadata: {
        listing_id: listing.id,
        buyer_id: finalBuyerId,
        seller_id: finalSellerId,
        amount_cents: String(finalAmountCents),
        shipping_amount_cents: String(shippingAmountCents),
        relay_fee_cents: String(relayFee),
        offer_id: acceptedOfferId ?? "",
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await supabaseAdmin
      .from("checkout_locks")
      .update({ stripe_session_id: session.id })
      .eq("listing_id", listing.id)
      .eq("buyer_id", finalBuyerId);

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Checkout error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          error?.raw?.message ||
          "Failed to create checkout session",
      },
      { status: 500 }
    );
  }
}