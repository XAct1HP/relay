-- ============================================================================
-- RELAY BALANCE ADMIN FREEZE CONTROLS
-- ============================================================================
-- Adds seller-wide Relay Balance freeze metadata so admins can temporarily
-- block withdrawals without mutating append-only ledger history.

ALTER TABLE public.relay_balances
  ADD COLUMN IF NOT EXISTS admin_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_reason TEXT,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_relay_balances_admin_frozen
  ON public.relay_balances(admin_frozen);

CREATE INDEX IF NOT EXISTS idx_relay_balances_frozen_by_admin_id
  ON public.relay_balances(frozen_by_admin_id);

ALTER TABLE public.relay_balances
  DROP CONSTRAINT IF EXISTS relay_balances_frozen_reason_check;

ALTER TABLE public.relay_balances
  ADD CONSTRAINT relay_balances_frozen_reason_check CHECK (
    CASE
      WHEN admin_frozen THEN frozen_reason IS NOT NULL AND length(trim(frozen_reason)) > 0
      ELSE TRUE
    END
  );
