-- ============================================================================
-- SELLER TRUST ADMIN CONTROLS
-- Adds approval, lock, history, and violation tracking needed for automated
-- tier evaluation and admin override controls.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recommended_seller_tier TEXT NOT NULL DEFAULT 'tier_1';
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_recommended_seller_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_recommended_seller_tier_check
  CHECK (recommended_seller_tier IN ('tier_1', 'tier_2', 'tier_3'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recommended_trust_score INT NOT NULL DEFAULT 0;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_recommended_trust_score_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_recommended_trust_score_check
  CHECK (recommended_trust_score >= 0 AND recommended_trust_score <= 100);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_locked_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founding_seller BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_3_approved_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_3_approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_recommended_seller_tier ON profiles(recommended_seller_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_tier_locked ON profiles(tier_locked);
CREATE INDEX IF NOT EXISTS idx_profiles_is_founding_seller ON profiles(is_founding_seller);

CREATE TABLE IF NOT EXISTS seller_tier_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  previous_tier TEXT CHECK (previous_tier IS NULL OR previous_tier IN ('tier_1', 'tier_2', 'tier_3')),
  new_tier TEXT NOT NULL CHECK (new_tier IN ('tier_1', 'tier_2', 'tier_3')),
  recommended_tier TEXT CHECK (recommended_tier IS NULL OR recommended_tier IN ('tier_1', 'tier_2', 'tier_3')),
  trust_score INT CHECK (trust_score IS NULL OR (trust_score >= 0 AND trust_score <= 100)),
  change_source TEXT NOT NULL CHECK (change_source IN (
    'automated_evaluation', 'manual_override', 'manual_unlock', 'admin_approval',
    'authenticity_violation', 'tag_tampering_violation', 'dispute_rate_demotion'
  )),
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_tier_history_seller_id ON seller_tier_history(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_tier_history_change_source ON seller_tier_history(change_source);
CREATE INDEX IF NOT EXISTS idx_seller_tier_history_created_at ON seller_tier_history(created_at);

CREATE TABLE IF NOT EXISTS seller_trust_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trust_score INT NOT NULL CHECK (trust_score >= 0 AND trust_score <= 100),
  recommended_tier TEXT NOT NULL CHECK (recommended_tier IN ('tier_1', 'tier_2', 'tier_3')),
  applied_tier TEXT NOT NULL CHECK (applied_tier IN ('tier_1', 'tier_2', 'tier_3')),
  was_tier_changed BOOLEAN NOT NULL DEFAULT false,
  manual_override_applied BOOLEAN NOT NULL DEFAULT false,
  admin_approval_required BOOLEAN NOT NULL DEFAULT false,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  hard_thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_trust_evaluations_seller_id ON seller_trust_evaluations(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_trust_evaluations_created_at ON seller_trust_evaluations(created_at);

CREATE TABLE IF NOT EXISTS seller_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN (
    'authenticity', 'tag_tampering', 'dispute_rate', 'manual_demotion', 'other'
  )),
  severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  penalty_outcome TEXT,
  notes TEXT,
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_violations_seller_id ON seller_violations(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_violations_violation_type ON seller_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_seller_violations_order_id ON seller_violations(order_id);
CREATE INDEX IF NOT EXISTS idx_seller_violations_created_at ON seller_violations(created_at);

ALTER TABLE seller_tier_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_trust_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read seller tier history" ON seller_tier_history;
CREATE POLICY "Admins can read seller tier history" ON seller_tier_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage seller tier history" ON seller_tier_history;
CREATE POLICY "Admins can manage seller tier history" ON seller_tier_history
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

DROP POLICY IF EXISTS "Admins can read seller trust evaluations" ON seller_trust_evaluations;
CREATE POLICY "Admins can read seller trust evaluations" ON seller_trust_evaluations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage seller trust evaluations" ON seller_trust_evaluations;
CREATE POLICY "Admins can manage seller trust evaluations" ON seller_trust_evaluations
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

DROP POLICY IF EXISTS "Admins can read seller violations" ON seller_violations;
CREATE POLICY "Admins can read seller violations" ON seller_violations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage seller violations" ON seller_violations;
CREATE POLICY "Admins can manage seller violations" ON seller_violations
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
