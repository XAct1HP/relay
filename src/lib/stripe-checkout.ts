import "server-only";

import type Stripe from "stripe";
import { evaluateOrderAuthenticationRequirements } from "@/lib/order-auth";
import { buildOrderPayoutSnapshotForTier } from "@/lib/payouts";
import { logRelayAuditEvent } from "@/lib/relay-audit";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

export interface StripeCheckoutFinalizationResult {
  checkoutType: "shoe_order" | "tag_bundle_purchase";
  status: "created" | "existing";
  orderId?: string | null;
  tagOrderId?: string | null;
}

function generateChallengeCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function normalizePhotoUrl(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getCheckoutMetadata(session: Stripe.Checkout.Session) {
  return (session.metadata || {}) as Record<string, string>;
}

function getPaymentIntentId(session: Stripe.Checkout.Session) {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  if (
    session.payment_intent &&
    typeof session.payment_intent === "object" &&
    "id" in session.payment_intent &&
    typeof session.payment_intent.id === "string"
  ) {
    return session.payment_intent.id;
  }

  return null;
}

async function reconcileListingInventoryStatus(
  supabase: SupabaseAdminClient,
  listingId: string
) {
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, status")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError || !listing) {
    console.error("Failed to fetch listing status for inventory reconcile:", listingError);
    return;
  }

  if (listing.status !== "active" && listing.status !== "sold_out") {
    return;
  }

  const { data: variantRows, error: variantError } = await supabase
    .from("listing_variants")
    .select("quantity, is_active")
    .eq("listing_id", listingId);

  if (variantError) {
    console.error("Failed to fetch listing variants for inventory reconcile:", variantError);
    return;
  }

  const { data: usedItemRows, error: usedItemError } = await supabase
    .from("listing_used_items")
    .select("quantity, is_active")
    .eq("listing_id", listingId);

  if (usedItemError) {
    console.error("Failed to fetch used items for inventory reconcile:", usedItemError);
    return;
  }

  const hasAvailableVariant = ((variantRows || []) as Array<{
    quantity: number | string | null;
    is_active: boolean | null;
  }>).some(
    (variant) => Number(variant.quantity) > 0 && variant.is_active !== false
  );
  const hasAvailableUsedItem = ((usedItemRows || []) as Array<{
    quantity: number | string | null;
    is_active: boolean | null;
  }>).some(
    (item) => Number(item.quantity) > 0 && item.is_active !== false
  );
  const nextStatus = hasAvailableVariant || hasAvailableUsedItem ? "active" : "sold_out";

  if (nextStatus === listing.status) {
    return;
  }

  const { error: updateError } = await supabase
    .from("listings")
    .update({ status: nextStatus })
    .eq("id", listingId);

  if (updateError) {
    console.error("Failed to update listing status after inventory change:", updateError);
  }
}

async function findExistingOrder(
  supabase: SupabaseAdminClient,
  identifiers: { checkoutSessionId: string; paymentIntentId: string | null }
) {
  const { data: sessionOrder, error: sessionOrderError } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_checkout_session_id", identifiers.checkoutSessionId)
    .maybeSingle();

  if (sessionOrderError) {
    console.error("Existing order session lookup error:", sessionOrderError);
  } else if (sessionOrder?.id) {
    return sessionOrder;
  }

  if (!identifiers.paymentIntentId) {
    return null;
  }

  const { data: paymentIntentOrder, error: paymentIntentOrderError } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", identifiers.paymentIntentId)
    .maybeSingle();

  if (paymentIntentOrderError) {
    console.error("Existing order payment intent lookup error:", paymentIntentOrderError);
    return null;
  }

  return paymentIntentOrder || null;
}

async function findExistingTagOrder(
  supabase: SupabaseAdminClient,
  identifiers: { checkoutSessionId: string; paymentIntentId: string | null }
) {
  const { data: sessionOrder, error: sessionOrderError } = await supabase
    .from("tag_orders")
    .select("id")
    .eq("stripe_checkout_session_id", identifiers.checkoutSessionId)
    .maybeSingle();

  if (sessionOrderError) {
    console.error("Existing tag order session lookup error:", sessionOrderError);
  } else if (sessionOrder?.id) {
    return sessionOrder;
  }

  if (!identifiers.paymentIntentId) {
    return null;
  }

  const { data: paymentIntentOrder, error: paymentIntentOrderError } = await supabase
    .from("tag_orders")
    .select("id")
    .eq("stripe_payment_intent_id", identifiers.paymentIntentId)
    .maybeSingle();

  if (paymentIntentOrderError) {
    console.error("Existing tag order payment intent lookup error:", paymentIntentOrderError);
    return null;
  }

  return paymentIntentOrder || null;
}

async function finalizeTagBundlePurchase(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<StripeCheckoutFinalizationResult> {
  const paymentIntentId = getPaymentIntentId(session);
  const { bundleId, bundleName, quantity, priceCents, sellerId } = metadata;

  if (!bundleId || !sellerId || !quantity) {
    throw new Error("Invalid tag bundle metadata");
  }

  const existing = await findExistingTagOrder(supabase, {
    checkoutSessionId: session.id,
    paymentIntentId,
  });

  if (existing?.id) {
    return {
      checkoutType: "tag_bundle_purchase",
      status: "existing",
      tagOrderId: existing.id,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("tag_orders")
    .insert({
      seller_id: sellerId,
      bundle_id: bundleId,
      bundle_name: bundleName || bundleId,
      quantity: Number.parseInt(quantity, 10),
      price_cents: Number.parseInt(priceCents || "0", 10),
      status: "paid",
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    const recovered = await findExistingTagOrder(supabase, {
      checkoutSessionId: session.id,
      paymentIntentId,
    });

    if (recovered?.id) {
      return {
        checkoutType: "tag_bundle_purchase",
        status: "existing",
        tagOrderId: recovered.id,
      };
    }

    throw new Error(insertError.message || "Failed to create tag order");
  }

  return {
    checkoutType: "tag_bundle_purchase",
    status: "created",
    tagOrderId: inserted?.id || null,
  };
}

async function finalizeShoeOrderPurchase(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>,
  source: string
): Promise<StripeCheckoutFinalizationResult> {
  const listingId = metadata.listingId;
  const listingVariantId = metadata.listingVariantId || null;
  const listingUsedItemId = metadata.listingUsedItemId || null;
  const usedConditionPhotoUrl = normalizePhotoUrl(metadata.usedConditionPhotoUrl);
  const size = metadata.size;
  const buyerId = metadata.buyerId;
  const sellerId = metadata.sellerId;
  const customOfferId = metadata.customOfferId;
  const paymentIntentId = getPaymentIntentId(session);

  if (!listingId || !size || !buyerId || !sellerId) {
    throw new Error("Invalid checkout metadata");
  }

  const existingOrder = await findExistingOrder(supabase, {
    checkoutSessionId: session.id,
    paymentIntentId,
  });

  if (existingOrder?.id) {
    return {
      checkoutType: "shoe_order",
      status: "existing",
      orderId: existingOrder.id,
    };
  }

  const shoePrice = Number.parseFloat(metadata.shoePrice || "0");
  const shippingCost = Number.parseFloat(metadata.shippingCost || "0");

  let buyerShippingAddress = null;
  if (metadata.buyerAddress) {
    try {
      buyerShippingAddress = JSON.parse(metadata.buyerAddress);
    } catch {
      console.error("Failed to parse buyer address from metadata");
    }
  }

  const platformFee = shoePrice * 0.01;
  const stripeFee = shoePrice * 0.03 + 0.3;
  const sellerEarnings = shoePrice - platformFee - stripeFee;

  const shippingDeadline = new Date();
  shippingDeadline.setDate(shippingDeadline.getDate() + 5);

  const challengeCode = generateChallengeCode();
  const randomAuditSeed = paymentIntentId || session.id || `${sellerId}:${listingId}:${size}`;

  const [{ data: listingRecord }, { data: sellerProfile }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, sku, sku_normalized")
      .eq("id", listingId)
      .single(),
    supabase
      .from("profiles")
      .select("id, seller_tier")
      .eq("id", sellerId)
      .single(),
  ]);

  const authDecision = await evaluateOrderAuthenticationRequirements(supabase as any, {
    sellerId,
    sellerTier: sellerProfile?.seller_tier || "tier_1",
    orderValueCents: Math.round(shoePrice * 100),
    sku: listingRecord?.sku || null,
    skuNormalized: listingRecord?.sku_normalized || null,
    randomSeed: randomAuditSeed,
  });
  const payoutSnapshot = buildOrderPayoutSnapshotForTier(
    sellerProfile?.seller_tier || "tier_1"
  );

  let usedItemUpdated = false;

  if (listingUsedItemId) {
    if (!usedConditionPhotoUrl) {
      throw new Error("Invalid used item metadata");
    }

    const { data: updatedUsedItems, error: usedItemUpdateError } = await supabase
      .from("listing_used_items")
      .update({
        quantity: 0,
        is_active: false,
      })
      .eq("id", listingUsedItemId)
      .eq("listing_id", listingId)
      .eq("is_active", true)
      .eq("quantity", 1)
      .not("condition_photo_url", "is", null)
      .neq("condition_photo_url", "")
      .select("id");

    if (usedItemUpdateError) {
      throw new Error(usedItemUpdateError.message || "Failed to reserve used item");
    }

    if ((updatedUsedItems || []).length > 0) {
      usedItemUpdated = true;
    } else {
      const recoveredOrder = await findExistingOrder(supabase, {
        checkoutSessionId: session.id,
        paymentIntentId,
      });

      if (recoveredOrder?.id) {
        return {
          checkoutType: "shoe_order",
          status: "existing",
          orderId: recoveredOrder.id,
        };
      }

      throw new Error("This used pair is no longer available");
    }
  }

  const { data: insertedOrder, error: orderError } = await supabase
    .from("orders")
    .insert({
      listing_id: listingId,
      listing_variant_id: listingVariantId,
      listing_used_item_id: listingUsedItemId,
      buyer_id: buyerId,
      seller_id: sellerId,
      custom_offer_id: customOfferId || null,
      status: "paid",
      size,
      price: shoePrice,
      shipping_cost: shippingCost,
      platform_fee: platformFee,
      stripe_fee: stripeFee,
      seller_earnings: sellerEarnings,
      stripe_checkout_session_id: session.id,
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
    .select("id")
    .single();

  if (orderError || !insertedOrder) {
    const recoveredOrder = await findExistingOrder(supabase, {
      checkoutSessionId: session.id,
      paymentIntentId,
    });

    if (recoveredOrder?.id) {
      return {
        checkoutType: "shoe_order",
        status: "existing",
        orderId: recoveredOrder.id,
      };
    }

    if (listingUsedItemId && usedItemUpdated) {
      const { error: rollbackError } = await supabase
        .from("listing_used_items")
        .update({
          quantity: 1,
          is_active: true,
        })
        .eq("id", listingUsedItemId)
        .eq("listing_id", listingId);

      if (rollbackError) {
        console.error("Used item rollback error:", rollbackError);
      }
    }

    throw new Error(orderError?.message || "Failed to create order");
  }

  await logRelayAuditEvent(supabase, {
    actorUserId: buyerId,
    actorRole: "buyer",
    orderId: insertedOrder.id,
    sellerId,
    eventType: "stripe.checkout_session_completed",
    metadata: {
      source,
      stripeCheckoutSessionId: session.id,
      paymentIntentId,
      listingId,
      sellerTierSnapshot: payoutSnapshot.sellerTierSnapshot,
      payoutSchedule: payoutSnapshot.payoutSchedule,
      reservePercentageBps: payoutSnapshot.reservePercentageBps,
      checkcheckRequired: authDecision.checkcheckRequired,
      checkcheckReason: authDecision.checkcheckReason,
      randomAuditRequired: authDecision.randomAuditRequired,
      highRiskSkuRequired: authDecision.highRiskSkuRequired,
    },
  });

  let variantUpdated = false;

  if (!listingUsedItemId && listingVariantId) {
    const { data: decrementedRows, error: decrementError } = await supabase.rpc(
      "decrement_listing_variant_inventory",
      { target_listing_variant_id: listingVariantId }
    );

    if (decrementError) {
      console.error("Variant quantity update error:", decrementError);
    } else if (Array.isArray(decrementedRows) && decrementedRows.length > 0) {
      variantUpdated = true;
    }
  }

  if (!listingUsedItemId && !variantUpdated) {
    const { data: variant } = await supabase
      .from("listing_variants")
      .select("id")
      .eq("listing_id", listingId)
      .eq("size", size)
      .maybeSingle();

    if (variant) {
      const { data: decrementedRows, error: decrementError } = await supabase.rpc(
        "decrement_listing_variant_inventory",
        { target_listing_variant_id: variant.id }
      );

      if (decrementError) {
        console.error("Variant quantity update error:", decrementError);
      } else if (Array.isArray(decrementedRows) && decrementedRows.length > 0) {
        variantUpdated = true;
      }
    }
  }

  if (!listingUsedItemId && !variantUpdated) {
    const { data: listing, error: listingFetchError } = await supabase
      .from("listings")
      .select("sizes, status")
      .eq("id", listingId)
      .single();

    if (listingFetchError || !listing) {
      console.error("Failed to fetch listing for quantity update:", listingFetchError);
    } else {
      const sizes = listing.sizes as any[];
      if (Array.isArray(sizes)) {
        const updatedSizes = sizes.map((entry: any) => {
          if (String(entry.size) === String(size)) {
            return { ...entry, quantity: Math.max(0, (entry.quantity || 0) - 1) };
          }
          return entry;
        });

        const totalRemaining = updatedSizes.reduce(
          (sum: number, entry: any) => sum + (entry.quantity || 0),
          0
        );

        const updatePayload: Record<string, unknown> = { sizes: updatedSizes };
        if (totalRemaining <= 0) {
          updatePayload.status = "sold_out";
        }

        const { error: updateError } = await supabase
          .from("listings")
          .update(updatePayload)
          .eq("id", listingId);

        if (updateError) {
          console.error("Quantity update error:", updateError);
        }
      }
    }
  }

  await reconcileListingInventoryStatus(supabase, listingId);

  if (customOfferId) {
    const { error: offerError } = await supabase
      .from("custom_offers")
      .update({ status: "accepted" })
      .eq("id", customOfferId);

    if (offerError) {
      console.error("Offer update error:", offerError);
    }

    const { data: offerRow } = await supabase
      .from("custom_offers")
      .select("conversation_id, sender_id, offer_price, size")
      .eq("id", customOfferId)
      .single();

    if (offerRow) {
      await supabase
        .from("messages")
        .update({ custom_offer_status: "accepted" })
        .eq("conversation_id", offerRow.conversation_id)
        .eq("sender_id", offerRow.sender_id)
        .eq("custom_offer_price", offerRow.offer_price)
        .eq("custom_offer_size", offerRow.size)
        .eq("message_type", "custom_offer");
    }
  }

  return {
    checkoutType: "shoe_order",
    status: "created",
    orderId: insertedOrder.id,
  };
}

export async function finalizeStripeCheckoutSession(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
  options?: { source?: string }
): Promise<StripeCheckoutFinalizationResult> {
  const metadata = getCheckoutMetadata(session);
  const source = options?.source || "stripe_webhook";

  if (metadata.type === "tag_bundle_purchase") {
    return finalizeTagBundlePurchase(supabase, session, metadata);
  }

  return finalizeShoeOrderPurchase(supabase, session, metadata, source);
}
