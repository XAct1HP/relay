-- ============================================================================
-- TIERED PAYOUT + RESERVE CONTROLS
-- ============================================================================
-- Adds centralized payout state, payout ledger rows, reserve freeze metadata,
-- and order-level payout policy snapshots so tier-based payout timing can be
-- enforced without duplicating Stripe transfer logic in multiple routes.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_tier_snapshot TEXT CHECK (seller_tier_snapshot IN ('tier_1', 'tier_2', 'tier_3')),
  ADD COLUMN IF NOT EXISTS payout_schedule TEXT CHECK (payout_schedule IN (
    'buyer_confirmation_or_review_expiry',
    'delivery',
    'carrier_acceptance_and_delivery_split'
  )),
  ADD COLUMN IF NOT EXISTS reserve_percentage_bps_snapshot INT CHECK (
    reserve_percentage_bps_snapshot IS NULL OR (
      reserve_percentage_bps_snapshot >= 0 AND reserve_percentage_bps_snapshot <= 10000
    )
  ),
  ADD COLUMN IF NOT EXISTS reserve_hold_duration_days_snapshot INT CHECK (
    reserve_hold_duration_days_snapshot IS NULL OR reserve_hold_duration_days_snapshot >= 0
  ),
  ADD COLUMN IF NOT EXISTS minimum_reserve_balance_cents_snapshot BIGINT CHECK (
    minimum_reserve_balance_cents_snapshot IS NULL OR minimum_reserve_balance_cents_snapshot >= 0
  ),
  ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'pending' CHECK (payout_status IN (
    'pending', 'partially_paid', 'paid', 'frozen', 'refunded', 'failed'
  )),
  ADD COLUMN IF NOT EXISTS payout_frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_frozen_reason TEXT,
  ADD COLUMN IF NOT EXISTS payout_last_trigger TEXT,
  ADD COLUMN IF NOT EXISTS payout_last_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_last_error TEXT,
  ADD COLUMN IF NOT EXISTS seller_amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_amount_paid_cents >= 0),
  ADD COLUMN IF NOT EXISTS seller_amount_held_in_reserve_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_amount_held_in_reserve_cents >= 0),
  ADD COLUMN IF NOT EXISTS seller_amount_frozen_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_amount_frozen_cents >= 0),
  ADD COLUMN IF NOT EXISTS seller_amount_refunded_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_amount_refunded_cents >= 0);

CREATE TABLE IF NOT EXISTS public.order_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payout_step TEXT NOT NULL CHECK (payout_step IN (
    'final_release',
    'delivery_release',
    'carrier_acceptance_release',
    'delivery_balance_release',
    'manual_override_release'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'paid', 'frozen', 'failed', 'cancelled'
  )),
  gross_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (gross_amount_cents >= 0),
  reserve_withheld_cents BIGINT NOT NULL DEFAULT 0 CHECK (reserve_withheld_cents >= 0),
  minimum_balance_top_up_cents BIGINT NOT NULL DEFAULT 0 CHECK (minimum_balance_top_up_cents >= 0),
  net_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (net_paid_cents >= 0),
  reserve_release_eligible_at TIMESTAMPTZ,
  stripe_transfer_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  trigger_source TEXT,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  frozen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT order_payouts_order_step_unique UNIQUE (order_id, payout_step)
);

CREATE INDEX IF NOT EXISTS idx_order_payouts_order_id ON public.order_payouts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payouts_seller_id ON public.order_payouts(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_payouts_status ON public.order_payouts(status);
CREATE INDEX IF NOT EXISTS idx_order_payouts_paid_at ON public.order_payouts(paid_at);

ALTER TABLE public.seller_reserve_entries
  ADD COLUMN IF NOT EXISTS order_payout_id UUID REFERENCES public.order_payouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_seller_reserve_entries_order_payout_id ON public.seller_reserve_entries(order_payout_id);
CREATE INDEX IF NOT EXISTS idx_seller_reserve_entries_is_frozen ON public.seller_reserve_entries(is_frozen);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_order_payouts_updated_at'
  ) THEN
    CREATE TRIGGER update_order_payouts_updated_at
      BEFORE UPDATE ON public.order_payouts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Snapshot existing orders so payout processing can safely reason about legacy
-- rows without requiring order recreation.
UPDATE public.orders AS o
SET
  seller_tier_snapshot = COALESCE(
    o.seller_tier_snapshot,
    CASE
      WHEN p.seller_tier IN ('tier_1', 'tier_2', 'tier_3') THEN p.seller_tier
      ELSE 'tier_1'
    END
  ),
  payout_schedule = COALESCE(
    o.payout_schedule,
    CASE
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_3' THEN 'carrier_acceptance_and_delivery_split'
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_2' THEN 'delivery'
      ELSE 'buyer_confirmation_or_review_expiry'
    END
  ),
  reserve_percentage_bps_snapshot = COALESCE(
    o.reserve_percentage_bps_snapshot,
    CASE
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_3' THEN 200
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_2' THEN 500
      ELSE 1500
    END
  ),
  reserve_hold_duration_days_snapshot = COALESCE(
    o.reserve_hold_duration_days_snapshot,
    CASE
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_3' THEN NULL
      ELSE 30
    END
  ),
  minimum_reserve_balance_cents_snapshot = COALESCE(
    o.minimum_reserve_balance_cents_snapshot,
    CASE
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_3' THEN 50000
      ELSE 0
    END
  ),
  payout_status = CASE
    WHEN o.status = 'refunded' THEN 'refunded'
    WHEN o.status = 'disputed' OR COALESCE(o.seller_funds_frozen, false) THEN 'frozen'
    WHEN o.stripe_transfer_id IS NOT NULL THEN 'paid'
    ELSE o.payout_status
  END,
  seller_amount_paid_cents = CASE
    WHEN o.stripe_transfer_id IS NOT NULL AND COALESCE(o.seller_amount_paid_cents, 0) = 0
      THEN GREATEST(0, ROUND(COALESCE(o.seller_earnings, 0) * 100))
    ELSE o.seller_amount_paid_cents
  END
FROM public.profiles AS p
WHERE o.seller_id = p.id;

ALTER TABLE public.order_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their order payouts" ON public.order_payouts;
CREATE POLICY "Sellers can read their order payouts" ON public.order_payouts
  FOR SELECT
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Buyers can read their order payouts" ON public.order_payouts;
CREATE POLICY "Buyers can read their order payouts" ON public.order_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_payouts.order_id
        AND o.buyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage order payouts" ON public.order_payouts;
CREATE POLICY "Admins can manage order payouts" ON public.order_payouts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
