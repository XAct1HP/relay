-- ============================================================================
-- STRIPE CHECKOUT SESSION RECOVERY
-- Tracks the Stripe checkout session on shoe orders so we can safely finalize
-- orders from either the webhook or the post-checkout success page without
-- creating duplicates.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_stripe_checkout_session_id
  ON public.orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_checkout_session_id
  ON public.orders(stripe_checkout_session_id);
