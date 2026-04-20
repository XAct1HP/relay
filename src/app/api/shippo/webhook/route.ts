import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const event = await request.json()

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
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

    // Handle tracking status updates
    if (event.event === 'track_updated' && event.data?.tracking_number) {
      const trackingNumber = event.data.tracking_number
      const trackingStatus = event.data.status
      const isDelivered = trackingStatus === 'DELIVERED'

      // Find order by tracking number
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('tracking_number', trackingNumber)
        .single()

      if (orderError || !order) {
        return NextResponse.json({ received: true })
      }

      // Update tracking status
      await supabase
        .from('orders')
        .update({ tracking_status: trackingStatus })
        .eq('id', order.id)

      // If delivered, update order status and set review deadline
      if (isDelivered) {
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
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Shippo webhook error:', error)
    return NextResponse.json({ received: true })
  }
}
