-- ============================================================================
-- RELAY BALANCE + EXPOSURE TRACKING FOUNDATION
-- ============================================================================
-- Additive schema only: keep the existing order, auth, tag, dispute, reserve,
-- and payout systems intact while introducing a Relay-managed seller balance
-- ledger and withdrawal/exposure primitives.

-- ============================================================================
-- ORDER-LEVEL CENT SNAPSHOTS FOR BALANCE CREDITING
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_proceeds_cents BIGINT,
  ADD COLUMN IF NOT EXISTS relay_fee_cents BIGINT,
  ADD COLUMN IF NOT EXISTS stripe_fee_estimate_cents BIGINT,
  ADD COLUMN IF NOT EXISTS balance_credit_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS review_window_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS funds_available_at TIMESTAMPTZ;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_balance_credit_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_balance_credit_status_check
    CHECK (balance_credit_status IN (
      'not_started',
      'pending',
      'available',
      'failed',
      'reversed'
    ));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_seller_proceeds_cents_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_seller_proceeds_cents_check
    CHECK (seller_proceeds_cents IS NULL OR seller_proceeds_cents >= 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_relay_fee_cents_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_relay_fee_cents_check
    CHECK (relay_fee_cents IS NULL OR relay_fee_cents >= 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_stripe_fee_estimate_cents_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_stripe_fee_estimate_cents_check
    CHECK (stripe_fee_estimate_cents IS NULL OR stripe_fee_estimate_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_orders_balance_credit_status
  ON public.orders(balance_credit_status);
CREATE INDEX IF NOT EXISTS idx_orders_funds_available_at
  ON public.orders(funds_available_at);
CREATE INDEX IF NOT EXISTS idx_orders_review_window_ends_at
  ON public.orders(review_window_ends_at);

UPDATE public.orders
SET
  seller_proceeds_cents = COALESCE(
    seller_proceeds_cents,
    ROUND(COALESCE(seller_earnings, 0) * 100)
  ),
  relay_fee_cents = COALESCE(
    relay_fee_cents,
    ROUND(COALESCE(platform_fee, 0) * 100)
  ),
  stripe_fee_estimate_cents = COALESCE(
    stripe_fee_estimate_cents,
    ROUND(COALESCE(stripe_fee, 0) * 100)
  ),
  review_window_ends_at = COALESCE(review_window_ends_at, review_deadline),
  funds_available_at = COALESCE(funds_available_at, review_deadline)
WHERE
  seller_proceeds_cents IS NULL
  OR relay_fee_cents IS NULL
  OR stripe_fee_estimate_cents IS NULL
  OR review_window_ends_at IS NULL
  OR funds_available_at IS NULL;

-- ============================================================================
-- RELAY BALANCE CACHE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.relay_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_balance_cents BIGINT NOT NULL DEFAULT 0,
  available_balance_cents BIGINT NOT NULL DEFAULT 0,
  pending_balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (pending_balance_cents >= 0),
  exposure_cents BIGINT NOT NULL DEFAULT 0 CHECK (exposure_cents >= 0),
  withdrawable_balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (withdrawable_balance_cents >= 0),
  CONSTRAINT relay_balances_total_consistency_check
    CHECK (total_balance_cents = available_balance_cents + pending_balance_cents),
  CONSTRAINT relay_balances_withdrawable_consistency_check
    CHECK (
      withdrawable_balance_cents <= CASE
        WHEN available_balance_cents > 0 THEN available_balance_cents
        ELSE 0
      END
    ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_balances_seller_id
  ON public.relay_balances(seller_id);

-- ============================================================================
-- APPEND-ONLY RELAY BALANCE LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.relay_balance_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'order_pending_credit',
    'order_available_credit',
    'withdrawal_requested',
    'withdrawal_completed',
    'withdrawal_failed',
    'exposure_hold_created',
    'exposure_hold_released',
    'dispute_freeze',
    'dispute_debit',
    'admin_adjustment'
  )),
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = lower(currency)),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN (
    'pending',
    'posted',
    'completed',
    'failed',
    'canceled'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT relay_balance_ledger_order_required_check CHECK (
    CASE
      WHEN type IN (
        'order_pending_credit',
        'order_available_credit',
        'exposure_hold_created',
        'exposure_hold_released',
        'dispute_freeze',
        'dispute_debit'
      ) THEN order_id IS NOT NULL
      ELSE TRUE
    END
  ),
  CONSTRAINT relay_balance_ledger_amount_direction_check CHECK (
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
        'withdrawal_requested',
        'dispute_debit'
      ) THEN amount_cents < 0
      ELSE amount_cents <> 0
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_seller_id
  ON public.relay_balance_ledger(seller_id);
CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_order_id
  ON public.relay_balance_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_type
  ON public.relay_balance_ledger(type);
CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_status
  ON public.relay_balance_ledger(status);
CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_created_at
  ON public.relay_balance_ledger(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_balance_ledger_order_pending_credit_unique
  ON public.relay_balance_ledger(order_id, type)
  WHERE order_id IS NOT NULL
    AND type = 'order_pending_credit'
    AND status IN ('pending', 'posted', 'completed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_balance_ledger_order_available_credit_unique
  ON public.relay_balance_ledger(order_id, type)
  WHERE order_id IS NOT NULL
    AND type = 'order_available_credit'
    AND status IN ('pending', 'posted', 'completed');

-- ============================================================================
-- EXPOSURE HOLDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exposure_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'released',
    'consumed',
    'disputed'
  )),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exposure_holds_seller_id
  ON public.exposure_holds(seller_id);
CREATE INDEX IF NOT EXISTS idx_exposure_holds_order_id
  ON public.exposure_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_exposure_holds_status
  ON public.exposure_holds(status);
CREATE INDEX IF NOT EXISTS idx_exposure_holds_created_at
  ON public.exposure_holds(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exposure_holds_open_order_unique
  ON public.exposure_holds(order_id)
  WHERE status IN ('active', 'disputed');

-- ============================================================================
-- WITHDRAWAL REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  stripe_transfer_id TEXT,
  stripe_transfer_fee_cents BIGINT NOT NULL DEFAULT 25 CHECK (stripe_transfer_fee_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'canceled'
  )),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT withdrawal_requests_completed_at_check CHECK (
    CASE
      WHEN status = 'completed' THEN completed_at IS NOT NULL
      ELSE TRUE
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_seller_id
  ON public.withdrawal_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status
  ON public.withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at
  ON public.withdrawal_requests(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_requests_stripe_transfer_id_unique
  ON public.withdrawal_requests(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

-- ============================================================================
-- BALANCE RECALCULATION HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_relay_balance(target_seller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_pending BIGINT := 0;
  calculated_available BIGINT := 0;
  calculated_exposure BIGINT := 0;
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

  SELECT COALESCE(SUM(amount_cents), 0)
  INTO calculated_exposure
  FROM public.exposure_holds
  WHERE seller_id = target_seller_id
    AND status IN ('active', 'disputed');

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
    GREATEST(calculated_exposure, 0),
    GREATEST(calculated_available - calculated_exposure, 0),
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

CREATE OR REPLACE FUNCTION public.sync_relay_balance_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalculate_relay_balance(NEW.seller_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_relay_balance_from_exposure_holds()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalculate_relay_balance(COALESCE(NEW.seller_id, OLD.seller_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_relay_balance_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'relay_balance_ledger is append-only; % is not allowed', TG_OP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_relay_balances_updated_at'
  ) THEN
    CREATE TRIGGER update_relay_balances_updated_at
      BEFORE UPDATE ON public.relay_balances
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sync_relay_balance_after_ledger_insert'
  ) THEN
    CREATE TRIGGER sync_relay_balance_after_ledger_insert
      AFTER INSERT ON public.relay_balance_ledger
      FOR EACH ROW EXECUTE FUNCTION public.sync_relay_balance_from_ledger();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_relay_balance_ledger_update'
  ) THEN
    CREATE TRIGGER prevent_relay_balance_ledger_update
      BEFORE UPDATE ON public.relay_balance_ledger
      FOR EACH ROW EXECUTE FUNCTION public.prevent_relay_balance_ledger_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_relay_balance_ledger_delete'
  ) THEN
    CREATE TRIGGER prevent_relay_balance_ledger_delete
      BEFORE DELETE ON public.relay_balance_ledger
      FOR EACH ROW EXECUTE FUNCTION public.prevent_relay_balance_ledger_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sync_relay_balance_after_exposure_hold_write'
  ) THEN
    CREATE TRIGGER sync_relay_balance_after_exposure_hold_write
      AFTER INSERT OR UPDATE OR DELETE ON public.exposure_holds
      FOR EACH ROW EXECUTE FUNCTION public.sync_relay_balance_from_exposure_holds();
  END IF;
END $$;

-- ============================================================================
-- BACKFILL CURRENT SELLERS INTO RELAY BALANCE CACHE
-- ============================================================================
INSERT INTO public.relay_balances (
  seller_id,
  total_balance_cents,
  available_balance_cents,
  pending_balance_cents,
  exposure_cents,
  withdrawable_balance_cents,
  updated_at
)
SELECT
  p.id,
  0,
  0,
  0,
  0,
  0,
  NOW()
FROM public.profiles AS p
WHERE p.role = 'seller'
ON CONFLICT (seller_id) DO NOTHING;

-- Recalculate after seeding so any future preloaded ledger / exposure rows are
-- reflected if this migration is replayed in a derived environment.
DO $$
DECLARE
  seller_row RECORD;
BEGIN
  FOR seller_row IN
    SELECT id
    FROM public.profiles
    WHERE role = 'seller'
  LOOP
    PERFORM public.recalculate_relay_balance(seller_row.id);
  END LOOP;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- These tables are intended to be mutated by server routes / service role.
-- Sellers get scoped read access to their own balance data; admins can manage.
-- ============================================================================
ALTER TABLE public.relay_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exposure_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their relay balances" ON public.relay_balances;
CREATE POLICY "Sellers can read their relay balances" ON public.relay_balances
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage relay balances" ON public.relay_balances;
CREATE POLICY "Admins can manage relay balances" ON public.relay_balances
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sellers can read their relay balance ledger" ON public.relay_balance_ledger;
CREATE POLICY "Sellers can read their relay balance ledger" ON public.relay_balance_ledger
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage relay balance ledger" ON public.relay_balance_ledger;
CREATE POLICY "Admins can manage relay balance ledger" ON public.relay_balance_ledger
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sellers can read their exposure holds" ON public.exposure_holds;
CREATE POLICY "Sellers can read their exposure holds" ON public.exposure_holds
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage exposure holds" ON public.exposure_holds;
CREATE POLICY "Admins can manage exposure holds" ON public.exposure_holds
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sellers can read their withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Sellers can read their withdrawal requests" ON public.withdrawal_requests
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Admins can manage withdrawal requests" ON public.withdrawal_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
