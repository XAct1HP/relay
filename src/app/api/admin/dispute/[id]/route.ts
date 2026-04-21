import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY!

// Platform return address
const RETURN_ADDRESS = {
  name: 'Relay Returns',
  street1: '411 E Washington St',
  street2: 'Unit 909D',
  city: 'Ann Arbor',
  state: 'MI',
  zip: '48104',
  country: 'US',
}

/**
 * Generate a short, unique packing slip ID like "RET-A3F8K2"
 */
function generatePackingSlipId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 to avoid confusion
  const random = crypto.randomBytes(6)
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars[random[i] % chars.length]
  }
  return `RET-${id}`
}

/**
 * Create a return shipping label via Shippo (buyer → platform)
 */
async function createReturnLabel(buyerAddress: any) {
  // Create a shipment from buyer to platform return address
  const shipmentRes = await fetch('https://api.goshippo.com/shipments/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ShippoToken ${SHIPPO_API_KEY}`,
    },
    body: JSON.stringify({
      address_from: {
        name: buyerAddress.name,
        street1: buyerAddress.street,
        street2: buyerAddress.street2 || '',
        city: buyerAddress.city,
        state: buyerAddress.state,
        zip: buyerAddress.zip,
        country: buyerAddress.country || 'US',
      },
      address_to: RETURN_ADDRESS,
      parcels: [
        {
          length: '10',
          width: '7',
          height: '4',
          distance_unit: 'in',
          weight: '1',
          mass_unit: 'lb',
        },
      ],
    }),
  })

  if (!shipmentRes.ok) {
    const errBody = await shipmentRes.text()
    console.error('Shippo return shipment error:', shipmentRes.status, errBody)
    throw new Error('Failed to create return shipment')
  }

  const shipment = await shipmentRes.json()

  if (!shipment.rates || shipment.rates.length === 0) {
    throw new Error('No return shipping rates available')
  }

  // Pick the cheapest rate
  const cheapestRate = shipment.rates.reduce(
    (min: any, rate: any) =>
      parseFloat(rate.amount) < parseFloat(min.amount) ? rate : min,
    shipment.rates[0]
  )

  // Purchase the label
  const labelRes = await fetch('https://api.goshippo.com/transactions/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ShippoToken ${SHIPPO_API_KEY}`,
    },
    body: JSON.stringify({
      rate: cheapestRate.object_id,
      label_download: { file_format: 'PDF' },
      async: false,
    }),
  })

  if (!labelRes.ok) {
    const errBody = await labelRes.text()
    console.error('Shippo return label error:', labelRes.status, errBody)
    throw new Error('Failed to purchase return label')
  }

  let label = await labelRes.json()

  // Poll if queued
  if (label.status === 'QUEUED' || label.status === 'WAITING') {
    const txnId = label.object_id
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const pollRes = await fetch(
        `https://api.goshippo.com/transactions/${txnId}`,
        { headers: { Authorization: `ShippoToken ${SHIPPO_API_KEY}` } }
      )
      if (pollRes.ok) {
        label = await pollRes.json()
        if (label.status === 'SUCCESS' || label.status === 'ERROR') break
      }
    }
  }

  if (label.status === 'ERROR') {
    console.error('Shippo return label error:', JSON.stringify(label.messages))
    throw new Error(label.messages?.[0]?.text || 'Return label generation failed')
  }

  const trackingNumber =
    label.tracking_number || label.tracking_numbers?.[0] || 'RET-TEST-' + Date.now()
  const labelUrl =
    label.label_download?.href ||
    label.label_download?.pdf?.url ||
    label.label_url ||
    label.label_download?.url ||
    (typeof label.label_download === 'string' ? label.label_download : null)

  return { trackingNumber, labelUrl }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

    // Use service role client for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify admin via auth header
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

    const { ruling, adminNotes } = await request.json()

    if (!ruling || !['buyer', 'seller'].includes(ruling)) {
      return NextResponse.json(
        { error: 'Invalid ruling. Must be "buyer" or "seller".' },
        { status: 400 }
      )
    }

    // Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select(
        'id, buyer_id, seller_id, price, seller_earnings, stripe_payment_intent_id, stripe_transfer_id, status, buyer_shipping_address'
      )
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'disputed') {
      return NextResponse.json(
        { error: 'Order is not in disputed status' },
        { status: 400 }
      )
    }

    if (ruling === 'buyer') {
      // ── BUYER WINS: Generate return label, do NOT refund yet ──────────

      // 1. Generate a return shipping label via Shippo
      let returnTrackingNumber: string | null = null
      let returnLabelUrl: string | null = null

      if (order.buyer_shipping_address) {
        try {
          const returnLabel = await createReturnLabel(order.buyer_shipping_address)
          returnTrackingNumber = returnLabel.trackingNumber
          returnLabelUrl = returnLabel.labelUrl
        } catch (err) {
          console.error('Return label generation error:', err)
          return NextResponse.json(
            {
              error:
                'Failed to generate return shipping label. Check buyer address and try again.',
            },
            { status: 500 }
          )
        }
      } else {
        return NextResponse.json(
          { error: 'Buyer shipping address not found on order. Cannot create return label.' },
          { status: 400 }
        )
      }

      // 2. Generate packing slip ID
      const packingSlipId = generatePackingSlipId()

      // 3. Update order → return_pending (NO refund yet)
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'return_pending',
          dispute_ruling: 'buyer',
          admin_notes: adminNotes || null,
          return_label_url: returnLabelUrl,
          return_tracking_number: returnTrackingNumber,
          return_packing_slip_id: packingSlipId,
          return_status: 'pending',
          return_created_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (updateError) {
        console.error('Order update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update order' },
          { status: 500 }
        )
      }

      // 4. Flag the seller — increment dispute_flags_count
      const { data: sellerProfile } = await supabase
        .from('profiles')
        .select('dispute_flags_count')
        .eq('id', order.seller_id)
        .single()

      const currentFlags = sellerProfile?.dispute_flags_count || 0
      await supabase
        .from('profiles')
        .update({ dispute_flags_count: currentFlags + 1 })
        .eq('id', order.seller_id)

    } else if (ruling === 'seller') {
      // ── SELLER WINS: Transfer earnings to seller ─────────────────────
      let transferId = order.stripe_transfer_id
      if (!transferId) {
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('stripe_account_id')
          .eq('id', order.seller_id)
          .single()

        if (sellerProfile?.stripe_account_id && order.seller_earnings > 0) {
          try {
            const transfer = await stripe.transfers.create(
              {
                amount: Math.round(order.seller_earnings * 100),
                currency: 'usd',
                destination: sellerProfile.stripe_account_id,
                metadata: { orderId: order.id },
              },
              { idempotencyKey: `dispute-seller-${orderId}` }
            )
            transferId = transfer.id
          } catch (err) {
            console.error('Stripe transfer error:', err)
            return NextResponse.json(
              { error: 'Failed to transfer funds to seller' },
              { status: 500 }
            )
          }
        } else if (!sellerProfile?.stripe_account_id) {
          return NextResponse.json(
            { error: 'Seller has no Stripe Connect account. Cannot complete payout.' },
            { status: 400 }
          )
        }
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          dispute_ruling: 'seller',
          stripe_transfer_id: transferId,
          admin_notes: adminNotes || null,
        })
        .eq('id', orderId)

      if (updateError) {
        console.error('Order update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update order' },
          { status: 500 }
        )
      }
    }

    // Fetch and return the updated order
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Dispute ruling error:', error)
    return NextResponse.json(
      { error: 'Failed to resolve dispute' },
      { status: 500 }
    )
  }
}
