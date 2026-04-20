import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY!

export async function POST(request: NextRequest) {
  try {
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

    const { orderId, rateId } = await request.json()

    if (!orderId || !rateId) {
      return NextResponse.json(
        { error: 'Missing orderId or rateId' },
        { status: 400 }
      )
    }

    // Get order with address details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        listing_id,
        buyer_id,
        seller_id,
        price,
        shipping_cost,
        buyer_address,
        seller_address,
        listings (
          id,
          brand,
          model
        ),
        profiles!seller_id (
          full_name
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Get buyer profile for address
    const { data: buyerProfile } = await supabase
      .from('profiles')
      .select('full_name, address')
      .eq('id', order.buyer_id)
      .single()

    // Purchase label using the rate
    const labelResponse = await fetch('https://api.goshippo.com/transactions/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ShippoToken ${SHIPPO_API_KEY}`,
      },
      body: JSON.stringify({
        rate: rateId,
        label_download: {
          file_format: 'PDF',
        },
      }),
    })

    if (!labelResponse.ok) {
      console.error('Shippo label purchase error:', labelResponse.statusText)
      return NextResponse.json(
        { error: 'Failed to purchase label' },
        { status: 500 }
      )
    }

    const label = await labelResponse.json()

    // Extract tracking number and label URL
    const trackingNumber = label.tracking_number
    const labelUrl = label.label_download?.href

    if (!trackingNumber || !labelUrl) {
      return NextResponse.json(
        { error: 'Missing tracking number or label URL' },
        { status: 500 }
      )
    }

    // Update order with tracking info
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        tracking_number: trackingNumber,
        label_url: labelUrl,
        status: 'label_created',
        shipped_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Order update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update order' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      trackingNumber,
      labelUrl,
      orderId,
    })
  } catch (error) {
    console.error('Shippo label error:', error)
    return NextResponse.json(
      { error: 'Failed to generate shipping label' },
      { status: 500 }
    )
  }
}
