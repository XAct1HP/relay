-- ============================================================================
-- RELAY LAUNCH PAYOUT MODEL
-- ============================================================================
-- Launch behavior keeps pooled funds on the Relay platform balance and tracks
-- seller ownership in the Relay ledger. Seller connected accounts are only
-- used as withdrawal destinations.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_funding_source TEXT
    CHECK (payment_funding_source IN ('card', 'relay_balance'))
    DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS relay_balance_payment_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_settlement_status TEXT
    CHECK (stripe_settlement_status IN (
      'not_applicable',
      'pending',
      'pending_settlement_unknown',
      'settled'
    ))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_funds_available_on TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_funds_settled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_payment_funding_source
  ON public.orders(payment_funding_source);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_relay_balance_payment_idempotency_key
  ON public.orders(relay_balance_payment_idempotency_key)
  WHERE relay_balance_payment_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_funds_available_on
  ON public.orders(stripe_funds_available_on);

CREATE INDEX IF NOT EXISTS idx_orders_stripe_settlement_status
  ON public.orders(stripe_settlement_status);

ALTER TABLE public.order_payouts
  ADD COLUMN IF NOT EXISTS payment_source_type TEXT
    CHECK (payment_source_type IN ('card', 'relay_balance')),
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_funds_available_on TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_funds_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_settlement_status TEXT
    CHECK (stripe_settlement_status IN (
      'not_applicable',
      'pending',
      'pending_settlement_unknown',
      'settled'
    ));

CREATE INDEX IF NOT EXISTS idx_order_payouts_payment_source_type
  ON public.order_payouts(payment_source_type);

CREATE INDEX IF NOT EXISTS idx_order_payouts_stripe_settlement_status
  ON public.order_payouts(stripe_settlement_status);

UPDATE public.orders
SET payment_funding_source = COALESCE(
  payment_funding_source,
  CASE
    WHEN stripe_payment_intent_id IS NULL THEN 'relay_balance'
    ELSE 'card'
  END
)
WHERE payment_funding_source IS NULL;

UPDATE public.orders
SET stripe_settlement_status = CASE
  WHEN payment_funding_source = 'relay_balance' THEN 'not_applicable'
  WHEN stripe_funds_settled_at IS NOT NULL THEN 'settled'
  WHEN stripe_funds_available_on IS NOT NULL AND stripe_funds_available_on <= NOW() THEN 'settled'
  WHEN stripe_funds_available_on IS NOT NULL THEN 'pending'
  ELSE COALESCE(stripe_settlement_status, 'pending')
END
WHERE stripe_settlement_status IS NULL
   OR stripe_settlement_status NOT IN (
     'not_applicable',
     'pending',
     'pending_settlement_unknown',
     'settled'
   );

UPDATE public.order_payouts AS op
SET
  payment_source_type = COALESCE(op.payment_source_type, o.payment_funding_source),
  stripe_charge_id = COALESCE(op.stripe_charge_id, o.stripe_charge_id),
  stripe_balance_transaction_id = COALESCE(
    op.stripe_balance_transaction_id,
    o.stripe_balance_transaction_id
  ),
  stripe_funds_available_on = COALESCE(
    op.stripe_funds_available_on,
    o.stripe_funds_available_on
  ),
  stripe_funds_settled_at = COALESCE(
    op.stripe_funds_settled_at,
    o.stripe_funds_settled_at
  ),
  stripe_settlement_status = COALESCE(
    op.stripe_settlement_status,
    o.stripe_settlement_status
  )
FROM public.orders AS o
WHERE op.order_id = o.id;

ALTER TABLE public.relay_balance_ledger
  DROP CONSTRAINT IF EXISTS relay_balance_ledger_type_check;

ALTER TABLE public.relay_balance_ledger
  ADD CONSTRAINT relay_balance_ledger_type_check
    CHECK (type IN (
      'order_pending_credit',
      'order_available_credit',
      'relay_balance_purchase_debit',
      'withdrawal_requested',
      'withdrawal_completed',
      'withdrawal_failed',
      'exposure_hold_created',
      'exposure_hold_released',
      'dispute_freeze',
      'dispute_debit',
      'admin_adjustment'
    ));

ALTER TABLE public.relay_balance_ledger
  DROP CONSTRAINT IF EXISTS relay_balance_ledger_order_required_check;

ALTER TABLE public.relay_balance_ledger
  ADD CONSTRAINT relay_balance_ledger_order_required_check
    CHECK (
      CASE
        WHEN type IN (
          'order_pending_credit',
          'order_available_credit',
          'relay_balance_purchase_debit',
          'exposure_hold_created',
          'exposure_hold_released',
          'dispute_freeze',
          'dispute_debit'
        ) THEN order_id IS NOT NULL
        ELSE TRUE
      END
    );

ALTER TABLE public.relay_balance_ledger
  DROP CONSTRAINT IF EXISTS relay_balance_ledger_amount_direction_check;

ALTER TABLE public.relay_balance_ledger
  ADD CONSTRAINT relay_balance_ledger_amount_direction_check
    CHECK (
      CASE
        WHEN type IN (
          'order_pending_credit',
          'order_available_credit',
          'withdrawal_completed',
          'withdrawal_failed',
          'exposure_hold_created',
          'exposure_hold_released',
          'dispute_freeze'
        ) THEN amount_cents > 0
        WHEN type IN (
          'relay_balance_purchase_debit',
          'withdrawal_requested',
          'dispute_debit'
        ) THEN amount_cents < 0
        ELSE amount_cents <> 0
      END
    );

-- Disable launch-time early payouts and reserve behavior while preserving the
-- existing compatibility columns.
UPDATE public.orders
SET
  payout_schedule = 'buyer_confirmation_or_review_expiry',
  reserve_percentage_bps_snapshot = 0,
  reserve_hold_duration_days_snapshot = NULL,
  minimum_reserve_balance_cents_snapshot = 0;

CREATE OR REPLACE FUNCTION public.recalculate_relay_balance(target_seller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_pending BIGINT := 0;
  calculated_available BIGINT := 0;
BEGIN
  IF target_seller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'order_pending_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN -amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'relay_balance_purchase_debit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_requested'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_failed'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'dispute_debit'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'admin_adjustment'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0)
  INTO calculated_pending, calculated_available
  FROM public.relay_balance_ledger
  WHERE seller_id = target_seller_id;

  INSERT INTO public.relay_balances (
    seller_id,
    total_balance_cents,
    available_balance_cents,
    pending_balance_cents,
    exposure_cents,
    withdrawable_balance_cents,
    updated_at
  )
  VALUES (
    target_seller_id,
    GREATEST(calculated_pending, 0) + calculated_available,
    calculated_available,
    GREATEST(calculated_pending, 0),
    0,
    GREATEST(calculated_available, 0),
    NOW()
  )
  ON CONFLICT (seller_id) DO UPDATE
  SET
    total_balance_cents = EXCLUDED.total_balance_cents,
    available_balance_cents = EXCLUDED.available_balance_cents,
    pending_balance_cents = EXCLUDED.pending_balance_cents,
    exposure_cents = EXCLUDED.exposure_cents,
    withdrawable_balance_cents = EXCLUDED.withdrawable_balance_cents,
    updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_relay_balance_order_purchase(
  p_buyer_id UUID,
  p_seller_id UUID,
  p_listing_id UUID,
  p_listing_variant_id UUID,
  p_listing_used_item_id UUID,
  p_custom_offer_id UUID,
  p_size TEXT,
  p_shoe_price_cents BIGINT,
  p_shipping_cost_cents BIGINT,
  p_total_charge_cents BIGINT,
  p_relay_fee_cents BIGINT,
  p_stripe_fee_estimate_cents BIGINT,
  p_seller_proceeds_cents BIGINT,
  p_buyer_shipping_address JSONB,
  p_challenge_code TEXT,
  p_shipping_deadline TIMESTAMPTZ,
  p_purchased_condition_photo_url TEXT,
  p_auth_snapshot JSONB,
  p_payout_snapshot JSONB,
  p_checkout_idempotency_key TEXT
)
RETURNS TABLE(order_id UUID, created BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  existing_order_id UUID;
  buyer_available_balance BIGINT := 0;
  buyer_balance_row_id UUID;
  order_payout_step TEXT := 'final_release';
  listing_sizes JSONB;
  legacy_size_index INT;
  legacy_size_entry JSONB;
  has_available_inventory BOOLEAN := false;
BEGIN
  IF p_buyer_id IS NULL OR p_seller_id IS NULL OR p_listing_id IS NULL THEN
    RAISE EXCEPTION 'Missing required Relay Balance checkout identifiers.';
  END IF;

  IF p_buyer_id = p_seller_id THEN
    RAISE EXCEPTION 'Buyer cannot purchase their own listing.';
  END IF;

  IF COALESCE(BTRIM(p_checkout_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Relay Balance checkout idempotency key is required.';
  END IF;

  SELECT o.id
  INTO existing_order_id
  FROM public.orders AS o
  WHERE o.relay_balance_payment_idempotency_key = p_checkout_idempotency_key
  LIMIT 1;

  IF existing_order_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_order_id, FALSE;
    RETURN;
  END IF;

  INSERT INTO public.relay_balances (
    seller_id,
    total_balance_cents,
    available_balance_cents,
    pending_balance_cents,
    exposure_cents,
    withdrawable_balance_cents,
    updated_at
  )
  VALUES (
    p_buyer_id,
    0,
    0,
    0,
    0,
    0,
    NOW()
  )
  ON CONFLICT (seller_id) DO NOTHING;

  SELECT rb.id, COALESCE(rb.available_balance_cents, 0)
  INTO buyer_balance_row_id, buyer_available_balance
  FROM public.relay_balances AS rb
  WHERE rb.seller_id = p_buyer_id
  FOR UPDATE;

  IF buyer_balance_row_id IS NULL THEN
    buyer_available_balance := 0;
  END IF;

  IF buyer_available_balance < COALESCE(p_total_charge_cents, 0) THEN
    RAISE EXCEPTION 'Insufficient Relay Balance available for this purchase.';
  END IF;

  IF p_listing_used_item_id IS NOT NULL THEN
    UPDATE public.listing_used_items
    SET
      quantity = 0,
      is_active = FALSE
    WHERE id = p_listing_used_item_id
      AND listing_id = p_listing_id
      AND COALESCE(quantity, 0) = 1
      AND COALESCE(is_active, TRUE) = TRUE
    RETURNING id
    INTO existing_order_id;

    IF existing_order_id IS NULL THEN
      RAISE EXCEPTION 'This used pair is no longer available.';
    END IF;
  ELSIF p_listing_variant_id IS NOT NULL THEN
    UPDATE public.listing_variants
    SET
      quantity = GREATEST(COALESCE(quantity, 0) - 1, 0),
      is_active = CASE
        WHEN GREATEST(COALESCE(quantity, 0) - 1, 0) <= 0 THEN FALSE
        ELSE COALESCE(is_active, TRUE)
      END
    WHERE id = p_listing_variant_id
      AND listing_id = p_listing_id
      AND COALESCE(quantity, 0) > 0
      AND COALESCE(is_active, TRUE) = TRUE
    RETURNING id
    INTO existing_order_id;

    IF existing_order_id IS NULL THEN
      RAISE EXCEPTION 'This size is no longer available.';
    END IF;
  ELSE
    SELECT l.sizes
    INTO listing_sizes
    FROM public.listings AS l
    WHERE l.id = p_listing_id
    FOR UPDATE;

    SELECT element.ordinality - 1, element.value
    INTO legacy_size_index, legacy_size_entry
    FROM jsonb_array_elements(COALESCE(listing_sizes, '[]'::jsonb)) WITH ORDINALITY AS element(value, ordinality)
    WHERE element.value->>'size' = p_size
    LIMIT 1;

    IF legacy_size_entry IS NULL OR COALESCE((legacy_size_entry->>'quantity')::INT, 0) <= 0 THEN
      RAISE EXCEPTION 'This size is no longer available.';
    END IF;

    listing_sizes := jsonb_set(
      listing_sizes,
      ARRAY[legacy_size_index::TEXT, 'quantity'],
      to_jsonb(GREATEST(COALESCE((legacy_size_entry->>'quantity')::INT, 0) - 1, 0))
    );

    UPDATE public.listings
    SET sizes = listing_sizes
    WHERE id = p_listing_id;
  END IF;

  INSERT INTO public.orders (
    listing_id,
    listing_variant_id,
    listing_used_item_id,
    buyer_id,
    seller_id,
    custom_offer_id,
    status,
    size,
    price,
    shipping_cost,
    platform_fee,
    stripe_fee,
    seller_earnings,
    relay_fee_cents,
    stripe_fee_estimate_cents,
    seller_proceeds_cents,
    payment_funding_source,
    relay_balance_payment_idempotency_key,
    stripe_settlement_status,
    challenge_code,
    buyer_shipping_address,
    shipping_deadline,
    purchased_condition_photo_url,
    relay_tag_required,
    checkcheck_required,
    checkcheck_reason,
    checkcheck_status,
    random_audit_required,
    random_audit_rate_bps_snapshot,
    high_risk_sku_required,
    high_risk_sku_id,
    high_risk_sku_reason,
    auth_requirements_evaluated_at,
    seller_tier_snapshot,
    payout_schedule,
    reserve_percentage_bps_snapshot,
    reserve_hold_duration_days_snapshot,
    minimum_reserve_balance_cents_snapshot,
    balance_credit_status
  )
  VALUES (
    p_listing_id,
    p_listing_variant_id,
    p_listing_used_item_id,
    p_buyer_id,
    p_seller_id,
    p_custom_offer_id,
    'paid',
    p_size,
    (COALESCE(p_shoe_price_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_shipping_cost_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_relay_fee_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_stripe_fee_estimate_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_seller_proceeds_cents, 0)::NUMERIC / 100.0),
    COALESCE(p_relay_fee_cents, 0),
    COALESCE(p_stripe_fee_estimate_cents, 0),
    COALESCE(p_seller_proceeds_cents, 0),
    'relay_balance',
    p_checkout_idempotency_key,
    'not_applicable',
    p_challenge_code,
    COALESCE(p_buyer_shipping_address, '{}'::jsonb),
    p_shipping_deadline,
    NULLIF(p_purchased_condition_photo_url, ''),
    COALESCE((p_auth_snapshot->>'relayTagRequired')::BOOLEAN, FALSE),
    COALESCE((p_auth_snapshot->>'checkcheckRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'checkcheckReason', ''),
    COALESCE(NULLIF(p_auth_snapshot->>'checkcheckStatus', ''), 'not_required'),
    COALESCE((p_auth_snapshot->>'randomAuditRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'randomAuditRateBpsSnapshot', '')::INT,
    COALESCE((p_auth_snapshot->>'highRiskSkuRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'highRiskSkuId', ''),
    NULLIF(p_auth_snapshot->>'highRiskSkuReason', ''),
    NULLIF(p_auth_snapshot->>'authRequirementsEvaluatedAt', '')::TIMESTAMPTZ,
    COALESCE(NULLIF(p_payout_snapshot->>'sellerTierSnapshot', ''), 'tier_1'),
    COALESCE(NULLIF(p_payout_snapshot->>'payoutSchedule', ''), 'buyer_confirmation_or_review_expiry'),
    COALESCE(NULLIF(p_payout_snapshot->>'reservePercentageBps', '')::INT, 0),
    NULLIF(p_payout_snapshot->>'reserveHoldDurationDays', '')::INT,
    COALESCE(NULLIF(p_payout_snapshot->>'minimumReserveBalanceCents', '')::BIGINT, 0),
    'pending'
  )
  RETURNING id
  INTO order_id;

  INSERT INTO public.relay_balance_ledger (
    seller_id,
    order_id,
    type,
    amount_cents,
    currency,
    status,
    metadata
  )
  VALUES (
    p_buyer_id,
    order_id,
    'relay_balance_purchase_debit',
    -COALESCE(p_total_charge_cents, 0),
    'usd',
    'posted',
    jsonb_build_object(
      'source', 'relay_balance_checkout',
      'idempotency_key', 'relay_balance_purchase:' || p_checkout_idempotency_key || ':buyer_debit',
      'payment_funding_source', 'relay_balance',
      'counterparty_user_id', p_seller_id,
      'order_total_cents', COALESCE(p_total_charge_cents, 0)
    )
  );

  INSERT INTO public.relay_balance_ledger (
    seller_id,
    order_id,
    type,
    amount_cents,
    currency,
    status,
    metadata
  )
  VALUES (
    p_seller_id,
    order_id,
    'order_pending_credit',
    COALESCE(p_seller_proceeds_cents, 0),
    'usd',
    'posted',
    jsonb_build_object(
      'source', 'relay_balance_checkout',
      'idempotency_key', 'money:order:' || order_id::TEXT || ':pending_credit',
      'seller_tier', COALESCE(NULLIF(p_payout_snapshot->>'sellerTierSnapshot', ''), 'tier_1'),
      'payment_funding_source', 'relay_balance',
      'buyer_id', p_buyer_id
    )
  );

  INSERT INTO public.order_payouts (
    order_id,
    seller_id,
    payout_step,
    payment_source_type,
    stripe_settlement_status,
    status,
    gross_amount_cents,
    reserve_withheld_cents,
    minimum_balance_top_up_cents,
    net_paid_cents,
    stripe_transfer_id,
    idempotency_key,
    trigger_source,
    metadata
  )
  VALUES (
    order_id,
    p_seller_id,
    order_payout_step,
    'relay_balance',
    'not_applicable',
    'pending',
    COALESCE(p_seller_proceeds_cents, 0),
    0,
    0,
    COALESCE(p_seller_proceeds_cents, 0),
    NULL,
    'order-payout-' || order_id::TEXT || '-' || order_payout_step,
    'relay_balance_checkout',
    jsonb_build_object(
      'releaseDestination', 'relay_balance',
      'paymentSourceType', 'relay_balance',
      'createdAtCheckout', TRUE
    )
  )
  ON CONFLICT (order_id, payout_step) DO UPDATE
  SET
    payment_source_type = EXCLUDED.payment_source_type,
    stripe_settlement_status = EXCLUDED.stripe_settlement_status,
    gross_amount_cents = EXCLUDED.gross_amount_cents,
    reserve_withheld_cents = EXCLUDED.reserve_withheld_cents,
    minimum_balance_top_up_cents = EXCLUDED.minimum_balance_top_up_cents,
    net_paid_cents = EXCLUDED.net_paid_cents,
    trigger_source = EXCLUDED.trigger_source,
    metadata = EXCLUDED.metadata;

  IF p_custom_offer_id IS NOT NULL THEN
    UPDATE public.custom_offers
    SET status = 'accepted'
    WHERE id = p_custom_offer_id;
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.listing_variants AS lv
      WHERE lv.listing_id = p_listing_id
        AND COALESCE(lv.quantity, 0) > 0
        AND COALESCE(lv.is_active, TRUE) = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.listing_used_items AS lui
      WHERE lui.listing_id = p_listing_id
        AND COALESCE(lui.quantity, 0) > 0
        AND COALESCE(lui.is_active, TRUE) = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.listings AS l
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.sizes, '[]'::jsonb)) AS element(value)
      WHERE l.id = p_listing_id
        AND COALESCE((element.value->>'quantity')::INT, 0) > 0
    )
  INTO has_available_inventory;

  UPDATE public.listings
  SET status = CASE
    WHEN has_available_inventory THEN 'active'
    ELSE 'sold_out'
  END
  WHERE id = p_listing_id
    AND status IN ('active', 'sold_out');

  RETURN QUERY SELECT order_id, TRUE;
END;
$$;

UPDATE public.relay_balances
SET
  exposure_cents = 0,
  withdrawable_balance_cents = GREATEST(available_balance_cents, 0),
  updated_at = NOW();
