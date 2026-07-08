import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { resolveListingVariant } from '@/lib/listings'
import { formatListingTitle } from '@/lib/listing-display'

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

interface UsedItemRow {
  id: string
  size: string
  price: number
  quantity: number
  is_active: boolean
  condition: 'like_new' | 'used_excellent' | 'used_good' | 'used_fair'
  condition_photo_url: string
}

function normalizePhotoUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getLegacySizeEntryCondition(
  listingCondition: unknown,
  sizeEntry: { condition?: unknown } | null
) {
  if (sizeEntry?.condition === 'used') {
    return 'used'
  }

  const normalizedListingCondition = typeof listingCondition === 'string' ? listingCondition : ''
  return normalizedListingCondition === 'mixed' || normalizedListingCondition.startsWith('used')
    ? 'used'
    : 'new'
}

function getLegacySizeEntry(
  sizes: Array<{ size: string; price: number; quantity: number }> | null | undefined,
  size: string
) {
  return Array.isArray(sizes)
    ? sizes.find((entry) => String(entry.size) === String(size))
    : null
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

    const { listingId, size, listingVariantId, listingUsedItemId, shippingCost, buyerAddress, customOfferId } =
      await request.json()

    if (!listingId || (!size && !listingVariantId && !listingUsedItemId) || shippingCost === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, seller_id, brand, model, images, sizes, condition, inventory_review_status, status, seller:profiles(vacation_mode_enabled)')
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

    if ((listing as any).seller?.vacation_mode_enabled) {
      return NextResponse.json(
        { error: 'Seller is temporarily unavailable while vacation mode is on.' },
        { status: 400 }
      )
    }

    let resolvedSize = String(size || '')
    let resolvedVariantId = String(listingVariantId || '') || null
    let resolvedUsedItemId = String(listingUsedItemId || '') || null
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
    let usedItemRow: UsedItemRow | null = null

    if (resolvedUsedItemId) {
      const { data: usedItem, error: usedItemError } = await supabase
        .from('listing_used_items')
        .select('id, size, price, quantity, is_active, condition, condition_photo_url')
        .eq('id', resolvedUsedItemId)
        .eq('listing_id', listingId)
        .maybeSingle()

      if (usedItemError || !usedItem) {
        return NextResponse.json({ error: 'This used pair is no longer available' }, { status: 404 })
      }

      usedItemRow = {
        id: usedItem.id,
        size: String(usedItem.size),
        price: Number(usedItem.price),
        quantity: Number(usedItem.quantity) || 0,
        is_active: usedItem.is_active !== false,
        condition: usedItem.condition,
        condition_photo_url: normalizePhotoUrl(usedItem.condition_photo_url),
      }
    } else {
      const resolvedVariant = await resolveListingVariant(supabase, listingId, {
        variantId: resolvedVariantId,
        size: resolvedSize,
      })

      if (resolvedVariant) {
        variantRow = {
          id: resolvedVariant.id,
          size: resolvedVariant.size,
          price: Number(resolvedVariant.price),
          quantity: resolvedVariant.quantity || 0,
          is_active: resolvedVariant.is_active,
        }
      }
    }

    if (usedItemRow) {
      resolvedUsedItemId = usedItemRow.id
      resolvedSize = usedItemRow.size

      if (usedItemRow.is_active === false || usedItemRow.quantity !== 1) {
        return NextResponse.json(
          { error: 'This used pair is no longer available' },
          { status: 400 }
        )
      }

      if (!usedItemRow.condition_photo_url) {
        return NextResponse.json(
          { error: 'This used pair is missing its required condition photo' },
          { status: 400 }
        )
      }

      price = usedItemRow.price
    } else if (variantRow) {
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
      const sizeEntry = getLegacySizeEntry(listing.sizes as any[], resolvedSize)

      if (!sizeEntry || (sizeEntry.quantity || 0) <= 0) {
        return NextResponse.json(
          { error: 'This size is no longer available' },
          { status: 400 }
        )
      }

      const sizeEntryCondition = getLegacySizeEntryCondition(listing.condition, sizeEntry as any)
      if (sizeEntryCondition === 'used') {
        return NextResponse.json(
          { error: 'Legacy used inventory must be purchased as an itemized used pair.' },
          { status: 400 }
        )
      }

      if (listing.inventory_review_status === 'legacy_used_photo_review_required') {
        return NextResponse.json(
          { error: 'This listing has used inventory that needs seller review before purchase.' },
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
            name: formatListingTitle(listing.brand, listing.model, undefined, "Listing"),
            description: `Size: ${resolvedSize}`,
            images: usedItemRow?.condition_photo_url
              ? [usedItemRow.condition_photo_url]
              : listing.images?.length
              ? [listing.images[0]]
              : [],
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
      cancel_url: `${request.headers.get('origin')}/listing/${listingId}`,
      metadata: {
        listingId,
        listingVariantId: resolvedVariantId || '',
        listingUsedItemId: resolvedUsedItemId || '',
        usedConditionPhotoUrl: usedItemRow?.condition_photo_url || '',
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
