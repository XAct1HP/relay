import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // The id param IS the order ID (disputes live on orders)
    const { id: orderId } = await params

    // Use service role client for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify admin via auth header (extract token from Authorization header)
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
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
        { error: 'Invalid ruling. Must be "buyer" or "seller".' },
        { status: 400 }
      )
    }

    // Fetch the order directly
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, price, seller_earnings, stripe_payment_intent_id, status')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    if (order.status !== 'disputed') {
      return NextResponse.json(
        { error: 'Order is not in disputed status' },
        { status: 400 }
      )
    }

    if (ruling === 'buyer') {
      // Refund the buyer
      try {
        if (order.stripe_payment_intent_id) {
          await stripe.refunds.create({
            payment_intent: order.stripe_payment_intent_id,
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
          dispute_ruling: 'buyer',
          admin_notes: adminNotes || null,
        })
        .eq('id', orderId)

      if (updateError) {
        console.error('Order update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update order' },
          { status: 500 }
        )
      }
    } else if (ruling === 'seller') {
      // Transfer earnings to seller
      const { data: sellerProfile } = await supabase
        .from('profiles')
        .select('stripe_account_id')
        .eq('id', order.seller_id)
        .single()

      if (sellerProfile?.stripe_account_id && order.seller_earnings > 0) {
        try {
          await stripe.transfers.create({
            amount: Math.round(order.seller_earnings * 100),
            currency: 'usd',
            destination: sellerProfile.stripe_account_id,
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
          dispute_ruling: 'seller',
          admin_notes: adminNotes || null,
        })
        .eq('id', orderId)

      if (updateError) {
        console.error('Order update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update order' },
          { status: 500 }
        )
      }
    }

    // Fetch the updated order to return
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Dispute ruling error:', error)
    return NextResponse.json(
      { error: 'Failed to resolve dispute' },
      { status: 500 }
    )
  }
}
