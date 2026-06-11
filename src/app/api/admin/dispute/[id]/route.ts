import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAdminBearerToken } from '@/lib/admin-access'
import {
  applySellerDisputeLossPenalties,
  processOrderPayoutTrigger,
  unfreezeOrderPayouts,
} from '@/lib/payouts'

const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY!

const RETURN_ADDRESS = {
  name: 'Relay Returns',
  street1: '411 E Washington St',
  street2: 'Unit 909D',
  city: 'Ann Arbor',
  state: 'MI',
  zip: '48104',
  country: 'US',
}

function generatePackingSlipId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const random = crypto.randomBytes(6)
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars[random[i] % chars.length]
  }
  return `RET-${id}`
}

async function createReturnLabel(buyerAddress: any) {
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
    throw new Error('Failed to create return shipment')
  }

  const shipment = await shipmentRes.json()
  if (!shipment.rates || shipment.rates.length === 0) {
    throw new Error('No return shipping rates available')
  }

  const cheapestRate = shipment.rates.reduce(
    (min: any, rate: any) =>
      parseFloat(rate.amount) < parseFloat(min.amount) ? rate : min,
    shipment.rates[0]
  )

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
    throw new Error('Failed to purchase return label')
  }

  let label = await labelRes.json()
  if (label.status === 'QUEUED' || label.status === 'WAITING') {
    const txnId = label.object_id
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
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
    throw new Error(label.messages?.[0]?.text || 'Return label generation failed')
  }

  const trackingNumber =
    label.tracking_number || label.tracking_numbers?.[0] || `RET-${Date.now()}`
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
    const { user, adminClient } = await requireAdminBearerToken(request)
    const { ruling, adminNotes } = await request.json()

    if (!ruling || !['buyer', 'seller'].includes(ruling)) {
      return NextResponse.json(
        { error: 'Invalid ruling. Must be "buyer" or "seller".' },
        { status: 400 }
      )
    }

    const { data: order, error: fetchError } = await adminClient
      .from('orders')
      .select(
        'id, buyer_id, seller_id, status, buyer_shipping_address, stripe_transfer_id'
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

    const { data: dispute } = await adminClient
      .from('order_disputes')
      .select('id, category')
      .eq('order_id', orderId)
      .maybeSingle()

    if (ruling === 'buyer') {
      if (!order.buyer_shipping_address) {
        return NextResponse.json(
          { error: 'Buyer shipping address not found on order. Cannot create return label.' },
          { status: 400 }
        )
      }

      const returnLabel = await createReturnLabel(order.buyer_shipping_address)
      const packingSlipId = generatePackingSlipId()
      const nowIso = new Date().toISOString()

      await adminClient
        .from('orders')
        .update({
          status: 'return_pending',
          dispute_ruling: 'buyer',
          admin_notes: adminNotes || null,
          return_label_url: returnLabel.labelUrl,
          return_tracking_number: returnLabel.trackingNumber,
          return_packing_slip_id: packingSlipId,
          return_status: 'pending',
          return_created_at: nowIso,
          seller_funds_frozen: true,
        })
        .eq('id', orderId)

      if (dispute?.id) {
        await adminClient
          .from('order_disputes')
          .update({
            status: 'resolved',
            admin_resolution: adminNotes || 'Buyer won dispute; return required before refund.',
            financial_outcome: 'return_required_refund_pending',
            seller_penalty_outcome: dispute.category || 'buyer_dispute_win',
            resolved_by_admin_id: user.id,
            resolved_at: nowIso,
          })
          .eq('id', dispute.id)
      }

      await applySellerDisputeLossPenalties(adminClient, {
        orderId,
        sellerId: order.seller_id,
        category: dispute?.category || null,
        actorUserId: user.id,
        notes: adminNotes || null,
      })

      const { data: sellerProfile } = await adminClient
        .from('profiles')
        .select('dispute_flags_count')
        .eq('id', order.seller_id)
        .single()

      await adminClient
        .from('profiles')
        .update({ dispute_flags_count: (sellerProfile?.dispute_flags_count || 0) + 1 })
        .eq('id', order.seller_id)
    } else {
      await unfreezeOrderPayouts(adminClient, {
        orderId,
        sellerId: order.seller_id,
        actorUserId: user.id,
        actorRole: 'admin',
        reason: adminNotes || 'Seller won dispute',
      })

      await processOrderPayoutTrigger(adminClient, {
        orderId,
        trigger: 'manual_override',
        actorUserId: user.id,
        actorRole: 'admin',
        allowFrozenProcessing: true,
        overrideReason: adminNotes || null,
      })

      await adminClient
        .from('orders')
        .update({
          status: 'completed',
          dispute_ruling: 'seller',
          admin_notes: adminNotes || null,
          seller_funds_frozen: false,
        })
        .eq('id', orderId)

      if (dispute?.id) {
        await adminClient
          .from('order_disputes')
          .update({
            status: 'resolved',
            admin_resolution: adminNotes || 'Seller won dispute.',
            financial_outcome: 'seller_paid',
            seller_penalty_outcome: 'none',
            resolved_by_admin_id: user.id,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', dispute.id)
      }
    }

    const { data: updatedOrder } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Dispute ruling error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve dispute' },
      { status: 500 }
    )
  }
}
