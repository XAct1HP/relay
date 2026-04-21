import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

/**
 * Auto-complete orders & pay sellers after the 48-hour review window.
 *
 * Finds all orders in 'delivered' status whose review_deadline has passed
 * (meaning the buyer didn't complete or dispute in time), creates a Stripe
 * transfer to the seller, and marks the order as 'completed'.
 *
 * Call this on a schedule (e.g. every 15 minutes via Vercel Cron, external
 * cron service, or a Supabase pg_cron job).
 *
 * Protected by a CRON_SECRET bearer token so only your scheduler can call it.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Auth: require CRON_SECRET ──────────────────────────────────────
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Supabase service-role client (bypasses RLS) ────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const now = new Date().toISOString()

    // ── Find eligible orders ───────────────────────────────────────────
    // Orders that are 'delivered', past their review_deadline, and haven't
    // been disputed or already completed.
    const { data: orders, error: queryError } = await supabase
      .from('orders')
      .select('id, seller_id, seller_earnings, stripe_transfer_id')
      .eq('status', 'delivered')
      .lt('review_deadline', now)
      .is('stripe_transfer_id', null)

    if (queryError) {
      console.error('Auto-complete query error:', queryError)
      return NextResponse.json(
        { error: 'Failed to query orders' },
        { status: 500 }
      )
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ message: 'No orders to auto-complete', processed: 0 })
    }

    console.log(`Auto-complete: found ${orders.length} orders past review deadline`)

    const results: { orderId: string; status: string; error?: string }[] = []

    for (const order of orders) {
      try {
        // ── Get seller's Stripe Connect account ────────────────────────
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('stripe_account_id')
          .eq('id', order.seller_id)
          .single()

        if (!sellerProfile?.stripe_account_id) {
          console.error(`Auto-complete: seller ${order.seller_id} has no Stripe account (order ${order.id})`)
          await supabase
            .from('orders')
            .update({ status: 'payout_failed' })
            .eq('id', order.id)
          results.push({ orderId: order.id, status: 'payout_failed', error: 'No seller Stripe account' })
          continue
        }

        // ── Create Stripe transfer ─────────────────────────────────────
        let transferId: string | null = null
        if (order.seller_earnings > 0) {
          const transfer = await stripe.transfers.create({
            amount: Math.round(order.seller_earnings * 100),
            currency: 'usd',
            destination: sellerProfile.stripe_account_id,
            metadata: {
              orderId: order.id,
              source: 'auto-complete',
            },
          }, {
            idempotencyKey: `auto-complete-${order.id}`,
          })
          transferId = transfer.id
        }

        // ── Mark order completed ───────────────────────────────────────
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            status: 'completed',
            stripe_transfer_id: transferId,
          })
          .eq('id', order.id)
          .eq('status', 'delivered') // Optimistic lock: only update if still delivered

        if (updateError) {
          console.error(`Auto-complete: failed to update order ${order.id}:`, updateError)
          results.push({ orderId: order.id, status: 'error', error: 'DB update failed' })
        } else {
          console.log(`Auto-complete: order ${order.id} → completed, transfer ${transferId}`)
          results.push({ orderId: order.id, status: 'completed' })
        }
      } catch (err) {
        console.error(`Auto-complete: failed for order ${order.id}:`, err)

        // Mark as payout_failed so it's visible to admins
        await supabase
          .from('orders')
          .update({ status: 'payout_failed' })
          .eq('id', order.id)

        results.push({
          orderId: order.id,
          status: 'payout_failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const completed = results.filter((r) => r.status === 'completed').length
    const failed = results.filter((r) => r.status !== 'completed').length

    return NextResponse.json({
      message: `Auto-complete finished: ${completed} completed, ${failed} failed`,
      processed: results.length,
      completed,
      failed,
      results,
    })
  } catch (error) {
    console.error('Auto-complete cron error:', error)
    return NextResponse.json(
      { error: 'Auto-complete cron failed' },
      { status: 500 }
    )
  }
}
