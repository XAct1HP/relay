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

    // Use service role to bypass RLS — this is a public endpoint
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, challenge_code, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    }

    if (order.status !== 'paid') {
      return NextResponse.json(
        { error: 'This order is not awaiting authentication.' },
        { status: 400 }
      )
    }

    if (order.challenge_code !== challengeCode) {
      return NextResponse.json({ error: 'Incorrect challenge code.' }, { status: 403 })
    }

    return NextResponse.json({ verified: true })
  } catch (error) {
    console.error('Verify code error:', error)
    return NextResponse.json({ error: 'Verification failed.' }, { status: 500 })
  }
}
