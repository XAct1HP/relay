-- ============================================================================
-- LAUNCH FOUNDING SELLER PROGRAM FLAG
-- ============================================================================
-- Founding seller status is a launch badge / program flag. It is intentionally
-- separate from seller tier and does not imply faster payout timing.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founding_seller BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_founding_seller_launch
  ON public.profiles(is_founding_seller);
