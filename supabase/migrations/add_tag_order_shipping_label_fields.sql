-- ============================================================================
-- TAG ORDER SHIPPING LABEL FIELDS
-- Follow-up migration for environments that already created `tag_orders`.
-- Stores Shippo label metadata for Relay tag fulfillment shipments.
-- ============================================================================

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shippo_transaction_id TEXT;

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shippo_shipment_id TEXT;

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shippo_rate_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_orders_shippo_transaction_id
  ON public.tag_orders(shippo_transaction_id)
  WHERE shippo_transaction_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
