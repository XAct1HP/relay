import { NextRequest, NextResponse } from 'next/server'
import { requireAdminBearerToken } from '@/lib/admin-access'
import { finalizeBuyerRefundAndSellerLoss } from '@/lib/payouts'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const { user, adminClient } = await requireAdminBearerToken(request)

    const { data: order, error: fetchError } = await adminClient
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (!['return_pending', 'return_shipped'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Order is not awaiting return. Current status: ' + order.status },
        { status: 400 }
      )
    }

    await finalizeBuyerRefundAndSellerLoss(adminClient, {
      orderId,
      actorUserId: user.id,
      actorRole: 'admin',
    })

    await adminClient
      .from('orders')
      .update({
        return_status: 'delivered',
        return_delivered_at: new Date().toISOString(),
        seller_funds_frozen: false,
      })
      .eq('id', orderId)

    await adminClient
      .from('order_disputes')
      .update({
        financial_outcome: 'buyer_refunded',
        status: 'closed',
        seller_funds_frozen: false,
      })
      .eq('order_id', orderId)

    const { data: updatedOrder } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Mark returned error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark return as received' },
      { status: 500 }
    )
  }
}
