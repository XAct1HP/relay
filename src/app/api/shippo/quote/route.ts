import { NextRequest, NextResponse } from 'next/server'
import { toShippoAddress } from '@/lib/shipping-addresses'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY!

export async function POST(request: NextRequest) {
  try {
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

    const { sellerAddress, buyerAddress, approxSizing } = await request.json()
    const normalizedSellerAddress = toShippoAddress(sellerAddress)
    const normalizedBuyerAddress = toShippoAddress(buyerAddress)

    if (!normalizedSellerAddress || !normalizedBuyerAddress) {
      return NextResponse.json(
        { error: 'Missing seller or buyer address' },
        { status: 400 }
      )
    }

    if (
      !normalizedSellerAddress.street1 ||
      !(normalizedSellerAddress.email || user?.email) ||
      !normalizedSellerAddress.phone ||
      !normalizedSellerAddress.city ||
      !normalizedSellerAddress.state ||
      !normalizedSellerAddress.zip ||
      !normalizedBuyerAddress.street1 ||
      !normalizedBuyerAddress.city ||
      !normalizedBuyerAddress.state ||
      !normalizedBuyerAddress.zip
    ) {
      return NextResponse.json(
        { error: 'Shipping address information is incomplete' },
        { status: 400 }
      )
    }

    // Create shipment for quote
    const shipmentResponse = await fetch('https://api.goshippo.com/shipments/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ShippoToken ${SHIPPO_API_KEY}`,
      },
      body: JSON.stringify({
        address_from: {
          ...normalizedSellerAddress,
          email: normalizedSellerAddress.email || user?.email || undefined,
          phone: normalizedSellerAddress.phone,
        },
        address_to: {
          ...normalizedBuyerAddress,
          email: normalizedBuyerAddress.email || user?.email || undefined,
          phone: normalizedBuyerAddress.phone,
        },
        parcels: [
          {
            length: '10',
            width: '7',
            height: '4',
            distance_unit: 'in',
            weight: '1',
            mass_unit: 'lb',
          },
        ],
      }),
    })

    if (!shipmentResponse.ok) {
      console.error('Shippo shipment error:', shipmentResponse.statusText)
      return NextResponse.json(
        { error: 'Failed to create shipment' },
        { status: 500 }
      )
    }

    const shipment = await shipmentResponse.json()

    if (!shipment.rates || shipment.rates.length === 0) {
      return NextResponse.json({ error: 'No shipping rates available' }, { status: 400 })
    }

    // Find cheapest rate and add $1.50 buffer
    const cheapestRate = shipment.rates.reduce(
      (min: any, rate: any) =>
        parseFloat(rate.amount) < parseFloat(min.amount) ? rate : min,
      shipment.rates[0]
    )

    const bufferedAmount = (parseFloat(cheapestRate.amount) + 1.5).toFixed(2)

    // Return all rates with buffer applied to cheapest
    const ratesWithBuffer = shipment.rates.map((rate: any) => ({
      id: rate.object_id,
      provider: rate.provider,
      servicelevel: rate.servicelevel.name,
      amount: rate.object_id === cheapestRate.object_id ? bufferedAmount : rate.amount,
      currency: rate.currency,
      days: rate.estimated_days,
    }))

    return NextResponse.json({
      rates: ratesWithBuffer,
      shipmentId: shipment.object_id,
    })
  } catch (error) {
    console.error('Shippo quote error:', error)
    return NextResponse.json(
      { error: 'Failed to get shipping quotes' },
      { status: 500 }
    )
  }
}
