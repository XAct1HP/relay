import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
    const listingId = body.listingId as string;
    const shippingAddress = body.shippingAddress as RelayAddress;

    if (
      !listingId ||
      !shippingAddress?.name ||
      !shippingAddress?.street1 ||
      !shippingAddress?.city ||
      !shippingAddress?.state ||
      !shippingAddress?.zip
    ) {
      return NextResponse.json(
        { error: "Missing shipping details." },
        { status: 400 }
      );
    }

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, seller_id, status, shipping_weight_oz")
      .eq("id", listingId)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    if (listing.status !== "active") {
      return NextResponse.json(
        { error: "Listing is no longer available." },
        { status: 400 }
      );
    }

    const { data: sellerProfile, error: sellerError } = await supabaseAdmin
      .from("profiles")
      .select(
        "ship_from_name, ship_from_phone, ship_from_street1, ship_from_street2, ship_from_city, ship_from_state, ship_from_zip, ship_from_country"
      )
      .eq("id", listing.seller_id)
      .single();

    if (sellerError || !sellerProfile) {
      return NextResponse.json(
        { error: "Seller shipping profile not found." },
        { status: 404 }
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

    return NextResponse.json({
      shippingAmountCents: Math.round(Number(bestRate.amount) * 100),
      carrier: bestRate.provider,
      service: bestRate.servicelevel?.name || "Shipping",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to quote shipping." },
      { status: 500 }
    );
  }
}