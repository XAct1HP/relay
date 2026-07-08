-- ============================================================================
-- FOUNDING SELLER FAST-TRACK + CONDITION PHOTO ATTENTION FLAG
-- ============================================================================
-- Adds two capabilities:
--   1. profiles.onboarding_stripe_only lets admins provision founding sellers
--      who are already approved and only need to connect Stripe on first login.
--   2. listing_variants.needs_condition_photo marks used variants that were
--      bulk-imported without a condition photo so they surface in the
--      "Needs Attention" section of My Listings and stay inactive until a
--      photo is uploaded.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_stripe_only BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_stripe_only
  ON public.profiles(onboarding_stripe_only)
  WHERE onboarding_stripe_only = true;

ALTER TABLE public.listing_variants
  ADD COLUMN IF NOT EXISTS needs_condition_photo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.listing_variants
  ADD COLUMN IF NOT EXISTS condition TEXT;

ALTER TABLE public.listing_variants
  ADD COLUMN IF NOT EXISTS condition_photo_url TEXT;

ALTER TABLE public.listing_variants
  DROP CONSTRAINT IF EXISTS listing_variants_condition_check;

ALTER TABLE public.listing_variants
  ADD CONSTRAINT listing_variants_condition_check
    CHECK (condition IS NULL OR condition IN ('new', 'used'));

CREATE INDEX IF NOT EXISTS idx_listing_variants_needs_condition_photo
  ON public.listing_variants(listing_id)
  WHERE needs_condition_photo = true;

COMMENT ON COLUMN public.profiles.onboarding_stripe_only IS
  'Admin-provisioned founding sellers who skip application/questionnaire and only need Stripe Connect on first login.';
COMMENT ON COLUMN public.listing_variants.needs_condition_photo IS
  'Set true when a used variant was imported without a photo. Variant cannot be activated until photo is uploaded.';
COMMENT ON COLUMN public.listing_variants.condition IS
  'Per-variant condition override: new or used. Falls back to parent listing condition when null.';
