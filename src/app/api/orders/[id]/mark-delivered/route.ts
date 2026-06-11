import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { processOrderPayoutTrigger } from '@/lib/payouts'
import { logRelayAuditEvent } from '@/lib/relay-audit'

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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the buyer can mark an order as delivered' },
        { status: 403 }
      )
    }

    if (order.status !== 'shipped') {
      return NextResponse.json(
        { error: 'Order must be in shipped status to mark as delivered' },
        { status: 400 }
      )
    }

    const reviewDeadline = new Date()
    reviewDeadline.setHours(reviewDeadline.getHours() + 48)

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        review_deadline: reviewDeadline.toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to mark order as delivered' },
        { status: 500 }
      )
    }

    await processOrderPayoutTrigger(createAdminClient(), {
      orderId,
      trigger: 'delivery',
      actorUserId: user.id,
      actorRole: 'buyer',
    })

    await logRelayAuditEvent(createAdminClient(), {
      actorUserId: user.id,
      actorRole: 'buyer',
      orderId,
      sellerId: order.seller_id || null,
      eventType: 'order.delivered_marked_by_buyer',
      metadata: {
        reviewDeadline: reviewDeadline.toISOString(),
      },
    })

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Mark delivered error:', error)
    return NextResponse.json(
      { error: 'Failed to mark order as delivered' },
      { status: 500 }
    )
  }
}
