import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { resolveListingVariant } from "@/lib/listings";
import {
  calculateRelayFee,
  calculateSellerProceeds,
  calculateStripeFeeEstimateCents,
  getRelayBalanceSnapshot,
} from "@/lib/money-policy";
import { evaluateOrderAuthenticationRequirements } from "@/lib/order-auth";
import { buildOrderPayoutSnapshotForTier } from "@/lib/payouts";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import { createAdminClient } from "@/lib/supabase-admin";
import { generateChallengeCode } from "@/lib/utils";

interface VariantRow {
  id: string;
  size: string;
  price: number;
  quantity: number;
  is_active: boolean;
}

interface UsedItemRow {
  id: string;
  size: string;
  price: number;
  quantity: number;
  is_active: boolean;
  condition: "like_new" | "used_excellent" | "used_good" | "used_fair";
  condition_photo_url: string;
}

function normalizePhotoUrl(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getLegacySizeEntryCondition(
  listingCondition: unknown,
  sizeEntry: { condition?: unknown } | null
) {
  if (sizeEntry?.condition === "used") {
    return "used";
  }

  const normalizedListingCondition =
    typeof listingCondition === "string" ? listingCondition : "";
  return normalizedListingCondition === "mixed" ||
    normalizedListingCondition.startsWith("used")
    ? "used"
    : "new";
}

function getLegacySizeEntry(
  sizes: Array<{ size: string; price: number; quantity: number }> | null | undefined,
  size: string
) {
  return Array.isArray(sizes)
    ? sizes.find((entry) => String(entry.size) === String(size))
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Handle SSR context.
            }
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      listingId,
      size,
      listingVariantId,
      listingUsedItemId,
      shippingCost,
      buyerAddress,
      customOfferId,
      idempotencyKey,
    } = await request.json();

    if (
      !listingId ||
      (!size && !listingVariantId && !listingUsedItemId) ||
      shippingCost === undefined ||
      typeof idempotencyKey !== "string" ||
      !idempotencyKey.trim()
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: listing, error: listingError } = await adminClient
      .from("listings")
      .select(`
        id,
        seller_id,
        brand,
        model,
        images,
        sizes,
        condition,
        inventory_review_status,
        status,
        sku,
        sku_normalized,
        seller:profiles!listings_seller_id_fkey(
          id,
          seller_tier,
          vacation_mode_enabled
        )
      `)
      .eq("id", listingId)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.status !== "active") {
      return NextResponse.json(
        { error: "This listing is no longer available" },
        { status: 400 }
      );
    }

    const sellerProfile = Array.isArray((listing as any).seller)
      ? (listing as any).seller[0]
      : (listing as any).seller;

    if (sellerProfile?.vacation_mode_enabled) {
      return NextResponse.json(
        { error: "Seller is temporarily unavailable while vacation mode is on." },
        { status: 400 }
      );
    }

    if (listing.seller_id === user.id) {
      return NextResponse.json(
        { error: "You cannot purchase your own listing." },
        { status: 400 }
      );
    }

    let resolvedSize = String(size || "");
    let resolvedVariantId = String(listingVariantId || "") || null;
    let resolvedUsedItemId = String(listingUsedItemId || "") || null;
    let price = 0;

    if (customOfferId) {
      const { data: offer, error: offerError } = await adminClient
        .from("custom_offers")
        .select("offer_price, status, size, listing_variant_id")
        .eq("id", customOfferId)
        .single();

      if (offerError || !offer) {
        return NextResponse.json({ error: "Custom offer not found" }, { status: 404 });
      }
      if (offer.status !== "accepted") {
        return NextResponse.json(
          { error: "This offer is no longer valid" },
          { status: 400 }
        );
      }

      resolvedSize = offer.size || resolvedSize;
      resolvedVariantId = offer.listing_variant_id || resolvedVariantId;
      price = parseFloat(offer.offer_price);
    }

    let variantRow: VariantRow | null = null;
    let usedItemRow: UsedItemRow | null = null;

    if (resolvedUsedItemId) {
      const { data: usedItem, error: usedItemError } = await adminClient
        .from("listing_used_items")
        .select("id, size, price, quantity, is_active, condition, condition_photo_url")
        .eq("id", resolvedUsedItemId)
        .eq("listing_id", listingId)
        .maybeSingle();

      if (usedItemError || !usedItem) {
        return NextResponse.json(
          { error: "This used pair is no longer available" },
          { status: 404 }
        );
      }

      usedItemRow = {
        id: usedItem.id,
        size: String(usedItem.size),
        price: Number(usedItem.price),
        quantity: Number(usedItem.quantity) || 0,
        is_active: usedItem.is_active !== false,
        condition: usedItem.condition,
        condition_photo_url: normalizePhotoUrl(usedItem.condition_photo_url),
      };
    } else {
      const resolvedVariant = await resolveListingVariant(adminClient as any, listingId, {
        variantId: resolvedVariantId,
        size: resolvedSize,
      });

      if (resolvedVariant) {
        variantRow = {
          id: resolvedVariant.id,
          size: resolvedVariant.size,
          price: Number(resolvedVariant.price),
          quantity: resolvedVariant.quantity || 0,
          is_active: resolvedVariant.is_active,
        };
      }
    }

    if (usedItemRow) {
      resolvedUsedItemId = usedItemRow.id;
      resolvedSize = usedItemRow.size;

      if (usedItemRow.is_active === false || usedItemRow.quantity !== 1) {
        return NextResponse.json(
          { error: "This used pair is no longer available" },
          { status: 400 }
        );
      }

      if (!usedItemRow.condition_photo_url) {
        return NextResponse.json(
          { error: "This used pair is missing its required condition photo" },
          { status: 400 }
        );
      }

      price = usedItemRow.price;
    } else if (variantRow) {
      resolvedVariantId = variantRow.id;
      resolvedSize = variantRow.size;

      if (variantRow.quantity <= 0) {
        return NextResponse.json({ error: "This size is no longer available" }, { status: 400 });
      }

      if (!customOfferId) {
        price = variantRow.price;
      }
    } else {
      const sizeEntry = getLegacySizeEntry(listing.sizes as any[], resolvedSize);

      if (!sizeEntry || (sizeEntry.quantity || 0) <= 0) {
        return NextResponse.json({ error: "This size is no longer available" }, { status: 400 });
      }

      const sizeEntryCondition = getLegacySizeEntryCondition(listing.condition, sizeEntry as any);
      if (sizeEntryCondition === "used") {
        return NextResponse.json(
          { error: "Legacy used inventory must be purchased as an itemized used pair." },
          { status: 400 }
        );
      }

      if (listing.inventory_review_status === "legacy_used_photo_review_required") {
        return NextResponse.json(
          { error: "This listing has used inventory that needs seller review before purchase." },
          { status: 400 }
        );
      }

      resolvedSize = String(sizeEntry.size);
      if (!customOfferId) {
        price = Number(sizeEntry.price);
      }
    }

    if (!price || price <= 0) {
      return NextResponse.json({ error: "Invalid price for this listing" }, { status: 400 });
    }

    const shoePriceCents = Math.round(Number(price) * 100);
    const shippingCostCents = Math.round(Number(shippingCost || 0) * 100);
    const totalChargeCents = shoePriceCents + shippingCostCents;
    const relayFeeCents = calculateRelayFee(shoePriceCents);
    const stripeFeeEstimateCents = calculateStripeFeeEstimateCents(shoePriceCents);
    const sellerProceedsCents = calculateSellerProceeds(
      shoePriceCents,
      stripeFeeEstimateCents
    );
    const shippingDeadline = new Date();
    shippingDeadline.setDate(shippingDeadline.getDate() + 5);
    const challengeCode = generateChallengeCode();
    const payoutSnapshot = buildOrderPayoutSnapshotForTier(
      sellerProfile?.seller_tier || "tier_1"
    );
    const authDecision = await evaluateOrderAuthenticationRequirements(adminClient as any, {
      sellerId: listing.seller_id,
      sellerTier: sellerProfile?.seller_tier || "tier_1",
      orderValueCents: shoePriceCents,
      sku: (listing as any).sku || null,
      skuNormalized: (listing as any).sku_normalized || null,
      randomSeed: `${user.id}:${listingId}:${resolvedSize}:${idempotencyKey.trim()}`,
    });

    const buyerRelayBalance = await getRelayBalanceSnapshot(user.id, {
      adminClient,
      actorRole: "buyer",
      actorUserId: user.id,
    });

    if (buyerRelayBalance.availableBalanceCents < totalChargeCents) {
      return NextResponse.json(
        { error: "Insufficient available Relay Balance for this purchase." },
        { status: 409 }
      );
    }

    const { data: purchaseResult, error: purchaseError } = await adminClient.rpc(
      "create_relay_balance_order_purchase",
      {
        p_buyer_id: user.id,
        p_seller_id: listing.seller_id,
        p_listing_id: listingId,
        p_listing_variant_id: resolvedVariantId,
        p_listing_used_item_id: resolvedUsedItemId,
        p_custom_offer_id: customOfferId || null,
        p_size: resolvedSize,
        p_shoe_price_cents: shoePriceCents,
        p_shipping_cost_cents: shippingCostCents,
        p_total_charge_cents: totalChargeCents,
        p_relay_fee_cents: relayFeeCents,
        p_stripe_fee_estimate_cents: stripeFeeEstimateCents,
        p_seller_proceeds_cents: sellerProceedsCents,
        p_buyer_shipping_address: buyerAddress || {},
        p_challenge_code: challengeCode,
        p_shipping_deadline: shippingDeadline.toISOString(),
        p_purchased_condition_photo_url: usedItemRow?.condition_photo_url || null,
        p_auth_snapshot: {
          relayTagRequired: authDecision.relayTagRequired,
          checkcheckRequired: authDecision.checkcheckRequired,
          checkcheckReason: authDecision.checkcheckReason,
          checkcheckStatus: authDecision.checkcheckStatus,
          randomAuditRequired: authDecision.randomAuditRequired,
          randomAuditRateBpsSnapshot: authDecision.randomAuditRateBpsSnapshot,
          highRiskSkuRequired: authDecision.highRiskSkuRequired,
          highRiskSkuId: authDecision.highRiskSkuId,
          highRiskSkuReason: authDecision.highRiskSkuReason,
          authRequirementsEvaluatedAt: authDecision.authRequirementsEvaluatedAt,
        },
        p_payout_snapshot: payoutSnapshot,
        p_checkout_idempotency_key: idempotencyKey.trim(),
      }
    );

    if (purchaseError || !Array.isArray(purchaseResult) || !purchaseResult[0]?.order_id) {
      const message =
        purchaseError?.message || "Failed to complete Relay Balance purchase";
      const status = message.includes("Insufficient available Relay Balance") ? 409 : 500;

      return NextResponse.json({ error: message }, { status });
    }

    const createdOrderId = purchaseResult[0].order_id as string;
    const orderCreated = Boolean(purchaseResult[0].created);

    if (customOfferId) {
      const { data: offerRow } = await adminClient
        .from("custom_offers")
        .select("conversation_id, sender_id, offer_price, size")
        .eq("id", customOfferId)
        .single();

      if (offerRow) {
        await adminClient
          .from("messages")
          .update({ custom_offer_status: "accepted" })
          .eq("conversation_id", offerRow.conversation_id)
          .eq("sender_id", offerRow.sender_id)
          .eq("custom_offer_price", offerRow.offer_price)
          .eq("custom_offer_size", offerRow.size)
          .eq("message_type", "custom_offer");
      }
    }

    await logRelayAuditEvent(adminClient, {
      actorUserId: user.id,
      actorRole: "buyer",
      orderId: createdOrderId,
      sellerId: listing.seller_id,
      eventType: orderCreated
        ? "relay_balance.checkout_completed"
        : "relay_balance.checkout_recovered",
      metadata: {
        idempotencyKey: idempotencyKey.trim(),
        listingId,
        listingVariantId: resolvedVariantId,
        listingUsedItemId: resolvedUsedItemId,
        customOfferId: customOfferId || null,
        shoePriceCents,
        shippingCostCents,
        totalChargeCents,
        sellerProceedsCents,
        paymentFundingSource: "relay_balance",
      },
    });

    return NextResponse.json({
      success: true,
      orderId: createdOrderId,
      status: orderCreated ? "created" : "existing",
      redirectUrl: `/orders/${createdOrderId}`,
    });
  } catch (error) {
    console.error("Relay Balance checkout error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to complete Relay Balance purchase",
      },
      { status: 500 }
    );
  }
}
