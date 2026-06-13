import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { finalizeStripeCheckoutSession } from "@/lib/stripe-checkout";
import { createAdminClient } from "@/lib/supabase-admin";

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
              // SSR cookies can be immutable in this context.
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

    const { sessionId } = await request.json();
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (session.status !== "complete") {
      return NextResponse.json(
        { error: "Stripe checkout session is not complete yet" },
        { status: 409 }
      );
    }

    if (!["paid", "no_payment_required"].includes(session.payment_status || "")) {
      return NextResponse.json(
        { error: "Payment is not fully settled yet" },
        { status: 409 }
      );
    }

    const metadata = (session.metadata || {}) as Record<string, string>;
    const checkoutType =
      metadata.type === "tag_bundle_purchase" ? "tag_bundle_purchase" : "shoe_order";

    if (checkoutType === "tag_bundle_purchase") {
      if (metadata.sellerId !== user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } else if (metadata.buyerId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const result = await finalizeStripeCheckoutSession(adminClient, session, {
      source: "checkout_success_recovery",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Stripe checkout completion error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to finalize Stripe checkout session",
      },
      { status: 500 }
    );
  }
}
