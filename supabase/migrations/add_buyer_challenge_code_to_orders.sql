-- Add a separate challenge code for buyer delivery verification.
-- This is generated when delivery is confirmed (mark-delivered or background job)
-- and is distinct from the seller's challenge_code used during post-sale auth.

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS buyer_challenge_code text;

COMMENT ON COLUMN orders.buyer_challenge_code IS 'Challenge code for buyer mobile verification flow, generated at delivery confirmation';
