import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

/**
 * PATCH /api/admin/returns/[id]/mark-returned
 *
 * Admin marks a return as received (by matching packing slip ID).
 * This triggers the actual Stripe refund to the buyer.
 *
 * The [id] param is the ORDER ID.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify admin
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

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

    // Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, stripe_payment_intent_id, return_packing_slip_id, return_status')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Must be in return flow
    if (!['return_pending', 'return_shipped'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Order is not awaiting return. Current status: ' + order.status },
        { status: 400 }
      )
    }

    // Process refund via Stripe
    if (!order.stripe_payment_intent_id) {
      return NextResponse.json(
        { error: 'No payment intent found for this order. Cannot issue refund.' },
        { status: 400 }
      )
    }

    try {
      await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
      })
    } catch (err) {
      console.error('Stripe refund error:', err)
      return NextResponse.json(
        { error: 'Failed to process refund via Stripe' },
        { status: 500 }
      )
    }

    // Update order to refunded
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'refunded',
        return_status: 'delivered',
        return_delivered_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Order update error:', updateError)
      return NextResponse.json(
        { error: 'Refund processed but failed to update order status' },
        { status: 500 }
      )
    }

    // Fetch updated order
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Mark returned error:', error)
    return NextResponse.json(
      { error: 'Failed to mark return as received' },
      { status: 500 }
    )
  }
}
