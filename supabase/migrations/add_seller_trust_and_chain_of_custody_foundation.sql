-- ============================================================================
-- SELLER TRUST + CHAIN OF CUSTODY FOUNDATION
-- Additive schema only: keep existing orders and routes working while we
-- introduce first-class trust, reserve, tag, custody, dispute, and audit data.
-- ============================================================================

-- ============================================================================
-- PROFILE TRUST SNAPSHOT COLUMNS
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS seller_tier TEXT NOT NULL DEFAULT 'tier_1';
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_seller_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_seller_tier_check
  CHECK (seller_tier IN ('tier_1', 'tier_2', 'tier_3'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trust_score INT NOT NULL DEFAULT 0;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_trust_score_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_trust_score_check
  CHECK (trust_score >= 0 AND trust_score <= 100);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS completed_order_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lifetime_gmv_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trailing_30d_order_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trailing_30d_dispute_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trailing_90d_order_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trailing_90d_dispute_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trailing_180d_order_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trailing_180d_dispute_count INT NOT NULL DEFAULT 0;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS buyer_completion_completed_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS buyer_completion_eligible_order_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS buyer_completion_rate_bps INT NOT NULL DEFAULT 10000;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_buyer_completion_rate_bps_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_buyer_completion_rate_bps_check
  CHECK (buyer_completion_rate_bps >= 0 AND buyer_completion_rate_bps <= 10000);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS seller_approved_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_completed_order_at TIMESTAMPTZ;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS authenticity_violation_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_authenticity_violation_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_manually_overridden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_manually_overridden_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_override_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_last_evaluated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_seller_tier ON profiles(seller_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_tier_last_evaluated_at ON profiles(tier_last_evaluated_at);

-- ============================================================================
-- ORDER AUTH + TAG REQUIREMENTS
-- ============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS relay_tag_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkcheck_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkcheck_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkcheck_status TEXT NOT NULL DEFAULT 'required';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_checkcheck_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_checkcheck_status_check
  CHECK (checkcheck_status IN (
    'not_required', 'required', 'submitted', 'approved', 'rejected', 'admin_review'
  ));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS random_audit_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS high_risk_sku_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_funds_frozen BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_checkcheck_status ON orders(checkcheck_status);
CREATE INDEX IF NOT EXISTS idx_orders_seller_funds_frozen ON orders(seller_funds_frozen);

-- Backfill current order auth state without changing legacy route behavior.
UPDATE orders
SET checkcheck_status = CASE
  WHEN COALESCE(checkcheck_required, true) = false THEN 'not_required'
  WHEN checkcheck_certificate_url IS NOT NULL AND checkcheck_certificate_url <> '' THEN 'submitted'
  ELSE 'required'
END
WHERE checkcheck_status IS NULL
   OR checkcheck_status NOT IN ('not_required', 'required', 'submitted', 'approved', 'rejected', 'admin_review');

-- ============================================================================
-- SELLER RESERVE ACCOUNTS + LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS seller_reserve_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  minimum_balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (minimum_balance_cents >= 0),
  reserve_percentage_bps INT NOT NULL DEFAULT 1500 CHECK (reserve_percentage_bps >= 0 AND reserve_percentage_bps <= 10000),
  hold_duration_days INT CHECK (hold_duration_days IS NULL OR hold_duration_days >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_reserve_accounts_seller_id ON seller_reserve_accounts(seller_id);

CREATE TABLE IF NOT EXISTS seller_reserve_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('hold', 'release', 'consume', 'adjustment', 'minimum_balance_seed')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  reserve_percentage_bps INT NOT NULL DEFAULT 0 CHECK (reserve_percentage_bps >= 0 AND reserve_percentage_bps <= 10000),
  hold_duration_days INT CHECK (hold_duration_days IS NULL OR hold_duration_days >= 0),
  release_eligible_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'held', 'released', 'consumed')),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_reserve_entries_seller_id ON seller_reserve_entries(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_reserve_entries_order_id ON seller_reserve_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_seller_reserve_entries_status ON seller_reserve_entries(status);
CREATE INDEX IF NOT EXISTS idx_seller_reserve_entries_release_eligible_at ON seller_reserve_entries(release_eligible_at);

-- ============================================================================
-- RELAY TAG INVENTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS relay_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag_serial_number TEXT NOT NULL UNIQUE,
  barcode_value TEXT UNIQUE,
  assigned_seller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'unassigned' CHECK (status IN (
    'unassigned', 'assigned_to_seller', 'bound_to_order', 'submitted_by_seller',
    'shipped', 'buyer_scanned', 'completed', 'disputed', 'voided'
  )),
  assigned_to_seller_at TIMESTAMPTZ,
  bound_to_order_at TIMESTAMPTZ,
  submitted_by_seller_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  buyer_scanned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  photo_verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (photo_verification_status IN (
    'pending', 'verified', 'mismatch', 'admin_review'
  )),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_tags_assigned_seller_id ON relay_tags(assigned_seller_id);
CREATE INDEX IF NOT EXISTS idx_relay_tags_assigned_order_id ON relay_tags(assigned_order_id);
CREATE INDEX IF NOT EXISTS idx_relay_tags_status ON relay_tags(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_tags_unique_assigned_order
  ON relay_tags(assigned_order_id)
  WHERE assigned_order_id IS NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS relay_tag_id UUID REFERENCES relay_tags(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_relay_tag_id ON orders(relay_tag_id);

CREATE TABLE IF NOT EXISTS relay_tag_scan_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  relay_tag_id UUID NOT NULL REFERENCES relay_tags(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('system', 'admin', 'seller', 'buyer')),
  scan_type TEXT NOT NULL,
  scanned_value TEXT NOT NULL,
  scanned_barcode_value TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_tag_scan_events_relay_tag_id ON relay_tag_scan_events(relay_tag_id);
CREATE INDEX IF NOT EXISTS idx_relay_tag_scan_events_order_id ON relay_tag_scan_events(order_id);
CREATE INDEX IF NOT EXISTS idx_relay_tag_scan_events_seller_id ON relay_tag_scan_events(seller_id);
CREATE INDEX IF NOT EXISTS idx_relay_tag_scan_events_actor_user_id ON relay_tag_scan_events(actor_user_id);

-- ============================================================================
-- ORDER CHAIN OF CUSTODY
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_chain_of_custody (
  order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  relay_tag_id UUID REFERENCES relay_tags(id) ON DELETE SET NULL,
  seller_scanned_tag_value TEXT,
  buyer_scanned_tag_value TEXT,
  seller_tag_photo_url TEXT,
  seller_pair_photo_url TEXT,
  seller_box_photo_url TEXT,
  seller_sealed_package_photo_url TEXT,
  buyer_tag_photo_url TEXT,
  buyer_pair_photo_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'pending', 'submitted', 'verified', 'mismatch', 'admin_review'
  )),
  mismatch_reason TEXT,
  admin_review_required BOOLEAN NOT NULL DEFAULT false,
  seller_submitted_at TIMESTAMPTZ,
  buyer_submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_chain_of_custody_relay_tag_id ON order_chain_of_custody(relay_tag_id);
CREATE INDEX IF NOT EXISTS idx_order_chain_of_custody_verification_status ON order_chain_of_custody(verification_status);

-- ============================================================================
-- FIRST-CLASS ORDER DISPUTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  opened_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'authenticity', 'condition_not_as_listed', 'wrong_item',
    'tampered_tag', 'missing_contents', 'shipping_damage'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'seller_responded', 'under_review', 'resolved', 'closed'
  )),
  buyer_description TEXT,
  seller_description TEXT,
  evidence_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  buyer_evidence_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  seller_evidence_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  buyer_scanned_tag_value TEXT,
  seller_funds_frozen BOOLEAN NOT NULL DEFAULT false,
  admin_resolution TEXT,
  financial_outcome TEXT,
  seller_penalty_outcome TEXT,
  resolved_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_disputes_buyer_id ON order_disputes(buyer_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_seller_id ON order_disputes(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_category ON order_disputes(category);
CREATE INDEX IF NOT EXISTS idx_order_disputes_status ON order_disputes(status);

-- ============================================================================
-- GENERIC AUDIT / EVENT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS relay_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('system', 'admin', 'seller', 'buyer')),
  event_type TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_audit_events_actor_user_id ON relay_audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_relay_audit_events_event_type ON relay_audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_relay_audit_events_order_id ON relay_audit_events(order_id);
CREATE INDEX IF NOT EXISTS idx_relay_audit_events_seller_id ON relay_audit_events(seller_id);
CREATE INDEX IF NOT EXISTS idx_relay_audit_events_created_at ON relay_audit_events(created_at);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_seller_reserve_accounts_updated_at'
  ) THEN
    CREATE TRIGGER update_seller_reserve_accounts_updated_at
      BEFORE UPDATE ON seller_reserve_accounts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_seller_reserve_entries_updated_at'
  ) THEN
    CREATE TRIGGER update_seller_reserve_entries_updated_at
      BEFORE UPDATE ON seller_reserve_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_relay_tags_updated_at'
  ) THEN
    CREATE TRIGGER update_relay_tags_updated_at
      BEFORE UPDATE ON relay_tags
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_order_chain_of_custody_updated_at'
  ) THEN
    CREATE TRIGGER update_order_chain_of_custody_updated_at
      BEFORE UPDATE ON order_chain_of_custody
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_order_disputes_updated_at'
  ) THEN
    CREATE TRIGGER update_order_disputes_updated_at
      BEFORE UPDATE ON order_disputes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- BACKFILL EXISTING SELLER SNAPSHOTS + RESERVE ACCOUNTS
-- ============================================================================
UPDATE profiles
SET seller_approved_at = created_at
WHERE seller_approved_at IS NULL
  AND (role = 'seller' OR seller_application_status = 'approved');

WITH seller_order_stats AS (
  SELECT
    seller_id,
    COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed_order_count,
    COALESCE(SUM(ROUND(price * 100)) FILTER (WHERE status = 'completed'), 0)::BIGINT AS lifetime_gmv_cents,
    COUNT(*) FILTER (
      WHERE status IN (
        'completed', 'disputed', 'refunded', 'return_pending', 'return_shipped', 'return_delivered'
      )
    )::INT AS buyer_completion_eligible_order_count,
    COUNT(*) FILTER (WHERE status = 'completed')::INT AS buyer_completion_completed_count,
    COUNT(*) FILTER (
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND status IN ('completed', 'disputed', 'refunded', 'return_pending', 'return_shipped', 'return_delivered')
    )::INT AS trailing_30d_order_count,
    COUNT(*) FILTER (
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND status = 'disputed'
    )::INT AS trailing_30d_dispute_count,
    COUNT(*) FILTER (
      WHERE created_at >= NOW() - INTERVAL '90 days'
        AND status IN ('completed', 'disputed', 'refunded', 'return_pending', 'return_shipped', 'return_delivered')
    )::INT AS trailing_90d_order_count,
    COUNT(*) FILTER (
      WHERE created_at >= NOW() - INTERVAL '90 days'
        AND status = 'disputed'
    )::INT AS trailing_90d_dispute_count,
    COUNT(*) FILTER (
      WHERE created_at >= NOW() - INTERVAL '180 days'
        AND status IN ('completed', 'disputed', 'refunded', 'return_pending', 'return_shipped', 'return_delivered')
    )::INT AS trailing_180d_order_count,
    COUNT(*) FILTER (
      WHERE created_at >= NOW() - INTERVAL '180 days'
        AND status = 'disputed'
    )::INT AS trailing_180d_dispute_count,
    MIN(created_at) FILTER (WHERE status = 'completed') AS first_completed_order_at
  FROM orders
  GROUP BY seller_id
)
UPDATE profiles
SET
  completed_order_count = stats.completed_order_count,
  lifetime_gmv_cents = stats.lifetime_gmv_cents,
  buyer_completion_completed_count = stats.buyer_completion_completed_count,
  buyer_completion_eligible_order_count = stats.buyer_completion_eligible_order_count,
  buyer_completion_rate_bps = CASE
    WHEN stats.buyer_completion_eligible_order_count <= 0 THEN 10000
    ELSE LEAST(
      10000,
      GREATEST(
        0,
        ROUND(
          (stats.buyer_completion_completed_count::NUMERIC * 10000)
          / stats.buyer_completion_eligible_order_count::NUMERIC
        )::INT
      )
    )
  END,
  trailing_30d_order_count = stats.trailing_30d_order_count,
  trailing_30d_dispute_count = stats.trailing_30d_dispute_count,
  trailing_90d_order_count = stats.trailing_90d_order_count,
  trailing_90d_dispute_count = stats.trailing_90d_dispute_count,
  trailing_180d_order_count = stats.trailing_180d_order_count,
  trailing_180d_dispute_count = stats.trailing_180d_dispute_count,
  first_completed_order_at = COALESCE(profiles.first_completed_order_at, stats.first_completed_order_at)
FROM seller_order_stats AS stats
WHERE profiles.id = stats.seller_id;

INSERT INTO seller_reserve_accounts (
  seller_id,
  balance_cents,
  minimum_balance_cents,
  reserve_percentage_bps,
  hold_duration_days
)
SELECT
  profiles.id,
  0,
  CASE
    WHEN profiles.seller_tier = 'tier_3' THEN 50000
    ELSE 0
  END,
  CASE
    WHEN profiles.seller_tier = 'tier_2' THEN 500
    WHEN profiles.seller_tier = 'tier_3' THEN 200
    ELSE 1500
  END,
  CASE
    WHEN profiles.seller_tier = 'tier_3' THEN NULL
    ELSE 30
  END
FROM profiles
WHERE profiles.role = 'seller'
ON CONFLICT (seller_id) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY
-- These tables are intended to be mutated by server routes / service role.
-- Sellers and buyers only get scoped read access where it is already safe.
-- ============================================================================
ALTER TABLE seller_reserve_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_reserve_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_tag_scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_chain_of_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their reserve account" ON seller_reserve_accounts;
CREATE POLICY "Sellers can read their reserve account" ON seller_reserve_accounts
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage reserve accounts" ON seller_reserve_accounts;
CREATE POLICY "Admins can manage reserve accounts" ON seller_reserve_accounts
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

DROP POLICY IF EXISTS "Sellers can read their reserve entries" ON seller_reserve_entries;
CREATE POLICY "Sellers can read their reserve entries" ON seller_reserve_entries
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage reserve entries" ON seller_reserve_entries;
CREATE POLICY "Admins can manage reserve entries" ON seller_reserve_entries
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

DROP POLICY IF EXISTS "Assigned sellers can read relay tags" ON relay_tags;
CREATE POLICY "Assigned sellers can read relay tags" ON relay_tags
  FOR SELECT USING (
    auth.uid() = assigned_seller_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage relay tags" ON relay_tags;
CREATE POLICY "Admins can manage relay tags" ON relay_tags
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

DROP POLICY IF EXISTS "Order participants can read relay tag scan events" ON relay_tag_scan_events;
CREATE POLICY "Order participants can read relay tag scan events" ON relay_tag_scan_events
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = relay_tag_scan_events.order_id
        AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage relay tag scan events" ON relay_tag_scan_events;
CREATE POLICY "Admins can manage relay tag scan events" ON relay_tag_scan_events
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

DROP POLICY IF EXISTS "Order participants can read chain of custody" ON order_chain_of_custody;
CREATE POLICY "Order participants can read chain of custody" ON order_chain_of_custody
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_chain_of_custody.order_id
        AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage chain of custody" ON order_chain_of_custody;
CREATE POLICY "Admins can manage chain of custody" ON order_chain_of_custody
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

DROP POLICY IF EXISTS "Order participants can read disputes" ON order_disputes;
CREATE POLICY "Order participants can read disputes" ON order_disputes
  FOR SELECT USING (
    auth.uid() = buyer_id OR
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage disputes" ON order_disputes;
CREATE POLICY "Admins can manage disputes" ON order_disputes
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

DROP POLICY IF EXISTS "Admins can read audit events" ON relay_audit_events;
CREATE POLICY "Admins can read audit events" ON relay_audit_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage audit events" ON relay_audit_events;
CREATE POLICY "Admins can manage audit events" ON relay_audit_events
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
