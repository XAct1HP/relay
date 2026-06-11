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

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { response, evidenceUrls } = await request.json()

    if (!response) {
      return NextResponse.json(
        { error: 'A text response is required' },
        { status: 400 }
      )
    }

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, seller_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Validate user is the seller
    if (order.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the seller can submit dispute evidence' },
        { status: 403 }
      )
    }

    // Validate order status
    if (order.status !== 'disputed') {
      return NextResponse.json(
        { error: 'Order must be in disputed status to submit evidence' },
        { status: 400 }
      )
    }

    // Update the order with seller's dispute evidence
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        dispute_text_seller: response,
        dispute_evidence_seller: evidenceUrls || [],
      })
      .eq('id', orderId)
      .select()
      .single()

    if (updateError) {
      console.error('Seller evidence submit error:', updateError)
      return NextResponse.json(
        { error: 'Failed to submit dispute evidence' },
        { status: 500 }
      )
    }

    await supabase
      .from('order_disputes')
      .update({
        seller_description: response,
        seller_evidence_urls: evidenceUrls || [],
        status: 'seller_responded',
      })
      .eq('order_id', orderId)

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Seller evidence error:', error)
    return NextResponse.json(
      { error: 'Failed to submit dispute evidence' },
      { status: 500 }
    )
  }
}
