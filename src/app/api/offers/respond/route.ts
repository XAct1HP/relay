import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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

    // Get current user
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messageId, action, conversationId } = await request.json()

    if (!messageId || !action || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Use service role to bypass RLS for cross-user updates
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch the message to get offer details
    const { data: message, error: msgFetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('message_type', 'custom_offer')
      .single()

    if (msgFetchError || !message) {
      return NextResponse.json({ error: 'Offer message not found' }, { status: 404 })
    }

    // Verify the user is a participant in the conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('participant_ids')
      .eq('id', message.conversation_id)
      .single()

    if (!conversation || !conversation.participant_ids.includes(user.id)) {
      return NextResponse.json({ error: 'Not authorized for this conversation' }, { status: 403 })
    }

    // The responder should NOT be the sender of the offer
    if (message.sender_id === user.id) {
      return NextResponse.json({ error: 'Cannot respond to your own offer' }, { status: 400 })
    }

    // Check offer is still pending
    if (message.custom_offer_status !== 'pending') {
      return NextResponse.json({ error: 'Offer has already been responded to' }, { status: 400 })
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined'

    // Update the message status
    const { error: msgUpdateError } = await supabase
      .from('messages')
      .update({ custom_offer_status: newStatus })
      .eq('id', messageId)

    if (msgUpdateError) {
      console.error('Message update error:', msgUpdateError)
      return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
    }

    // Update matching custom_offers record
    await supabase
      .from('custom_offers')
      .update({ status: newStatus })
      .eq('conversation_id', message.conversation_id)
      .eq('sender_id', message.sender_id)
      .eq('offer_price', message.custom_offer_price)
      .eq('size', message.custom_offer_size)
      .eq('status', 'pending')

    // Send a system message
    const offerContent = message.content || `$${message.custom_offer_price}`
    await supabase.from('messages').insert({
      conversation_id: message.conversation_id,
      sender_id: user.id,
      content: action === 'accept'
        ? `Offer accepted: ${offerContent}`
        : `Offer declined: ${offerContent}`,
      message_type: action === 'accept' ? 'offer_accepted' : 'offer_declined',
    })

    // If accepted, find the listing ID from custom_offers for the checkout redirect
    let listingId = null
    let size = message.custom_offer_size
    let offerPrice = message.custom_offer_price

    if (action === 'accept') {
      const { data: offer } = await supabase
        .from('custom_offers')
        .select('listing_id, size, offer_price')
        .eq('conversation_id', message.conversation_id)
        .eq('sender_id', message.sender_id)
        .eq('offer_price', message.custom_offer_price)
        .eq('size', message.custom_offer_size)
        .limit(1)
        .single()

      if (offer) {
        listingId = offer.listing_id
        size = offer.size
        offerPrice = offer.offer_price
      }
    }

    return NextResponse.json({
      success: true,
      action: newStatus,
      listingId,
      size,
      offerPrice,
    })
  } catch (error) {
    console.error('Offer respond error:', error)
    return NextResponse.json(
      { error: 'Failed to process offer response' },
      { status: 500 }
    )
  }
}
