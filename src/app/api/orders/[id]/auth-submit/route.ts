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

    const { authPhotos, checkcheckCertificateUrl } = await request.json()

    // Validate inputs
    if (!authPhotos || !Array.isArray(authPhotos) || authPhotos.length < 8) {
      return NextResponse.json(
        { error: 'At least 8 authentication photos are required' },
        { status: 400 }
      )
    }

    if (!checkcheckCertificateUrl) {
      return NextResponse.json(
        { error: 'CheckCheck certificate URL is required' },
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
        { error: 'Only the seller can submit authentication' },
        { status: 403 }
      )
    }

    // Validate order status
    if (order.status !== 'paid') {
      return NextResponse.json(
        { error: 'Order must be in paid status to submit authentication' },
        { status: 400 }
      )
    }

    // Update the order with authentication data
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        auth_photos: authPhotos,
        checkcheck_certificate_url: checkcheckCertificateUrl,
        status: 'auth_submitted',
      })
      .eq('id', orderId)
      .select()
      .single()

    if (updateError) {
      console.error('Auth submit error:', updateError)
      return NextResponse.json(
        { error: 'Failed to submit authentication' },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Auth submission error:', error)
    return NextResponse.json(
      { error: 'Failed to submit authentication' },
      { status: 500 }
    )
  }
}
