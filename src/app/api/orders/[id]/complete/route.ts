import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acpi',
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

    if (rating === undefined || !comment) {
      return NextResponse.json(
        { error: 'Missing rating or comment' },
        { status: 400 }
      )
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, buyer_id, seller_id, seller_earnings, status, stripe_connect_account_id'
      )
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Only buyer can complete and review
    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Only buyer can complete order' },
        { status: 403 }
      )
    }

    // Create review
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        order_id: orderId,
        reviewer_id: user.id,
        reviewee_id: order.seller_id,
        rating,
        comment,
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
      .select('stripe_connect_account_id')
      .eq('id', order.seller_id)
      .single()

    // Create Stripe transfer to seller
    if (sellerProfile?.stripe_connect_account_id && order.seller_earnings > 0) {
      try {
        await stripe.transfers.create({
          amount: Math.round(order.seller_earnings * 100),
          currency: 'usd',
          destination: sellerProfile.stripe_connect_account_id,
          metadata: {
            orderId,
          },
        })
      } catch (err) {
        console.error('Stripe transfer error:', err)
        // Don't fail the request if transfer fails, seller will need manual resolution
      }
    }

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', orderId)

    if (updateError) {
      console.error('Order update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update order' },
        { status: 500 }
      )
    }

    // Update seller stats
    const { data: sellerStats } = await supabase
      .from('profiles')
      .select('sales_count, avg_rating')
      .eq('id', order.seller_id)
      .single()

    if (sellerStats) {
      const newSalesCount = (sellerStats.sales_count || 0) + 1
      const currentAvgRating = sellerStats.avg_rating || 0
      const newAvgRating =
        (currentAvgRating * (newSalesCount - 1) + rating) / newSalesCount

      await supabase
        .from('profiles')
        .update({
          sales_count: newSalesCount,
          avg_rating: newAvgRating,
        })
        .eq('id', order.seller_id)
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
