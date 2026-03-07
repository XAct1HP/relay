import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  // If seller already has a connected Stripe account,
  // send them to manage it instead of creating a new one.
  if (profile.stripe_account_id) {
    const loginLink = await stripe.accounts.createLoginLink(
      profile.stripe_account_id
    );

    return NextResponse.json({ url: loginLink.url });
  }

  // Otherwise create a new Stripe Express connected account
  const account = await stripe.accounts.create({
    type: "express",
  });

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      stripe_account_id: account.id,
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to save Stripe account." },
      { status: 500 }
    );
  }

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${appUrl}/dashboard`,
    return_url: `${appUrl}/dashboard`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}