import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

interface VariantRow {
  id: string
  size: string
  price: number
  quantity: number
  is_active: boolean
}

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

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { listingId, size, listingVariantId, shippingCost, buyerAddress, customOfferId } =
      await request.json()

    if (!listingId || (!size && !listingVariantId) || shippingCost === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, seller_id, brand, model, images, sizes, status')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.status !== 'active') {
      return NextResponse.json(
        { error: 'This listing is no longer available' },
        { status: 400 }
      )
    }

    let resolvedSize = String(size || '')
    let resolvedVariantId = String(listingVariantId || '') || null
    let price = 0

    if (customOfferId) {
      const { data: offer, error: offerError } = await supabase
        .from('custom_offers')
        .select('offer_price, status, size, listing_variant_id')
        .eq('id', customOfferId)
        .single()

      if (offerError || !offer) {
        return NextResponse.json({ error: 'Custom offer not found' }, { status: 404 })
      }
      if (offer.status !== 'accepted') {
        return NextResponse.json({ error: 'This offer is no longer valid' }, { status: 400 })
      }

      resolvedSize = offer.size || resolvedSize
      resolvedVariantId = offer.listing_variant_id || resolvedVariantId
      price = parseFloat(offer.offer_price)
    }

    let variantRow: VariantRow | null = null

    if (resolvedVariantId) {
      const { data: variant, error: variantError } = await supabase
        .from('listing_variants')
        .select('id, size, price, quantity, is_active')
        .eq('id', resolvedVariantId)
        .eq('listing_id', listingId)
        .single()

      if (variantError || !variant || variant.is_active === false) {
        return NextResponse.json(
          { error: 'This size is no longer available' },
          { status: 400 }
        )
      }

      variantRow = {
        id: variant.id,
        size: variant.size,
        price: Number(variant.price),
        quantity: variant.quantity || 0,
        is_active: variant.is_active,
      }
    } else {
      const { data: variant } = await supabase
        .from('listing_variants')
        .select('id, size, price, quantity, is_active')
        .eq('listing_id', listingId)
        .eq('size', String(size))
        .maybeSingle()

      if (variant && variant.is_active !== false) {
        variantRow = {
          id: variant.id,
          size: variant.size,
          price: Number(variant.price),
          quantity: variant.quantity || 0,
          is_active: variant.is_active,
        }
      }
    }

    if (variantRow) {
      resolvedVariantId = variantRow.id
      resolvedSize = variantRow.size

      if (variantRow.quantity <= 0) {
        return NextResponse.json(
          { error: 'This size is no longer available' },
          { status: 400 }
        )
      }

      if (!customOfferId) {
        price = variantRow.price
      }
    } else {
      const sizes = listing.sizes as any[]
      const sizeEntry = Array.isArray(sizes)
        ? sizes.find((entry: any) => String(entry.size) === String(size))
        : null

      if (!sizeEntry || (sizeEntry.quantity || 0) <= 0) {
        return NextResponse.json(
          { error: 'This size is no longer available' },
          { status: 400 }
        )
      }

      resolvedSize = String(sizeEntry.size)
      if (!customOfferId) {
        price = Number(sizeEntry.price)
      }
    }

    if (!price || price <= 0) {
      return NextResponse.json({ error: 'Invalid price for this listing' }, { status: 400 })
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${listing.brand} ${listing.model}`,
            description: `Size: ${resolvedSize}`,
            images: listing.images?.length ? [listing.images[0]] : [],
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: 1,
      },
    ]

    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping',
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      })
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${request.headers.get('origin')}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin')}/listings/${listingId}`,
      metadata: {
        listingId,
        listingVariantId: resolvedVariantId || '',
        size: resolvedSize,
        buyerId: user.id,
        sellerId: listing.seller_id,
        customOfferId: customOfferId || '',
        shoePrice: String(price),
        shippingCost: String(shippingCost),
        buyerAddress: buyerAddress ? JSON.stringify(buyerAddress) : '',
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
