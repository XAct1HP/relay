-- ============================================================================
-- ORDER AUTH RISK CONTROLS
-- Persist high-risk SKU rules, Tier 3 random-audit settings, and review fields
-- without breaking legacy orders that predate the new auth decision engine.
-- ============================================================================

-- ============================================================================
-- SITE SETTINGS: RANDOM AUDIT RATE
-- ============================================================================
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS tier_3_random_audit_rate_bps INT NOT NULL DEFAULT 500;

ALTER TABLE site_settings
  DROP CONSTRAINT IF EXISTS site_settings_tier_3_random_audit_rate_bps_check;

ALTER TABLE site_settings
  ADD CONSTRAINT site_settings_tier_3_random_audit_rate_bps_check
  CHECK (tier_3_random_audit_rate_bps >= 0 AND tier_3_random_audit_rate_bps <= 10000);

UPDATE site_settings
SET tier_3_random_audit_rate_bps = COALESCE(tier_3_random_audit_rate_bps, 500);

-- ============================================================================
-- HIGH-RISK SKU LIST
-- ============================================================================
CREATE TABLE IF NOT EXISTS high_risk_skus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_normalized TEXT NOT NULL UNIQUE,
  display_sku TEXT,
  risk_reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  removed_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_high_risk_skus_is_active ON high_risk_skus(is_active);
CREATE INDEX IF NOT EXISTS idx_high_risk_skus_sku_normalized ON high_risk_skus(sku_normalized);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_high_risk_skus_updated_at'
  ) THEN
    CREATE TRIGGER update_high_risk_skus_updated_at
      BEFORE UPDATE ON high_risk_skus
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE high_risk_skus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read high risk skus" ON high_risk_skus;
CREATE POLICY "Admins can read high risk skus" ON high_risk_skus
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage high risk skus" ON high_risk_skus;
CREATE POLICY "Admins can manage high risk skus" ON high_risk_skus
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- ORDERS: AUTH DECISION SNAPSHOT + REVIEW FIELDS
-- ============================================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS auth_requirements_evaluated_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS random_audit_rate_bps_snapshot INT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS high_risk_sku_id UUID REFERENCES high_risk_skus(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS high_risk_sku_reason TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS checkcheck_reviewed_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS checkcheck_reviewed_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS checkcheck_admin_notes TEXT;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_random_audit_rate_bps_snapshot_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_random_audit_rate_bps_snapshot_check
  CHECK (
    random_audit_rate_bps_snapshot IS NULL
    OR (random_audit_rate_bps_snapshot >= 0 AND random_audit_rate_bps_snapshot <= 10000)
  );

CREATE INDEX IF NOT EXISTS idx_orders_auth_requirements_evaluated_at
  ON orders(auth_requirements_evaluated_at);
CREATE INDEX IF NOT EXISTS idx_orders_high_risk_sku_id
  ON orders(high_risk_sku_id);
CREATE INDEX IF NOT EXISTS idx_orders_checkcheck_reviewed_by_admin_id
  ON orders(checkcheck_reviewed_by_admin_id);
