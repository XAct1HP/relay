import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isRelayTestModeEnabled, isRelayTestSellerEmail } from "@/lib/test-mode";

export async function GET() {
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
            // Ignore cookie writes in non-mutable contexts.
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const enabled = isRelayTestModeEnabled();
  const isTestSeller = enabled && isRelayTestSellerEmail(user?.email);

  return NextResponse.json({
    enabled,
    isTestSeller,
    bannerText: isTestSeller
      ? "STAGING TEST MODE — Stripe is bypassed for test seller only"
      : null,
  });
}
