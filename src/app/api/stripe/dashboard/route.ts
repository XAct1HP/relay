import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

/**
 * Generates a Stripe Express Dashboard login link for the current seller.
 */
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
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the seller's Stripe account ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_account_id) {
      return NextResponse.json(
        { error: 'No Stripe account connected. Please connect Stripe in Settings first.' },
        { status: 400 }
      )
    }

    // Generate a login link to the Stripe Express Dashboard
    const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id)

    return NextResponse.json({ url: loginLink.url })
  } catch (error: any) {
    console.error('Stripe dashboard link error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate Stripe dashboard link' },
      { status: 500 }
    )
  }
}
