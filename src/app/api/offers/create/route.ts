import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { formatOfferListingName } from '@/lib/offers'
import { resolveListingVariant } from '@/lib/listings'

function getLegacySizeEntry(
  sizes: Array<{ size: string; price: number; quantity: number }> | null | undefined,
  size: string
) {
  return Array.isArray(sizes)
    ? sizes.find((entry) => String(entry.size) === String(size))
    : null
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

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
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
    } = await supabaseAuth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId, listingId, listingVariantId, size, offerPrice } = await request.json()

    if (!conversationId || !listingId || !size || offerPrice === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const parsedOfferPrice = Number(offerPrice)
    if (!Number.isFinite(parsedOfferPrice) || parsedOfferPrice <= 0) {
      return NextResponse.json({ error: 'Invalid offer amount' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: senderProfile, error: senderProfileError } = await supabase
      .from('profiles')
      .select('offers_enabled')
      .eq('id', user.id)
      .single()

    if (senderProfileError || !senderProfile) {
      return NextResponse.json({ error: 'Could not load sender profile' }, { status: 400 })
    }

    if (!senderProfile.offers_enabled) {
      return NextResponse.json(
        { error: 'Enable offers in seller settings before sending custom offers.' },
        { status: 403 }
      )
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('participant_ids')
      .eq('id', conversationId)
      .single()

    if (conversationError || !conversation || !conversation.participant_ids.includes(user.id)) {
      return NextResponse.json({ error: 'Not authorized for this conversation' }, { status: 403 })
    }

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, seller_id, brand, model, nickname, sku, sizes, condition, inventory_review_status, status')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.seller_id !== user.id) {
      return NextResponse.json({ error: 'You can only send offers for your own listings' }, { status: 403 })
    }

    if (listing.status !== 'active') {
      return NextResponse.json({ error: 'This listing is no longer active' }, { status: 400 })
    }

    const selectedVariant = await resolveListingVariant(supabase, listingId, {
      variantId: listingVariantId,
      size,
    })

    let resolvedSize = String(size)
    let resolvedVariantId: string | null = null
    let originalPrice = 0
    let availableQuantity = 0

    if (selectedVariant) {
      resolvedSize = selectedVariant.size
      resolvedVariantId = selectedVariant.id
      originalPrice = Number(selectedVariant.price) || 0
      availableQuantity = selectedVariant.quantity || 0
    } else {
      const legacySizeEntry = getLegacySizeEntry(listing.sizes as any[], String(size))
      if (!legacySizeEntry) {
        return NextResponse.json({ error: 'Select a valid size before sending an offer.' }, { status: 400 })
      }

      const legacyCondition = getLegacySizeEntryCondition(listing.condition, legacySizeEntry as any)
      if (legacyCondition === 'used') {
        return NextResponse.json(
          { error: 'Legacy used inventory must be offered and purchased as an individual used pair.' },
          { status: 400 }
        )
      }

      if (listing.inventory_review_status === 'legacy_used_photo_review_required') {
        return NextResponse.json(
          { error: 'This listing has used inventory that needs seller review before offers can be completed.' },
          { status: 400 }
        )
      }

      resolvedSize = String(legacySizeEntry.size)
      originalPrice = Number(legacySizeEntry.price) || 0
      availableQuantity = legacySizeEntry.quantity || 0
    }

    if (availableQuantity <= 0) {
      return NextResponse.json({ error: 'This size is no longer available.' }, { status: 409 })
    }

    if (parsedOfferPrice >= originalPrice) {
      return NextResponse.json(
        { error: 'Offer amount must be lower than the listed size price.' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const listingName = formatOfferListingName(listing)

    const { data: offerRow, error: offerError } = await supabase
      .from('custom_offers')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        listing_id: listingId,
        listing_variant_id: resolvedVariantId,
        size: resolvedSize,
        original_price: originalPrice,
        offer_price: parsedOfferPrice,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id, listing_id, listing_variant_id, size, original_price, offer_price, status, created_at')
      .single()

    if (offerError || !offerRow) {
      return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 })
    }

    const messageContent = `Custom offer: $${parsedOfferPrice.toFixed(2)} for ${listingName} (Size ${resolvedSize})`
    const { data: messageRow, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageContent,
        message_type: 'custom_offer',
        custom_offer_price: parsedOfferPrice,
        custom_offer_status: 'pending',
        custom_offer_size: resolvedSize,
      })
      .select('*')
      .single()

    if (messageError || !messageRow) {
      await supabase.from('custom_offers').delete().eq('id', offerRow.id)
      return NextResponse.json({ error: 'Failed to create offer message' }, { status: 500 })
    }

    await supabase
      .from('conversations')
      .update({
        last_message: `Custom offer: $${parsedOfferPrice.toFixed(2)}`,
        last_message_at: now,
      })
      .eq('id', conversationId)

    return NextResponse.json({
      message: {
        ...messageRow,
        _offerListingName: listingName,
        _offerOriginalPrice: Number(offerRow.original_price) || 0,
        _offerListingId: offerRow.listing_id,
        _offerCustomOfferId: offerRow.id,
        _offerVariantId: offerRow.listing_variant_id || undefined,
      },
    })
  } catch (error) {
    console.error('Offer create error:', error)
    return NextResponse.json(
      { error: 'Failed to send offer' },
      { status: 500 }
    )
  }
}
