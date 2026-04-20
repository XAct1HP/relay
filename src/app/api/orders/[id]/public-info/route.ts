import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Public endpoint that returns minimal, non-sensitive order info
 * for the mobile authentication flow. No auth required.
 * Only returns: order id, status, and listing brand/model.
 */
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

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, listing_id, listings(brand, model)')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Only expose minimal info — no seller/buyer details, no prices
    return NextResponse.json({
      id: order.id,
      status: order.status,
      listing: order.listings,
    })
  } catch (error) {
    console.error('Public order info error:', error)
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 })
  }
}
