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

UPDATE public.relay_balances
SET
  exposure_cents = 0,
  withdrawable_balance_cents = GREATEST(available_balance_cents, 0),
  updated_at = NOW();
