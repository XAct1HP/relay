-- ============================================================================
-- SELLER IDENTITY PROTECTION + STRIPE CONNECT FINGERPRINTING
-- ============================================================================
-- Introduces hashed identity fingerprints sourced from Stripe Connect and
-- profile metadata so Relay can make repeat scam / ban-evasion attempts harder
-- without storing raw identity documents or unnecessary sensitive data.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_identity_verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS seller_identity_review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_identity_review_reason TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_stripe_identity_verification_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_stripe_identity_verification_status_check
    CHECK (stripe_identity_verification_status IN (
      'unverified',
      'pending',
      'verified',
      'restricted',
      'review_required'
    ));

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connect_onboarding_complete
  ON public.profiles(stripe_connect_onboarding_complete);

CREATE INDEX IF NOT EXISTS idx_profiles_seller_identity_review_required
  ON public.profiles(seller_identity_review_required);

CREATE TABLE IF NOT EXISTS public.seller_identity_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  identity_fingerprint TEXT,
  phone_fingerprint TEXT,
  email_fingerprint TEXT,
  bank_account_fingerprint TEXT,
  country_code TEXT,
  stripe_account_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN (
    'unverified',
    'pending',
    'verified',
    'restricted',
    'review_required'
  )),
  stripe_connect_onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  matched_banned_identity BOOLEAN NOT NULL DEFAULT false,
  matched_banned_identity_id UUID REFERENCES public.seller_identity_profiles(id) ON DELETE SET NULL,
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  admin_review_required BOOLEAN NOT NULL DEFAULT false,
  false_positive_cleared BOOLEAN NOT NULL DEFAULT false,
  false_positive_cleared_at TIMESTAMPTZ,
  false_positive_cleared_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  banned_identity BOOLEAN NOT NULL DEFAULT false,
  banned_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_seller_id
  ON public.seller_identity_profiles(seller_id);

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_identity_fingerprint
  ON public.seller_identity_profiles(identity_fingerprint)
  WHERE identity_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_phone_fingerprint
  ON public.seller_identity_profiles(phone_fingerprint)
  WHERE phone_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_email_fingerprint
  ON public.seller_identity_profiles(email_fingerprint)
  WHERE email_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_bank_account_fingerprint
  ON public.seller_identity_profiles(bank_account_fingerprint)
  WHERE bank_account_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_stripe_account_id
  ON public.seller_identity_profiles(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_banned_identity
  ON public.seller_identity_profiles(banned_identity);

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_admin_review_required
  ON public.seller_identity_profiles(admin_review_required);

CREATE INDEX IF NOT EXISTS idx_seller_identity_profiles_matched_banned_identity
  ON public.seller_identity_profiles(matched_banned_identity);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_seller_identity_profiles_updated_at'
  ) THEN
    CREATE TRIGGER update_seller_identity_profiles_updated_at
      BEFORE UPDATE ON public.seller_identity_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

INSERT INTO public.seller_identity_profiles (
  seller_id,
  stripe_account_id,
  verification_status,
  stripe_connect_onboarding_complete,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.stripe_account_id,
  p.stripe_identity_verification_status,
  p.stripe_connect_onboarding_complete,
  NOW(),
  NOW()
FROM public.profiles AS p
WHERE p.role IN ('seller', 'buyer')
ON CONFLICT (seller_id) DO NOTHING;

ALTER TABLE public.seller_identity_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their own identity profile" ON public.seller_identity_profiles;
CREATE POLICY "Sellers can read their own identity profile" ON public.seller_identity_profiles
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage seller identity profiles" ON public.seller_identity_profiles;
CREATE POLICY "Admins can manage seller identity profiles" ON public.seller_identity_profiles
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
