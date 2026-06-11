import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { assertStorageObjectRefForOrder } from '@/lib/secure-storage'
import { logRelayAuditEvent } from '@/lib/relay-audit'

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

    const normalizedEvidenceUrls = Array.isArray(evidenceUrls)
      ? evidenceUrls.filter((value: unknown): value is string => typeof value === 'string')
      : []
    normalizedEvidenceUrls.forEach((evidenceUrl) => {
      assertStorageObjectRefForOrder(evidenceUrl, {
        bucket: 'order-photos',
        orderId,
        allowedPrefixes: ['seller-evidence/'],
      })
    })

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
        dispute_evidence_seller: normalizedEvidenceUrls,
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
        seller_evidence_urls: normalizedEvidenceUrls,
        status: 'seller_responded',
      })
      .eq('order_id', orderId)

    await logRelayAuditEvent(supabase, {
      actorUserId: user.id,
      actorRole: 'seller',
      sellerId: user.id,
      orderId,
      eventType: 'order.dispute_seller_response_submitted',
      metadata: {
        evidenceCount: normalizedEvidenceUrls.length,
      },
    })

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Seller evidence error:', error)
    return NextResponse.json(
      { error: 'Failed to submit dispute evidence' },
      { status: 500 }
    )
  }
}
