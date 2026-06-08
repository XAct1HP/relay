import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

function generateChallengeCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

async function reconcileListingInventoryStatus(
  supabase: any,
  listingId: string
) {
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id, status')
    .eq('id', listingId)
    .maybeSingle()

  if (listingError || !listing) {
    console.error('Failed to fetch listing status for inventory reconcile:', listingError)
    return
  }

  const listingRow = listing as { id: string; status: string } | null

  if (!listingRow) {
    return
  }

  if (listingRow.status !== 'active' && listingRow.status !== 'sold_out') {
    return
  }

  const { data: variantRows, error: variantError } = await supabase
    .from('listing_variants')
    .select('quantity, is_active')
    .eq('listing_id', listingId)

  if (variantError) {
    console.error('Failed to fetch listing variants for inventory reconcile:', variantError)
    return
  }

  const { data: usedItemRows, error: usedItemError } = await supabase
    .from('listing_used_items')
    .select('quantity, is_active')
    .eq('listing_id', listingId)

  if (usedItemError) {
    console.error('Failed to fetch used items for inventory reconcile:', usedItemError)
    return
  }

  const hasAvailableVariant = ((variantRows || []) as Array<{
    quantity: number | string | null
    is_active: boolean | null
  }>).some(
    (variant) => Number(variant.quantity) > 0 && variant.is_active !== false
  )
  const hasAvailableUsedItem = ((usedItemRows || []) as Array<{
    quantity: number | string | null
    is_active: boolean | null
  }>).some(
    (item) => Number(item.quantity) > 0 && item.is_active !== false
  )
  const nextStatus = hasAvailableVariant || hasAvailableUsedItem ? 'active' : 'sold_out'

  if (nextStatus === listingRow.status) {
    return
  }

  const { error: updateError } = await supabase
    .from('listings')
    .update({ status: nextStatus })
    .eq('id', listingId)

  if (updateError) {
    console.error('Failed to update listing status after inventory change:', updateError)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const metadata = session.metadata as Record<string, string>

      const listingId = metadata.listingId
      const listingVariantId = metadata.listingVariantId || null
      const listingUsedItemId = metadata.listingUsedItemId || null
      const size = metadata.size
      const buyerId = metadata.buyerId
      const sellerId = metadata.sellerId
      const customOfferId = metadata.customOfferId

      if (!listingId || !size || !buyerId || !sellerId) {
        return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 })
      }

      const shoePrice = parseFloat(metadata.shoePrice || '0')
      const shippingCost = parseFloat(metadata.shippingCost || '0')

      let buyerShippingAddress = null
      if (metadata.buyerAddress) {
        try {
          buyerShippingAddress = JSON.parse(metadata.buyerAddress)
        } catch {
          console.error('Failed to parse buyer address from metadata')
        }
      }

      const platformFee = shoePrice * 0.01
      const stripeFee = shoePrice * 0.03 + 0.3
      const sellerEarnings = shoePrice - platformFee - stripeFee

      const shippingDeadline = new Date()
      shippingDeadline.setDate(shippingDeadline.getDate() + 5)

      const challengeCode = generateChallengeCode()

      const { error: orderError } = await supabase
        .from('orders')
        .insert({
          listing_id: listingId,
          listing_variant_id: listingVariantId,
          listing_used_item_id: listingUsedItemId,
          buyer_id: buyerId,
          seller_id: sellerId,
          custom_offer_id: customOfferId || null,
          status: 'paid',
          size,
          price: shoePrice,
          shipping_cost: shippingCost,
          platform_fee: platformFee,
          stripe_fee: stripeFee,
          seller_earnings: sellerEarnings,
          stripe_payment_intent_id: session.payment_intent as string,
          challenge_code: challengeCode,
          buyer_shipping_address: buyerShippingAddress,
          shipping_deadline: shippingDeadline.toISOString(),
        })

      if (orderError) {
        console.error('Order creation error:', orderError)
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
      }

      let variantUpdated = false
      let usedItemUpdated = false

      if (listingUsedItemId) {
        const { data: updatedUsedItems, error: usedItemUpdateError } = await supabase
          .from('listing_used_items')
          .update({
            quantity: 0,
            is_active: false,
          })
          .eq('id', listingUsedItemId)
          .eq('listing_id', listingId)
          .eq('is_active', true)
          .gt('quantity', 0)
          .select('id')

        if (usedItemUpdateError) {
          console.error('Used item quantity update error:', usedItemUpdateError)
        } else if ((updatedUsedItems || []).length > 0) {
          usedItemUpdated = true
        }
      }

      if (!listingUsedItemId && listingVariantId) {
        const { data: decrementedRows, error: decrementError } = await supabase.rpc(
          'decrement_listing_variant_inventory',
          { target_listing_variant_id: listingVariantId }
        )

        if (decrementError) {
          console.error('Variant quantity update error:', decrementError)
        } else if (Array.isArray(decrementedRows) && decrementedRows.length > 0) {
          variantUpdated = true
        }
      }

      if (!listingUsedItemId && !variantUpdated) {
        const { data: variant } = await supabase
          .from('listing_variants')
          .select('id')
          .eq('listing_id', listingId)
          .eq('size', size)
          .maybeSingle()

        if (variant) {
          const { data: decrementedRows, error: decrementError } = await supabase.rpc(
            'decrement_listing_variant_inventory',
            { target_listing_variant_id: variant.id }
          )

          if (decrementError) {
            console.error('Variant quantity update error:', decrementError)
          } else if (Array.isArray(decrementedRows) && decrementedRows.length > 0) {
            variantUpdated = true
          }
        }
      }

      if (!listingUsedItemId && !variantUpdated) {
        const { data: listing, error: listingFetchError } = await supabase
          .from('listings')
          .select('sizes, status')
          .eq('id', listingId)
          .single()

        if (listingFetchError || !listing) {
          console.error('Failed to fetch listing for quantity update:', listingFetchError)
        } else {
          const sizes = listing.sizes as any[]
          if (Array.isArray(sizes)) {
            const updatedSizes = sizes.map((entry: any) => {
              if (String(entry.size) === String(size)) {
                return { ...entry, quantity: Math.max(0, (entry.quantity || 0) - 1) }
              }
              return entry
            })

            const totalRemaining = updatedSizes.reduce(
              (sum: number, entry: any) => sum + (entry.quantity || 0),
              0
            )

            const updatePayload: any = { sizes: updatedSizes }
            if (totalRemaining <= 0) {
              updatePayload.status = 'sold_out'
            }

            const { error: updateError } = await supabase
              .from('listings')
              .update(updatePayload)
              .eq('id', listingId)

            if (updateError) {
              console.error('Quantity update error:', updateError)
            }
          }
        }
      }

      if (listingUsedItemId && !usedItemUpdated) {
        console.error('Used item was not marked unavailable after checkout:', listingUsedItemId)
      }

      await reconcileListingInventoryStatus(supabase, listingId)

      if (customOfferId) {
        const { error: offerError } = await supabase
          .from('custom_offers')
          .update({ status: 'accepted' })
          .eq('id', customOfferId)

        if (offerError) {
          console.error('Offer update error:', offerError)
        }

        const { data: offerRow } = await supabase
          .from('custom_offers')
          .select('conversation_id, sender_id, offer_price, size')
          .eq('id', customOfferId)
          .single()

        if (offerRow) {
          await supabase
            .from('messages')
            .update({ custom_offer_status: 'accepted' })
            .eq('conversation_id', offerRow.conversation_id)
            .eq('sender_id', offerRow.sender_id)
            .eq('custom_offer_price', offerRow.offer_price)
            .eq('custom_offer_size', offerRow.size)
            .eq('message_type', 'custom_offer')
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
