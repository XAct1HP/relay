import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        relay_tag_required,
        auth_requirements_evaluated_at,
        listings(brand, model),
        relay_tag:relay_tags!orders_relay_tag_id_fkey(tag_serial_number)
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: order.id,
      status: order.status,
      relayTagRequired: Boolean(order.relay_tag_required),
      legacyAuthFlow: !order.auth_requirements_evaluated_at,
      expectedRelayTagValue: Array.isArray((order as any).relay_tag)
        ? (order as any).relay_tag[0]?.tag_serial_number || null
        : (order as any).relay_tag?.tag_serial_number || null,
      listing: (order as any).listings || null,
    })
  } catch (error) {
    console.error('Buyer review public info error:', error)
    return NextResponse.json({ error: 'Failed to load buyer review info' }, { status: 500 })
  }
}
