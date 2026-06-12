import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { evaluateOrderAuthenticationRequirements } from '@/lib/order-auth'
import { buildOrderPayoutSnapshotForTier } from '@/lib/payouts'
import { logRelayAuditEvent } from '@/lib/relay-audit'

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

function normalizePhotoUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : null

      // --- Tag bundle purchase ---
      if (metadata.type === 'tag_bundle_purchase') {
        const { bundleId, bundleName, quantity, priceCents, sellerId } = metadata

        if (!bundleId || !sellerId || !quantity) {
          return NextResponse.json({ error: 'Invalid tag bundle metadata' }, { status: 400 })
        }

        // Deduplicate by checkout session id
        if (paymentIntentId) {
          const { data: existing } = await supabase
            .from('tag_orders')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntentId)
            .maybeSingle()

          if (existing?.id) {
            return NextResponse.json({ received: true })
          }
        }

        const { error: insertError } = await supabase
          .from('tag_orders')
          .insert({
            seller_id: sellerId,
            bundle_id: bundleId,
            bundle_name: bundleName || bundleId,
            quantity: parseInt(quantity, 10),
            price_cents: parseInt(priceCents || '0', 10),
            status: 'paid',
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
            paid_at: new Date().toISOString(),
          })

        if (insertError) {
          console.error('Tag order creation error:', insertError)
          return NextResponse.json({ error: 'Failed to create tag order' }, { status: 500 })
        }

        return NextResponse.json({ received: true })
      }

      // --- Shoe purchase (existing logic) ---
      const listingId = metadata.listingId
      const listingVariantId = metadata.listingVariantId || null
      const listingUsedItemId = metadata.listingUsedItemId || null
      const usedConditionPhotoUrl = normalizePhotoUrl(metadata.usedConditionPhotoUrl)
      const size = metadata.size
      const buyerId = metadata.buyerId
      const sellerId = metadata.sellerId
      const customOfferId = metadata.customOfferId

      if (!listingId || !size || !buyerId || !sellerId) {
        return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 })
      }

      if (paymentIntentId) {
        const { data: existingOrder, error: existingOrderError } = await supabase
          .from('orders')
          .select('id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle()

        if (existingOrderError) {
          console.error('Existing order lookup error:', existingOrderError)
        } else if (existingOrder?.id) {
          return NextResponse.json({ received: true })
        }
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
      const randomAuditSeed = paymentIntentId || session.id || `${sellerId}:${listingId}:${size}`

      const [{ data: listingRecord }, { data: sellerProfile }] = await Promise.all([
        supabase
          .from('listings')
          .select('id, sku, sku_normalized')
          .eq('id', listingId)
          .single(),
        supabase
          .from('profiles')
          .select('id, seller_tier')
          .eq('id', sellerId)
          .single(),
      ])

      const authDecision = await evaluateOrderAuthenticationRequirements(supabase as any, {
        sellerId,
        sellerTier: sellerProfile?.seller_tier || 'tier_1',
        orderValueCents: Math.round(shoePrice * 100),
        sku: listingRecord?.sku || null,
        skuNormalized: listingRecord?.sku_normalized || null,
        randomSeed: randomAuditSeed,
      })
      const payoutSnapshot = buildOrderPayoutSnapshotForTier(
        sellerProfile?.seller_tier || 'tier_1'
      )

      let variantUpdated = false
      let usedItemUpdated = false

      if (listingUsedItemId) {
        if (!usedConditionPhotoUrl) {
          console.error('Used item purchase missing condition photo snapshot:', listingUsedItemId)
          return NextResponse.json({ error: 'Invalid used item metadata' }, { status: 400 })
        }

        const { data: updatedUsedItems, error: usedItemUpdateError } = await supabase
          .from('listing_used_items')
          .update({
            quantity: 0,
            is_active: false,
          })
          .eq('id', listingUsedItemId)
          .eq('listing_id', listingId)
          .eq('is_active', true)
          .eq('quantity', 1)
          .not('condition_photo_url', 'is', null)
          .neq('condition_photo_url', '')
          .select('id')

        if (usedItemUpdateError) {
          console.error('Used item quantity update error:', usedItemUpdateError)
          return NextResponse.json({ error: 'Failed to reserve used item' }, { status: 500 })
        } else if ((updatedUsedItems || []).length > 0) {
          usedItemUpdated = true
        } else {
          return NextResponse.json(
            { error: 'This used pair is no longer available' },
            { status: 409 }
          )
        }
      }

      const { data: insertedOrder, error: orderError } = await supabase
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
          stripe_payment_intent_id: paymentIntentId,
          challenge_code: challengeCode,
          buyer_shipping_address: buyerShippingAddress,
          shipping_deadline: shippingDeadline.toISOString(),
          purchased_condition_photo_url: listingUsedItemId ? usedConditionPhotoUrl : null,
          relay_tag_required: authDecision.relayTagRequired,
          checkcheck_required: authDecision.checkcheckRequired,
          checkcheck_reason: authDecision.checkcheckReason,
          checkcheck_status: authDecision.checkcheckStatus,
          random_audit_required: authDecision.randomAuditRequired,
          random_audit_rate_bps_snapshot: authDecision.randomAuditRateBpsSnapshot,
          high_risk_sku_required: authDecision.highRiskSkuRequired,
          high_risk_sku_id: authDecision.highRiskSkuId,
          high_risk_sku_reason: authDecision.highRiskSkuReason,
          auth_requirements_evaluated_at: authDecision.authRequirementsEvaluatedAt,
          seller_tier_snapshot: payoutSnapshot.sellerTierSnapshot,
          payout_schedule: payoutSnapshot.payoutSchedule,
          reserve_percentage_bps_snapshot: payoutSnapshot.reservePercentageBps,
          reserve_hold_duration_days_snapshot: payoutSnapshot.reserveHoldDurationDays,
          minimum_reserve_balance_cents_snapshot: payoutSnapshot.minimumReserveBalanceCents,
        })
        .select('id')
        .single()

      if (orderError) {
        console.error('Order creation error:', orderError)

        if (listingUsedItemId && usedItemUpdated) {
          const { error: rollbackError } = await supabase
            .from('listing_used_items')
            .update({
              quantity: 1,
              is_active: true,
            })
            .eq('id', listingUsedItemId)
            .eq('listing_id', listingId)

          if (rollbackError) {
            console.error('Used item rollback error:', rollbackError)
          }
        }

        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
      }

      await logRelayAuditEvent(supabase, {
        actorUserId: buyerId,
        actorRole: 'buyer',
        orderId: insertedOrder?.id || null,
        sellerId,
        eventType: 'stripe.checkout_session_completed',
        metadata: {
          listingId,
          paymentIntentId,
          sellerTierSnapshot: payoutSnapshot.sellerTierSnapshot,
          payoutSchedule: payoutSnapshot.payoutSchedule,
          reservePercentageBps: payoutSnapshot.reservePercentageBps,
          checkcheckRequired: authDecision.checkcheckRequired,
          checkcheckReason: authDecision.checkcheckReason,
          randomAuditRequired: authDecision.randomAuditRequired,
          highRiskSkuRequired: authDecision.highRiskSkuRequired,
        },
      })

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
