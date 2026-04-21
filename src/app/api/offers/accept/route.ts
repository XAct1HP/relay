import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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

    const { messageId } = await request.json()

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

    // Find the matching custom_offers row to get listing_id
    const { data: offerRow } = await supabase
      .from('custom_offers')
      .select('id, listing_id, size, offer_price')
      .eq('conversation_id', message.conversation_id)
      .eq('sender_id', message.sender_id)
      .eq('offer_price', message.custom_offer_price)
      .eq('size', message.custom_offer_size)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (!offerRow || !offerRow.listing_id) {
      return NextResponse.json({ error: 'Could not find offer details' }, { status: 404 })
    }

    // Return everything the client needs to build the checkout URL
    return NextResponse.json({
      listingId: offerRow.listing_id,
      size: offerRow.size,
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
