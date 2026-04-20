import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acpi',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      const metadata = session.metadata as Record<string, string>

      const listingId = metadata.listingId
      const size = metadata.size
      const buyerId = metadata.buyerId
      const sellerId = metadata.sellerId
      const customOfferId = metadata.customOfferId

      if (!listingId || !size || !buyerId || !sellerId) {
        return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 })
      }

      // Calculate fees
      const shoeAmount = (session.line_items?.data[0]?.amount_total || 0) / 100
      const shippingAmount =
        (session.line_items?.data?.[1]?.amount_total || 0) / 100
      const totalAmount = shoeAmount + shippingAmount

      const platformFee = shoeAmount * 0.01 // 1% platform fee
      const stripeFee = shoeAmount * 0.03 + 0.3 // 3% + $0.30
      const sellerEarnings = shoeAmount - platformFee - stripeFee // Shipping goes entirely to seller

      // Calculate shipping deadline (5 days from now)
      const shippingDeadline = new Date()
      shippingDeadline.setDate(shippingDeadline.getDate() + 5)

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          listing_id: listingId,
          buyer_id: buyerId,
          seller_id: sellerId,
          status: 'paid',
          size,
          price: shoeAmount,
          shipping_cost: shippingAmount,
          platform_fee: platformFee,
          stripe_fee: stripeFee,
          seller_earnings: sellerEarnings,
          payment_intent_id: session.payment_intent,
          shipping_deadline: shippingDeadline.toISOString(),
        })
        .select()
        .single()

      if (orderError) {
        console.error('Order creation error:', orderError)
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
      }

      // Decrement listing size quantity
      const { error: updateError } = await supabase.rpc('decrement_listing_quantity', {
        listing_id: listingId,
        size_key: size,
      })

      if (updateError) {
        console.error('Quantity update error:', updateError)
      }

      // Mark custom offer as accepted if applicable
      if (customOfferId) {
        const { error: offerError } = await supabase
          .from('custom_offers')
          .update({ status: 'accepted' })
          .eq('id', customOfferId)

        if (offerError) {
          console.error('Offer update error:', offerError)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
