import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordBuyerRelayTagScan } from '@/lib/relay-tags'
import { assertStorageObjectRefForOrder } from '@/lib/secure-storage'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const body = await request.json()
    const challengeCode = String(body?.challengeCode || '').trim()

    if (!challengeCode) {
      return NextResponse.json({ error: 'Challenge code is required.' }, { status: 400 })
    }

    if (typeof body?.buyerTagPhotoUrl === 'string') {
      assertStorageObjectRefForOrder(body.buyerTagPhotoUrl, {
        bucket: 'order-photos',
        orderId,
        allowedPrefixes: ['buyer-custody/'],
      })
    }
    if (typeof body?.buyerPairPhotoUrl === 'string') {
      assertStorageObjectRefForOrder(body.buyerPairPhotoUrl, {
        bucket: 'order-photos',
        orderId,
        allowedPrefixes: ['buyer-custody/'],
      })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, buyer_challenge_code, status, buyer_id, relay_tag_required, auth_requirements_evaluated_at')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    }

    if (!order.relay_tag_required || !order.auth_requirements_evaluated_at) {
      return NextResponse.json(
        { error: 'This order does not support public buyer verification.' },
        { status: 400 }
      )
    }

    if (!['delivered', 'review_window', 'disputed'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Buyer verification is only available after delivery.' },
        { status: 400 }
      )
    }

    if (!order.buyer_challenge_code || order.buyer_challenge_code.toUpperCase() !== challengeCode.toUpperCase()) {
      return NextResponse.json({ error: 'Incorrect challenge code.' }, { status: 403 })
    }

    await recordBuyerRelayTagScan(createAdminClient(), {
      orderId,
      buyerId: order.buyer_id,
      scannedValue: String(body?.scannedValue || ''),
      buyerTagPhotoUrl: typeof body?.buyerTagPhotoUrl === 'string' ? body.buyerTagPhotoUrl : null,
      buyerPairPhotoUrl: typeof body?.buyerPairPhotoUrl === 'string' ? body.buyerPairPhotoUrl : null,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record buyer tag scan' },
      { status: 400 }
    )
  }
}
