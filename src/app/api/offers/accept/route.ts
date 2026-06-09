import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { SOLD_OUT_OFFER_ERROR } from '@/lib/offers'
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
    // Authenticate the user (same pattern as /api/stripe/checkout)
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

    const { messageId, customOfferId } = await request.json()

    if (!messageId) {
      return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })
    }

    // Use service role to bypass RLS — buyer can't read seller's custom_offers
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch the offer message
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('message_type', 'custom_offer')
      .single()

    if (msgError || !message) {
      return NextResponse.json({ error: 'Offer message not found' }, { status: 404 })
    }

    // Verify the user is a participant in this conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('participant_ids')
      .eq('id', message.conversation_id)
      .single()

    if (!conversation || !conversation.participant_ids.includes(user.id)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // The accepter should NOT be the sender of the offer
    if (message.sender_id === user.id) {
      return NextResponse.json({ error: 'Cannot accept your own offer' }, { status: 400 })
    }

    // Check offer is still pending
    if (message.custom_offer_status !== 'pending') {
      return NextResponse.json({ error: 'Offer already responded to' }, { status: 400 })
    }

    let offerLookup = supabase
      .from('custom_offers')
      .select('id, listing_id, listing_variant_id, size, offer_price, status')
      .eq('conversation_id', message.conversation_id)
      .eq('sender_id', message.sender_id)
      .eq('status', 'pending')

    if (customOfferId) {
      offerLookup = offerLookup.eq('id', customOfferId)
    } else {
      offerLookup = offerLookup
        .eq('offer_price', message.custom_offer_price)
        .eq('size', message.custom_offer_size)
    }

    const { data: offerRow } = await offerLookup.limit(1).maybeSingle()

    if (!offerRow || !offerRow.listing_id) {
      return NextResponse.json({ error: 'Could not find offer details' }, { status: 404 })
    }

    const { data: listing } = await supabase
      .from('listings')
      .select('id, status, sizes, condition, inventory_review_status')
      .eq('id', offerRow.listing_id)
      .maybeSingle()

    if (!listing || listing.status !== 'active') {
      return NextResponse.json({ error: SOLD_OUT_OFFER_ERROR }, { status: 409 })
    }

    const resolvedVariant = await resolveListingVariant(supabase, offerRow.listing_id, {
      variantId: offerRow.listing_variant_id,
      size: offerRow.size,
    })

    let listingVariantId = offerRow.listing_variant_id || null
    let size = offerRow.size
    if (resolvedVariant) {
      if ((resolvedVariant.quantity || 0) <= 0) {
        return NextResponse.json({ error: SOLD_OUT_OFFER_ERROR }, { status: 409 })
      }
      listingVariantId = resolvedVariant.id
      size = resolvedVariant.size
    } else {
      const legacySize = getLegacySizeEntry(listing.sizes as any[], offerRow.size)
      if (!legacySize || (legacySize.quantity || 0) <= 0) {
        return NextResponse.json({ error: SOLD_OUT_OFFER_ERROR }, { status: 409 })
      }

      const legacyCondition = getLegacySizeEntryCondition(listing.condition, legacySize as any)
      if (
        legacyCondition === 'used' ||
        listing.inventory_review_status === 'legacy_used_photo_review_required'
      ) {
        return NextResponse.json(
          { error: 'This offer references legacy used inventory that must be itemized before purchase.' },
          { status: 409 }
        )
      }

      size = String(legacySize.size)
    }

    // Return everything the client needs to build the checkout URL
    return NextResponse.json({
      listingId: offerRow.listing_id,
      listingVariantId,
      size,
      offerPrice: offerRow.offer_price,
      customOfferId: offerRow.id,
    })
  } catch (error) {
    console.error('Offer accept error:', error)
    return NextResponse.json(
      { error: 'Failed to process offer' },
      { status: 500 }
    )
  }
}
