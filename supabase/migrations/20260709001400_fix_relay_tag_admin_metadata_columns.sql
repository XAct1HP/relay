-- ============================================================================
-- RELAY TAG ADMIN METADATA RECONCILIATION
-- Backfills the admin inventory metadata columns onto `relay_tags` for
-- environments where the foundational tag table was created after the earlier
-- admin-controls migration ran.
-- ============================================================================

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
