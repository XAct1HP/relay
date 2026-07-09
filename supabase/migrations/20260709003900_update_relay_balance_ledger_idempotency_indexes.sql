-- ============================================================================
-- RELAY BALANCE LEDGER IDEMPOTENCY INDEX UPDATE
-- ============================================================================
-- Follow-up migration for environments that already applied
-- add_relay_balance_foundation.sql. This replaces the single available-credit
-- per-order uniqueness rule with metadata-based idempotency so staged releases
-- (for example Tier 3 carrier acceptance + delivery) can coexist safely.

DROP INDEX IF EXISTS public.idx_relay_balance_ledger_order_available_credit_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_balance_ledger_idempotency_key_unique
  ON public.relay_balance_ledger(type, ((metadata->>'idempotency_key')))
  WHERE metadata ? 'idempotency_key';
