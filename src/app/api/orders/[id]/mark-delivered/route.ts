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

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Validate user is the buyer
    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the buyer can mark an order as delivered' },
        { status: 403 }
      )
    }

    // Validate order status
    if (order.status !== 'shipped') {
      return NextResponse.json(
        { error: 'Order must be in shipped status to mark as delivered' },
        { status: 400 }
      )
    }

    // Set review deadline to 48 hours from now
    const reviewDeadline = new Date()
    reviewDeadline.setHours(reviewDeadline.getHours() + 48)

    // Update the order
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        review_deadline: reviewDeadline.toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single()

    if (updateError) {
      console.error('Mark delivered error:', updateError)
      return NextResponse.json(
        { error: 'Failed to mark order as delivered' },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Mark delivered error:', error)
    return NextResponse.json(
      { error: 'Failed to mark order as delivered' },
      { status: 500 }
    )
  }
}
