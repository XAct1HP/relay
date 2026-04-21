import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

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

    const { rating, comment } = await request.json()

    if (rating === undefined || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating is required and must be between 1 and 5' },
        { status: 400 }
      )
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, seller_earnings, status, stripe_transfer_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Idempotency: if already completed, return early
    if (order.status === 'completed') {
      return NextResponse.json({ message: 'Order already completed', order })
    }

    // Only buyer can complete and review
    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Only buyer can complete order' },
        { status: 403 }
      )
    }

    // Only delivered orders can be completed by buyer
    if (!['delivered', 'review_window'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Order must be delivered before it can be completed' },
        { status: 400 }
      )
    }

    // Create review
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        order_id: orderId,
        reviewer_id: user.id,
        seller_id: order.seller_id,
        rating,
        comment: comment || null,
      })
      .select()
      .single()

    if (reviewError) {
      console.error('Review creation error:', reviewError)
      return NextResponse.json(
        { error: 'Failed to create review' },
        { status: 500 }
      )
    }

    // Get seller's Stripe Connect account ID
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', order.seller_id)
      .single()

    // Validate payout prerequisites before attempting transfer
    if (!sellerProfile?.stripe_account_id) {
      console.error(`Seller ${order.seller_id} has no Stripe Connect account for order ${orderId}`)
      await supabase
        .from('orders')
        .update({
          status: 'payout_failed',
          review_rating: rating,
          review_comment: comment || null,
        })
        .eq('id', orderId)
      return NextResponse.json(
        { error: 'Seller payout account not set up. Our team has been notified.' },
        { status: 500 }
      )
    }

    if (!order.seller_earnings || order.seller_earnings <= 0) {
      console.error(`Order ${orderId} has invalid seller_earnings: ${order.seller_earnings}`)
      await supabase
        .from('orders')
        .update({
          status: 'payout_failed',
          review_rating: rating,
          review_comment: comment || null,
        })
        .eq('id', orderId)
      return NextResponse.json(
        { error: 'Order has no valid payout amount. Our team has been notified.' },
        { status: 500 }
      )
    }

    // Create Stripe transfer to seller (with idempotency check)
    let transferId = order.stripe_transfer_id
    if (!transferId) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(order.seller_earnings * 100),
          currency: 'usd',
          destination: sellerProfile.stripe_account_id,
          metadata: {
            orderId,
          },
        }, {
          idempotencyKey: `order-complete-${orderId}`,
        })
        transferId = transfer.id
      } catch (err) {
        console.error('Stripe transfer error:', err)
        // Mark order as payout_failed so it's visible and actionable
        await supabase
          .from('orders')
          .update({
            status: 'payout_failed',
            review_rating: rating,
            review_comment: comment || null,
          })
          .eq('id', orderId)
        return NextResponse.json(
          { error: 'Payout to seller failed. Our team has been notified and will resolve this.' },
          { status: 500 }
        )
      }
    }

    // Update order status, store review data and transfer ID
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        stripe_transfer_id: transferId,
        review_rating: rating,
        review_comment: comment || null,
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Order update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update order' },
        { status: 500 }
      )
    }

    // Update seller stats (check gracefully if columns exist)
    const { data: sellerStats } = await supabase
      .from('profiles')
      .select('sales_count, avg_rating')
      .eq('id', order.seller_id)
      .single()

    if (sellerStats) {
      const newSalesCount = ((sellerStats as any).sales_count || 0) + 1
      const currentAvgRating = (sellerStats as any).avg_rating || 0
      const newAvgRating =
        (currentAvgRating * (newSalesCount - 1) + rating) / newSalesCount

      const updatePayload: Record<string, any> = {}
      if ('sales_count' in sellerStats) updatePayload.sales_count = newSalesCount
      if ('avg_rating' in sellerStats) updatePayload.avg_rating = newAvgRating

      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', order.seller_id)
      }
    }

    return NextResponse.json({ review, order: { ...order, status: 'completed' } })
  } catch (error) {
    console.error('Order completion error:', error)
    return NextResponse.json(
      { error: 'Failed to complete order' },
      { status: 500 }
    )
  }
}
