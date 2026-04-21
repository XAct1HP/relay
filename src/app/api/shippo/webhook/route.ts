import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const event = await request.json()

    // Use service role — webhooks have no user session
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Handle tracking status updates
    if (event.event === 'track_updated' && event.data?.tracking_number) {
      const trackingNumber = event.data.tracking_number
      const trackingStatus = event.data.tracking_status?.status || event.data.status
      console.log('Shippo webhook: tracking update', trackingNumber, trackingStatus)

      // Find order by tracking number
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, status')
        .eq('tracking_number', trackingNumber)
        .single()

      if (orderError || !order) {
        console.log('Shippo webhook: order not found for tracking', trackingNumber)
        return NextResponse.json({ received: true })
      }

      // Always update the raw tracking status
      await supabase
        .from('orders')
        .update({ tracking_status: trackingStatus })
        .eq('id', order.id)

      // TRANSIT / IN_TRANSIT → mark as shipped (if still in label_created)
      if (
        (trackingStatus === 'TRANSIT' || trackingStatus === 'IN_TRANSIT') &&
        order.status === 'label_created'
      ) {
        await supabase
          .from('orders')
          .update({ status: 'shipped', shipped_at: new Date().toISOString() })
          .eq('id', order.id)
        console.log('Shippo webhook: order', order.id, '→ shipped')
      }

      // DELIVERED → mark as delivered and start review window
      if (
        trackingStatus === 'DELIVERED' &&
        (order.status === 'shipped' || order.status === 'label_created')
      ) {
        const reviewDeadline = new Date()
        reviewDeadline.setDate(reviewDeadline.getDate() + 2) // 48 hours

        await supabase
          .from('orders')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString(),
            review_deadline: reviewDeadline.toISOString(),
          })
          .eq('id', order.id)
        console.log('Shippo webhook: order', order.id, '→ delivered')
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Shippo webhook error:', error)
    return NextResponse.json({ received: true })
  }
}
