import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

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

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { reason, description, evidenceUrls } = await request.json()

    if (!reason || !description) {
      return NextResponse.json(
        { error: 'Missing reason or description' },
        { status: 400 }
      )
    }

    // Verify user owns this order (buyer or seller)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.buyer_id !== user.id && order.seller_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Create dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .insert({
        order_id: orderId,
        filed_by: user.id,
        reason,
        description,
        evidence_urls: evidenceUrls || [],
        status: 'open',
      })
      .select()
      .single()

    if (disputeError) {
      console.error('Dispute creation error:', disputeError)
      return NextResponse.json(
        { error: 'Failed to create dispute' },
        { status: 500 }
      )
    }

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'disputed' })
      .eq('id', orderId)

    if (updateError) {
      console.error('Order update error:', updateError)
    }

    return NextResponse.json(dispute)
  } catch (error) {
    console.error('Dispute filing error:', error)
    return NextResponse.json(
      { error: 'Failed to file dispute' },
      { status: 500 }
    )
  }
}
