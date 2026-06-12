import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getBundleById, isBundleUnlocked, formatBundlePrice } from "@/lib/tag-bundles";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Handle SSR context
            }
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify seller role and get tier
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, seller_tier")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "seller") {
      return NextResponse.json({ error: "Only sellers can purchase tags" }, { status: 403 });
    }

    const { bundleId } = await request.json();

    if (!bundleId) {
      return NextResponse.json({ error: "Missing bundleId" }, { status: 400 });
    }

    const bundle = getBundleById(bundleId);
    if (!bundle) {
      return NextResponse.json({ error: "Invalid bundle" }, { status: 400 });
    }

    if (!isBundleUnlocked(bundle, profile.seller_tier)) {
      return NextResponse.json(
        { error: `This bundle requires ${bundle.minTier.replace("tier_", "Tier ")}` },
        { status: 403 }
      );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Relay Tags - ${bundle.name} Pack`,
              description: `${bundle.quantity} security tags (${bundle.pricePerTag}/tag)`,
            },
            unit_amount: bundle.priceCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${request.headers.get("origin")}/tags?purchased=${bundle.id}`,
      cancel_url: `${request.headers.get("origin")}/tags`,
      metadata: {
        type: "tag_bundle_purchase",
        bundleId: bundle.id,
        bundleName: bundle.name,
        quantity: String(bundle.quantity),
        priceCents: String(bundle.priceCents),
        sellerId: user.id,
        sellerTier: profile.seller_tier,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Tag checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
