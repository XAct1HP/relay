import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { processOrderPayoutTrigger } from '@/lib/payouts'

export async function POST(request: NextRequest) {
  try {
    const event = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (event.event === 'track_updated' && event.data?.tracking_number) {
      const trackingNumber = event.data.tracking_number
      const trackingStatus = event.data.tracking_status?.status || event.data.status

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, status')
        .eq('tracking_number', trackingNumber)
        .single()

      if (orderError || !order) {
        return NextResponse.json({ received: true })
      }

      await supabase
        .from('orders')
        .update({ tracking_status: trackingStatus })
        .eq('id', order.id)

      if (
        (trackingStatus === 'TRANSIT' || trackingStatus === 'IN_TRANSIT') &&
        order.status === 'label_created'
      ) {
        await supabase
          .from('orders')
          .update({ status: 'shipped', shipped_at: new Date().toISOString() })
          .eq('id', order.id)

        await processOrderPayoutTrigger(supabase as any, {
          orderId: order.id,
          trigger: 'carrier_acceptance',
          actorRole: 'system',
        })
      }

      if (
        trackingStatus === 'DELIVERED' &&
        (order.status === 'shipped' || order.status === 'label_created')
      ) {
        const reviewDeadline = new Date()
        reviewDeadline.setDate(reviewDeadline.getDate() + 2)

        await supabase
          .from('orders')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString(),
            review_deadline: reviewDeadline.toISOString(),
          })
          .eq('id', order.id)

        await processOrderPayoutTrigger(supabase as any, {
          orderId: order.id,
          trigger: 'delivery',
          actorRole: 'system',
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Shippo webhook error:', error)
    return NextResponse.json({ received: true })
  }
}
