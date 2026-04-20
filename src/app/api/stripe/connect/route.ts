import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acpi',
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Handle SSR context
            }
          },
        },
      }
    )

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get or create Stripe Connect account
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id')
      .eq('id', user.id)
      .single()

    let accountId = profile?.stripe_connect_account_id

    if (!accountId) {
      // Create new Connect account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
      })
      accountId = account.id

      // Save account ID to profile
      await supabase
        .from('profiles')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', user.id)
    }

    // Create account link for onboarding
    // Check if the request came from onboarding or settings to determine return URL
    const body = await request.json().catch(() => ({}));
    const returnPath = body?.returnTo === 'onboarding' ? '/onboarding' : '/settings';

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: `${request.headers.get('origin')}${returnPath}?stripe_onboarded=true`,
      refresh_url: `${request.headers.get('origin')}${returnPath}?stripe_refresh=true`,
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error) {
    console.error('Stripe Connect error:', error)
    return NextResponse.json(
      { error: 'Failed to create account link' },
      { status: 500 }
    )
  }
}
