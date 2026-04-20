import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
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

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { listingId, size, price, shippingCost, buyerAddress, customOfferId } =
      await request.json()

    if (!listingId || !size || price === undefined || shippingCost === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch listing and seller info
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, seller_id, brand, model, images')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []

    // Add shoe price
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${listing.brand} ${listing.model}`,
          description: `Size: ${size}`,
          images: listing.images?.length ? [listing.images[0]] : [],
        },
        unit_amount: Math.round(price * 100),
      },
      quantity: 1,
    })

    // Add shipping cost if applicable
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping',
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      })
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${request.headers.get('origin')}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin')}/listings/${listingId}`,
      metadata: {
        listingId,
        size,
        buyerId: user.id,
        sellerId: listing.seller_id,
        customOfferId: customOfferId || '',
        shoePrice: String(price),
        shippingCost: String(shippingCost),
        buyerAddress: buyerAddress ? JSON.stringify(buyerAddress) : '',
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
