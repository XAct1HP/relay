import { NextRequest, NextResponse } from 'next/server'

const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY!

export async function POST(request: NextRequest) {
  try {
    const { sellerAddress, buyerAddress, approxSizing } = await request.json()

    if (!sellerAddress || !buyerAddress) {
      return NextResponse.json(
        { error: 'Missing seller or buyer address' },
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
        address_from: sellerAddress,
        address_to: buyerAddress,
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
