import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { finalizeStripeCheckoutSession } from '@/lib/stripe-checkout'
import { syncOrderStripeSettlementByPaymentIntentId } from '@/lib/stripe-settlement'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      await finalizeStripeCheckoutSession(supabase as any, session, {
        source: 'stripe_webhook',
      })
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      if (paymentIntent.id) {
        await syncOrderStripeSettlementByPaymentIntentId(supabase as any, {
          paymentIntentId: paymentIntent.id,
          source: 'stripe_webhook_payment_intent_succeeded',
          actorRole: 'system',
        })
      }
    }

    if (event.type === 'charge.succeeded' || event.type === 'charge.updated') {
      const charge = event.data.object as Stripe.Charge
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent &&
              typeof charge.payment_intent === 'object' &&
              'id' in charge.payment_intent &&
              typeof charge.payment_intent.id === 'string'
            ? charge.payment_intent.id
            : null

      if (paymentIntentId) {
        await syncOrderStripeSettlementByPaymentIntentId(supabase as any, {
          paymentIntentId,
          source: `stripe_webhook_${event.type.replace('.', '_')}`,
          actorRole: 'system',
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
