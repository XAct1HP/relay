import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { assertOrderReadyForShippoLabel } from '@/lib/relay-tags'

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

    const { orderId, rateId } = await request.json()

    if (!orderId || !rateId) {
      return NextResponse.json(
        { error: 'Missing orderId or rateId' },
        { status: 400 }
      )
    }

    // Verify the order exists and user is the seller
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, seller_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.seller_id !== user.id) {
      return NextResponse.json({ error: 'Only the seller can purchase a label' }, { status: 403 })
    }

    const readiness = await assertOrderReadyForShippoLabel(createAdminClient(), orderId)
    if (!readiness.ready) {
      return NextResponse.json(
        { error: readiness.reasons[0] || 'Order is not ready for label generation', reasons: readiness.reasons },
        { status: 400 }
      )
    }

    // Purchase label using the rate (synchronous mode)
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
        async: false,
      }),
    })

    if (!labelResponse.ok) {
      const errBody = await labelResponse.text()
      console.error('Shippo label purchase error:', labelResponse.status, errBody)
      return NextResponse.json(
        { error: 'Failed to purchase label' },
        { status: 500 }
      )
    }

    let label = await labelResponse.json()

    // If Shippo returned QUEUED status, poll until it completes
    if (label.status === 'QUEUED' || label.status === 'WAITING') {
      const txnId = label.object_id
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        const pollRes = await fetch(`https://api.goshippo.com/transactions/${txnId}`, {
          headers: { Authorization: `ShippoToken ${SHIPPO_API_KEY}` },
        })
        if (pollRes.ok) {
          label = await pollRes.json()
          if (label.status === 'SUCCESS' || label.status === 'ERROR') break
        }
      }
    }

    if (label.status === 'ERROR') {
      console.error('Shippo label error:', JSON.stringify(label.messages))
      return NextResponse.json(
        { error: label.messages?.[0]?.text || 'Shippo label generation failed' },
        { status: 500 }
      )
    }

    // Log the full Shippo response for debugging
    console.log('Shippo transaction response:', JSON.stringify(label, null, 2))

    // Extract tracking number and label URL — Shippo uses different field names
    // depending on API version and test/live mode
    const trackingNumber = label.tracking_number || label.tracking_numbers?.[0] || 'TEST-' + Date.now()
    const labelUrl =
      label.label_download?.href ||
      label.label_download?.pdf?.url ||
      label.label_url ||
      label.label_download?.url ||
      (typeof label.label_download === 'string' ? label.label_download : null)

    if (!labelUrl) {
      console.error('Shippo label missing URL. Full response:', JSON.stringify(label))
      return NextResponse.json(
        { error: 'Label was created but the download URL is not available. Check Shippo dashboard.' },
        { status: 500 }
      )
    }

    // Update order with tracking info
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        tracking_number: trackingNumber,
        shipping_label_url: labelUrl,
        status: 'label_created',
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
