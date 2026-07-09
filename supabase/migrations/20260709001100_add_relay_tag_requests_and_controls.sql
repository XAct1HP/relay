-- ============================================================================
-- RELAY TAG REQUESTS + ADMIN INVENTORY CONTROLS
-- Additional workflow support for tag inventory management.
-- ============================================================================

-- `relay_tags` is introduced in the seller trust foundation migration, but some
-- environments may apply this file earlier because our migration files are
-- ordered lexicographically instead of timestamped. Guard the admin metadata
-- changes so fresh installs do not fail before `relay_tags` exists.
ALTER TABLE IF EXISTS relay_tags ADD COLUMN IF NOT EXISTS assigned_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS relay_tags ADD COLUMN IF NOT EXISTS voided_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS relay_tags ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE IF EXISTS relay_tags ADD COLUMN IF NOT EXISTS source_batch_label TEXT;
ALTER TABLE IF EXISTS relay_tags ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

DO $$
BEGIN
  IF to_regclass('public.relay_tags') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_relay_tags_assigned_by_admin_id ON relay_tags(assigned_by_admin_id);
    CREATE INDEX IF NOT EXISTS idx_relay_tags_voided_by_admin_id ON relay_tags(voided_by_admin_id);
    CREATE INDEX IF NOT EXISTS idx_relay_tags_source_batch_label ON relay_tags(source_batch_label);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS seller_tag_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_quantity INT NOT NULL CHECK (requested_quantity > 0),
  seller_tier_snapshot TEXT NOT NULL CHECK (seller_tier_snapshot IN ('tier_1', 'tier_2', 'tier_3')),
  policy_type TEXT NOT NULL CHECK (policy_type IN ('welcome', 'additional_request', 'bundle_250', 'monthly_replenishment')),
  request_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'rejected')),
  admin_notes TEXT,
  reviewed_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_tag_requests_seller_id ON seller_tag_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_tag_requests_status ON seller_tag_requests(status);
CREATE INDEX IF NOT EXISTS idx_seller_tag_requests_seller_tier_snapshot ON seller_tag_requests(seller_tier_snapshot);

ALTER TABLE seller_tag_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their tag requests" ON seller_tag_requests;
CREATE POLICY "Sellers can read their tag requests" ON seller_tag_requests
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sellers can create their tag requests" ON seller_tag_requests;
CREATE POLICY "Sellers can create their tag requests" ON seller_tag_requests
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id
  );

DROP POLICY IF EXISTS "Admins can manage tag requests" ON seller_tag_requests;
CREATE POLICY "Admins can manage tag requests" ON seller_tag_requests
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_seller_tag_requests_updated_at'
  ) THEN
    CREATE TRIGGER update_seller_tag_requests_updated_at
      BEFORE UPDATE ON seller_tag_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
