-- ============================================================================
-- RELAY BALANCE LEDGER MANUAL CLEANUP SUPPORT
-- ============================================================================
-- Manual test cleanup in Supabase should be able to delete users/orders and
-- let the associated Relay balance records cascade cleanly. We keep the ledger
-- append-only for updates, but allow deletes so parent-row cleanup works.

ALTER TABLE public.relay_balance_ledger
  DROP CONSTRAINT IF EXISTS relay_balance_ledger_order_id_fkey;

ALTER TABLE public.relay_balance_ledger
  ADD CONSTRAINT relay_balance_ledger_order_id_fkey
    FOREIGN KEY (order_id)
    REFERENCES public.orders(id)
    ON DELETE CASCADE;

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = target_seller_id
  ) THEN
    DELETE FROM public.relay_balances
    WHERE seller_id = target_seller_id;

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

CREATE OR REPLACE FUNCTION public.sync_relay_balance_from_ledger()
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
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'relay_balance_ledger is append-only; % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS sync_relay_balance_after_ledger_insert ON public.relay_balance_ledger;

CREATE TRIGGER sync_relay_balance_after_ledger_insert
  AFTER INSERT OR DELETE ON public.relay_balance_ledger
  FOR EACH ROW EXECUTE FUNCTION public.sync_relay_balance_from_ledger();
