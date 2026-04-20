import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acpi',
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: disputeId } = await params

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

    // Get current user and verify admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (adminProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { ruling, adminNotes } = await request.json()

    if (!ruling || !['buyer', 'seller'].includes(ruling)) {
      return NextResponse.json(
        { error: 'Invalid ruling' },
        { status: 400 }
      )
    }

    // Get dispute with order details
    const { data: dispute, error: fetchError } = await supabase
      .from('disputes')
      .select(`
        id,
        order_id,
        orders (
          id,
          buyer_id,
          seller_id,
          price,
          seller_earnings,
          payment_intent_id,
          stripe_connect_account_id
        )
      `)
      .eq('id', disputeId)
      .single()

    if (fetchError || !dispute) {
      return NextResponse.json(
        { error: 'Dispute not found' },
        { status: 404 }
      )
    }

    const order = dispute.orders

    if (ruling === 'buyer') {
      // Refund the buyer
      try {
        if (order.payment_intent_id) {
          await stripe.refunds.create({
            payment_intent: order.payment_intent_id,
          })
        }
      } catch (err) {
        console.error('Stripe refund error:', err)
        return NextResponse.json(
          { error: 'Failed to process refund' },
          { status: 500 }
        )
      }

      // Update order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'refund_pending',
        })
        .eq('id', order.id)

      if (updateError) {
        console.error('Order update error:', updateError)
      }
    } else if (ruling === 'seller') {
      // Complete order and transfer earnings to seller
      const { data: sellerProfile } = await supabase
        .from('profiles')
        .select('stripe_connect_account_id')
        .eq('id', order.seller_id)
        .single()

      if (sellerProfile?.stripe_connect_account_id && order.seller_earnings > 0) {
        try {
          await stripe.transfers.create({
            amount: Math.round(order.seller_earnings * 100),
            currency: 'usd',
            destination: sellerProfile.stripe_connect_account_id,
            metadata: {
              orderId: order.id,
            },
          })
        } catch (err) {
          console.error('Stripe transfer error:', err)
          // Don't fail the request
        }
      }

      // Update order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', order.id)

      if (updateError) {
        console.error('Order update error:', updateError)
      }
    }

    // Update dispute status
    const { data: updatedDispute, error: updateError } = await supabase
      .from('disputes')
      .update({
        status: 'resolved',
        ruling,
        admin_notes: adminNotes,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', disputeId)
      .select()
      .single()

    if (updateError) {
      console.error('Dispute update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update dispute' },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedDispute)
  } catch (error) {
    console.error('Dispute ruling error:', error)
    return NextResponse.json(
      { error: 'Failed to resolve dispute' },
      { status: 500 }
    )
  }
}
