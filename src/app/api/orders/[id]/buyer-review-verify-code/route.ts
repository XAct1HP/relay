import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const { challengeCode } = await request.json()

    if (!challengeCode) {
      return NextResponse.json({ error: 'Challenge code is required.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, buyer_challenge_code, status, relay_tag_required, auth_requirements_evaluated_at')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    }

    if (!order.relay_tag_required || !order.auth_requirements_evaluated_at) {
      return NextResponse.json(
        { error: 'This order does not require buyer Relay verification.' },
        { status: 400 }
      )
    }

    if (!['delivered', 'review_window', 'disputed'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Buyer verification is only available after delivery.' },
        { status: 400 }
      )
    }

    if (!order.buyer_challenge_code) {
      return NextResponse.json(
        { error: 'Buyer verification code has not been generated yet.' },
        { status: 400 }
      )
    }

    if (order.buyer_challenge_code.toUpperCase() !== challengeCode.toUpperCase()) {
      return NextResponse.json({ error: 'Incorrect challenge code.' }, { status: 403 })
    }

    return NextResponse.json({ verified: true })
  } catch (error) {
    console.error('Buyer review verify code error:', error)
    return NextResponse.json({ error: 'Verification failed.' }, { status: 500 })
  }
}
