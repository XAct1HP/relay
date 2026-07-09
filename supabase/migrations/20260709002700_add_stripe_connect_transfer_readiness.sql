-- ============================================================================
-- STRIPE CONNECT TRANSFER READINESS SNAPSHOT
-- ============================================================================
-- Stores the latest Stripe Connect transfer-destination readiness fields for
-- seller profiles and identity profiles. Relay uses connected accounts only as
-- withdrawal destinations, so transfer capability is the important gate.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_transfers_capability_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_stripe_transfers_capability_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_stripe_transfers_capability_status_check
    CHECK (stripe_transfers_capability_status IN (
      'active',
      'inactive',
      'pending',
      'unrequested',
      'unknown'
    ));

ALTER TABLE public.seller_identity_profiles
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_transfers_capability_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE public.seller_identity_profiles
  DROP CONSTRAINT IF EXISTS seller_identity_profiles_stripe_transfers_capability_status_check;

ALTER TABLE public.seller_identity_profiles
  ADD CONSTRAINT seller_identity_profiles_stripe_transfers_capability_status_check
    CHECK (stripe_transfers_capability_status IN (
      'active',
      'inactive',
      'pending',
      'unrequested',
      'unknown'
    ));

UPDATE public.seller_identity_profiles AS sip
SET
  stripe_payouts_enabled = p.stripe_payouts_enabled,
  stripe_charges_enabled = p.stripe_charges_enabled,
  stripe_transfers_capability_status = COALESCE(
    NULLIF(p.stripe_transfers_capability_status, ''),
    sip.stripe_transfers_capability_status,
    'unknown'
  ),
  updated_at = NOW()
FROM public.profiles AS p
WHERE p.id = sip.seller_id;
