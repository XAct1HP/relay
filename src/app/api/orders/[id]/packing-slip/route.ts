import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/orders/[id]/packing-slip
 *
 * Returns an HTML packing slip that the buyer prints and includes in their
 * return package. Contains the unique return ID (packing_slip_id) that the
 * admin uses to match up returned packages.
 *
 * Accessible by the buyer of the order only.
 */
export async function GET(
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch order with listing details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_id,
        seller_id,
        return_packing_slip_id,
        return_status,
        status,
        size,
        price,
        created_at,
        listing:listings(brand, model)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Only buyer can access the packing slip
    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Must be in return flow
    if (!order.return_packing_slip_id) {
      return NextResponse.json(
        { error: 'No packing slip available for this order' },
        { status: 400 }
      )
    }

    const listing = order.listing as any
    const brand = listing?.brand || 'Unknown'
    const model = listing?.model || 'Unknown'
    const slipId = order.return_packing_slip_id
    const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    // Generate printable HTML packing slip
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Relay Return Packing Slip - ${slipId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #111; }
    .container { max-width: 600px; margin: 0 auto; border: 2px solid #000; padding: 32px; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 24px; }
    .header img { max-width: 160px; height: auto; margin: 0 auto 8px; display: block; }
    .header h1 { font-size: 24px; font-weight: 700; letter-spacing: 2px; }
    .header p { font-size: 12px; color: #666; margin-top: 4px; }
    .slip-id-section { text-align: center; margin: 24px 0; padding: 16px; background: #f5f5f5; border: 1px dashed #333; }
    .slip-id-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
    .slip-id { font-size: 36px; font-weight: 900; font-family: 'Courier New', monospace; letter-spacing: 4px; margin-top: 4px; }
    .details { margin: 24px 0; }
    .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .details-label { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .details-value { font-size: 14px; font-weight: 600; }
    .instructions { margin-top: 24px; padding: 16px; background: #fff8e1; border: 1px solid #ffe082; border-radius: 4px; }
    .instructions h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .instructions ol { padding-left: 20px; font-size: 13px; line-height: 1.8; }
    .ship-to { margin-top: 24px; padding: 16px; border: 1px solid #ddd; border-radius: 4px; }
    .ship-to h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; color: #666; }
    .ship-to p { font-size: 14px; line-height: 1.6; }
    .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #999; }
    @media print {
      body { padding: 0; }
      .container { border: 2px solid #000; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="/branding/logo-lightmode.png" alt="Relay" />
      <p>Return Packing Slip</p>
    </div>

    <div class="slip-id-section">
      <div class="slip-id-label">Return ID</div>
      <div class="slip-id">${slipId}</div>
    </div>

    <div class="details">
      <div class="details-row">
        <span class="details-label">Item</span>
        <span class="details-value">${brand} ${model}</span>
      </div>
      <div class="details-row">
        <span class="details-label">Size</span>
        <span class="details-value">${order.size}</span>
      </div>
      <div class="details-row">
        <span class="details-label">Order ID</span>
        <span class="details-value">${orderId.slice(0, 8).toUpperCase()}</span>
      </div>
      <div class="details-row">
        <span class="details-label">Order Date</span>
        <span class="details-value">${orderDate}</span>
      </div>
    </div>

    <div class="instructions">
      <h3>Instructions</h3>
      <ol>
        <li>Print this packing slip</li>
        <li>Place it <strong>inside the box</strong> with the returned item</li>
        <li>Seal the package and attach the provided return shipping label</li>
        <li>Drop off at any carrier pickup location shown on the label</li>
        <li>Your refund will be processed once we receive and verify the return</li>
      </ol>
    </div>

    <div class="ship-to">
      <h3>Ship To</h3>
      <p>
        Relay Returns<br>
        411 E Washington St, Unit 909D<br>
        Ann Arbor, MI 48104
      </p>
    </div>

    <div class="footer">
      <p>This packing slip must be included in your return package.</p>
      <p>Without it, processing may be delayed.</p>
    </div>
  </div>

  <div class="no-print" style="text-align: center; margin-top: 24px;">
    <button onclick="window.print()" style="padding: 12px 24px; background: #000; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">
      Print Packing Slip
    </button>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    })
  } catch (error) {
    console.error('Packing slip error:', error)
    return NextResponse.json(
      { error: 'Failed to generate packing slip' },
      { status: 500 }
    )
  }
}
