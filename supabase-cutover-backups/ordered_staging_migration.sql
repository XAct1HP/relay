-- Ordered Relay staging migration generated 07/09/2026 01:10:14


-- ============================================================================
-- FILE: 20260709002200_add_missing_order_columns.sql
-- LAST WRITTEN: 04/20/2026 23:53:42
-- ============================================================================

-- Add missing columns that the code already writes to
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Add return flow columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_label_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_packing_slip_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_created_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_delivered_at TIMESTAMPTZ;

-- Add return_status constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_return_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_return_status_check
  CHECK (return_status IS NULL OR return_status IN ('pending', 'shipped', 'delivered'));

-- Update the status check constraint to include all statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending_payment', 'paid', 'auth_submitted', 'label_created', 'shipped',
  'delivered', 'review_window', 'completed', 'disputed', 'cancelled',
  'refund_pending', 'refunded', 'payout_failed',
  'return_pending', 'return_shipped', 'return_delivered'
));

-- Add dispute flags to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dispute_flags_count INT DEFAULT 0;


-- ============================================================================
-- FILE: 20260709002400_fix_listings_rls_for_orders.sql
-- LAST WRITTEN: 04/22/2026 23:46:43
-- ============================================================================

-- Fix: Allow buyers and sellers to view listing details for their own orders,
-- even when the listing is no longer active (e.g., sold out, inactive).
--
-- Previously, the policy only allowed reading listings that were 'active' or
-- owned by the current user. This meant buyers viewing their order details
-- would see "Unknown Unknown" if the listing status had changed.

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Everyone can read active listings" ON listings;

-- Create updated policy that also allows order participants to view the listing
CREATE POLICY "Everyone can read active listings" ON listings
  FOR SELECT USING (
    status = 'active'
    OR seller_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.listing_id = listings.id
      AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
    )
  );


-- ============================================================================
-- FILE: 20260709003000_add_site_settings.sql
-- LAST WRITTEN: 04/23/2026 12:47:48
-- ============================================================================

-- ============================================================================
-- SITE SETTINGS TABLE
-- Single-row table for platform-wide configuration flags
-- ============================================================================
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the single settings row
INSERT INTO site_settings (onboarding_active) VALUES (true);

-- Allow authenticated users to read settings
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site settings"
  ON site_settings FOR SELECT
  USING (true);

CREATE POLICY "Only admins can update site settings"
  ON site_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


-- ============================================================================
-- FILE: 20260709003100_add_notification_tracking.sql
-- LAST WRITTEN: 05/02/2026 22:56:15
-- ============================================================================

-- ============================================================================
-- NOTIFICATION TRACKING: conversation reads + order seen timestamps
-- ============================================================================

-- Track when each user last read each conversation
CREATE TABLE conversation_reads (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX idx_conversation_reads_user_id ON conversation_reads(user_id);
CREATE INDEX idx_conversation_reads_conversation_id ON conversation_reads(conversation_id);

-- Track when buyer/seller last viewed each order
ALTER TABLE orders
  ADD COLUMN buyer_last_seen_at TIMESTAMPTZ,
  ADD COLUMN seller_last_seen_at TIMESTAMPTZ;

-- Enable realtime on orders table (messages already has it)
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- RLS policies for conversation_reads
ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own conversation_reads"
  ON conversation_reads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own conversation_reads"
  ON conversation_reads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversation_reads"
  ON conversation_reads FOR UPDATE
  USING (auth.uid() = user_id);


-- ============================================================================
-- FILE: 20260709002800_add_seller_messaging_offer_settings.sql
-- LAST WRITTEN: 06/03/2026 14:49:46
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS customer_messaging_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_enabled BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users can insert conversations" ON conversations;
CREATE POLICY "Users can insert conversations" ON conversations
  FOR INSERT WITH CHECK (
    auth.uid() = ANY(participant_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = ANY(participant_ids)
        AND id <> auth.uid()
        AND role IN ('seller', 'admin')
        AND customer_messaging_enabled = false
    )
  );

DROP POLICY IF EXISTS "Users can insert messages to their conversations" ON messages;
CREATE POLICY "Users can insert messages to their conversations" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id AND auth.uid() = ANY(participant_ids)
    )
    AND (
      message_type <> 'custom_offer'
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND (role = 'admin' OR offers_enabled = true)
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert custom offers to their conversations" ON custom_offers;
CREATE POLICY "Users can insert custom offers to their conversations" ON custom_offers
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id AND auth.uid() = ANY(participant_ids)
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR offers_enabled = true)
    )
  );


-- ============================================================================
-- FILE: 20260709001600_add_listing_variants_and_sku_uniqueness.sql
-- LAST WRITTEN: 06/03/2026 18:01:48
-- ============================================================================

ALTER TABLE listings
  ADD COLUMN listing_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (listing_type IN ('manual', 'sku')),
  ADD COLUMN sku TEXT,
  ADD COLUMN sku_normalized TEXT;

CREATE OR REPLACE FUNCTION public.normalize_listing_sku(raw_sku TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF raw_sku IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := regexp_replace(upper(trim(raw_sku)), '[^A-Z0-9]', '', 'g');

  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.prepare_listing_identity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sku_normalized := public.normalize_listing_sku(NEW.sku);

  IF NEW.sku_normalized IS NULL THEN
    NEW.listing_type := 'manual';
  ELSE
    NEW.listing_type := 'sku';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE listings
SET
  sku_normalized = public.normalize_listing_sku(sku),
  listing_type = CASE
    WHEN public.normalize_listing_sku(sku) IS NULL THEN 'manual'
    ELSE 'sku'
  END;

CREATE TRIGGER prepare_listing_identity_before_write
  BEFORE INSERT OR UPDATE OF sku, listing_type ON listings
  FOR EACH ROW EXECUTE FUNCTION public.prepare_listing_identity();

CREATE TABLE listing_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, size)
);

CREATE INDEX idx_listing_variants_listing_id ON listing_variants(listing_id);
CREATE INDEX idx_listing_variants_active ON listing_variants(listing_id, is_active);

CREATE OR REPLACE FUNCTION public.sync_listing_from_variants(target_listing_id UUID)
RETURNS VOID AS $$
DECLARE
  aggregated_sizes JSONB;
  available_variant_count INT;
BEGIN
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'size', size,
          'price', price,
          'quantity', quantity
        )
        ORDER BY size
      ) FILTER (WHERE is_active = true),
      '[]'::jsonb
    ),
    COUNT(*) FILTER (WHERE is_active = true AND quantity > 0)
  INTO aggregated_sizes, available_variant_count
  FROM listing_variants
  WHERE listing_id = target_listing_id;

  UPDATE listings
  SET
    sizes = aggregated_sizes,
    status = CASE
      WHEN status = 'sold_out' AND available_variant_count > 0 THEN 'active'
      WHEN status = 'active' AND available_variant_count <= 0 THEN 'sold_out'
      ELSE status
    END
  WHERE id = target_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.on_listing_variant_changed()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.sync_listing_from_variants(COALESCE(NEW.listing_id, OLD.listing_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_listing_variants_updated_at
  BEFORE UPDATE ON listing_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER listing_variants_sync_after_insert
  AFTER INSERT ON listing_variants
  FOR EACH ROW EXECUTE FUNCTION public.on_listing_variant_changed();

CREATE TRIGGER listing_variants_sync_after_update
  AFTER UPDATE ON listing_variants
  FOR EACH ROW EXECUTE FUNCTION public.on_listing_variant_changed();

CREATE TRIGGER listing_variants_sync_after_delete
  AFTER DELETE ON listing_variants
  FOR EACH ROW EXECUTE FUNCTION public.on_listing_variant_changed();

INSERT INTO listing_variants (listing_id, size, price, quantity, is_active)
SELECT
  l.id,
  NULLIF(trim(size_entry ->> 'size'), '') AS size,
  COALESCE((size_entry ->> 'price')::NUMERIC(10, 2), 0),
  GREATEST(COALESCE((size_entry ->> 'quantity')::INT, 0), 0),
  true
FROM listings l
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.sizes, '[]'::jsonb)) AS size_entry
WHERE NULLIF(trim(size_entry ->> 'size'), '') IS NOT NULL
  AND COALESCE((size_entry ->> 'price')::NUMERIC(10, 2), 0) > 0
ON CONFLICT (listing_id, size) DO UPDATE
SET
  price = EXCLUDED.price,
  quantity = EXCLUDED.quantity,
  is_active = true;

ALTER TABLE custom_offers
  ADD COLUMN listing_variant_id UUID REFERENCES listing_variants(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN listing_variant_id UUID REFERENCES listing_variants(id) ON DELETE SET NULL;

CREATE INDEX idx_custom_offers_listing_variant_id ON custom_offers(listing_variant_id);
CREATE INDEX idx_orders_listing_variant_id ON orders(listing_variant_id);

UPDATE custom_offers co
SET listing_variant_id = lv.id
FROM listing_variants lv
WHERE co.listing_variant_id IS NULL
  AND co.listing_id = lv.listing_id
  AND co.size = lv.size;

UPDATE orders o
SET listing_variant_id = lv.id
FROM listing_variants lv
WHERE o.listing_variant_id IS NULL
  AND o.listing_id = lv.listing_id
  AND o.size = lv.size;

SELECT public.sync_listing_from_variants(id) FROM listings;

CREATE UNIQUE INDEX idx_listings_unique_seller_sku
  ON listings(seller_id, sku_normalized)
  WHERE sku_normalized IS NOT NULL
    AND status <> 'removed';

ALTER TABLE listing_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read listing variants" ON listing_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_variants.listing_id
        AND (
          listings.status = 'active'
          OR listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
          OR EXISTS (
            SELECT 1 FROM orders
            WHERE orders.listing_id = listings.id
              AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
          )
        )
    )
  );

CREATE POLICY "Sellers can insert listing variants" ON listing_variants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_variants.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can update listing variants" ON listing_variants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_variants.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can delete listing variants" ON listing_variants
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_variants.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );


-- ============================================================================
-- FILE: 20260709002300_add_atomic_listing_variant_purchase.sql
-- LAST WRITTEN: 06/03/2026 20:53:05
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_listing_variant_inventory(target_listing_variant_id UUID)
RETURNS TABLE (
  variant_id UUID,
  listing_id UUID,
  quantity INT,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  UPDATE listing_variants
  SET
    quantity = GREATEST(listing_variants.quantity - 1, 0),
    is_active = CASE
      WHEN listing_variants.quantity - 1 <= 0 THEN false
      ELSE listing_variants.is_active
    END
  WHERE listing_variants.id = target_listing_variant_id
    AND listing_variants.is_active = true
    AND listing_variants.quantity > 0
  RETURNING
    listing_variants.id,
    listing_variants.listing_id,
    listing_variants.quantity,
    listing_variants.is_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================================
-- FILE: 20260709003500_add_catalog_products_for_bulk_inventory_import.sql
-- LAST WRITTEN: 06/03/2026 23:10:22
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  sku_normalized TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  nickname TEXT,
  description TEXT,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_products_sku_normalized
  ON catalog_products(sku_normalized);

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS catalog_product_id UUID REFERENCES catalog_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listings_catalog_product_id
  ON listings(catalog_product_id);

CREATE TRIGGER update_catalog_products_updated_at
  BEFORE UPDATE ON catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read catalog products" ON catalog_products
  FOR SELECT USING (true);


-- ============================================================================
-- FILE: 20260709003700_add_inventory_dashboard_indexes.sql
-- LAST WRITTEN: 06/04/2026 00:20:03
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_listings_seller_updated_at
  ON listings(seller_id, updated_at DESC);


-- ============================================================================
-- FILE: 20260709002900_add_vacation_mode_to_seller_preferences.sql
-- LAST WRITTEN: 06/04/2026 10:59:59
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vacation_mode_enabled BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users can insert conversations" ON conversations;
CREATE POLICY "Users can insert conversations" ON conversations
  FOR INSERT WITH CHECK (
    auth.uid() = ANY(participant_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM profiles AS sender_profile
      JOIN profiles AS recipient_profile
        ON recipient_profile.id = ANY(participant_ids)
      WHERE sender_profile.id = auth.uid()
        AND recipient_profile.id <> auth.uid()
        AND sender_profile.role = 'buyer'
        AND recipient_profile.role IN ('seller', 'admin')
        AND (
          recipient_profile.customer_messaging_enabled = false
          OR recipient_profile.vacation_mode_enabled = true
        )
    )
  );

DROP POLICY IF EXISTS "Users can insert messages to their conversations" ON messages;
CREATE POLICY "Users can insert messages to their conversations" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id AND auth.uid() = ANY(participant_ids)
    )
    AND (
      message_type <> 'custom_offer'
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND (role = 'admin' OR offers_enabled = true)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM conversations
      JOIN profiles AS sender_profile ON sender_profile.id = auth.uid()
      JOIN profiles AS recipient_profile
        ON recipient_profile.id = ANY(conversations.participant_ids)
      WHERE conversations.id = conversation_id
        AND recipient_profile.id <> auth.uid()
        AND sender_profile.role = 'buyer'
        AND recipient_profile.role IN ('seller', 'admin')
        AND (
          recipient_profile.customer_messaging_enabled = false
          OR recipient_profile.vacation_mode_enabled = true
        )
    )
  );


-- ============================================================================
-- FILE: 20260709003200_add_seller_api_keys.sql
-- LAST WRITTEN: 06/04/2026 12:32:41
-- ============================================================================

CREATE TABLE seller_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seller_api_keys_seller_id ON seller_api_keys(seller_id);
CREATE INDEX idx_seller_api_keys_seller_id_revoked_at ON seller_api_keys(seller_id, revoked_at);
CREATE INDEX idx_seller_api_keys_key_prefix ON seller_api_keys(key_prefix);

ALTER TABLE seller_api_keys ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- FILE: 20260709003300_add_integration_api_logs.sql
-- LAST WRITTEN: 06/04/2026 22:58:48
-- ============================================================================

CREATE TABLE integration_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES seller_api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT NOT NULL,
  request_id TEXT NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_integration_api_logs_created_at ON integration_api_logs(created_at DESC);
CREATE INDEX idx_integration_api_logs_seller_id_created_at ON integration_api_logs(seller_id, created_at DESC);
CREATE INDEX idx_integration_api_logs_api_key_id_created_at ON integration_api_logs(api_key_id, created_at DESC);
CREATE INDEX idx_integration_api_logs_request_id ON integration_api_logs(request_id);

ALTER TABLE integration_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read integration api logs" ON integration_api_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ============================================================================
-- FILE: 20260709003400_add_sneakers_table_for_sku_lookup.sql
-- LAST WRITTEN: 06/07/2026 00:44:11
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sneakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  normalized_sku TEXT NOT NULL,
  brand TEXT,
  name TEXT NOT NULL,
  model TEXT,
  nickname TEXT,
  colorway TEXT,
  gender TEXT,
  release_date DATE,
  retail_price NUMERIC,
  image_url TEXT,
  source TEXT DEFAULT 'kicksdb',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sneakers_sku
  ON public.sneakers(sku);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sneakers_normalized_sku
  ON public.sneakers(normalized_sku);

CREATE INDEX IF NOT EXISTS idx_sneakers_name
  ON public.sneakers(name);

ALTER TABLE public.sneakers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sneakers'
      AND policyname = 'Everyone can read sneakers'
  ) THEN
    CREATE POLICY "Everyone can read sneakers" ON public.sneakers
      FOR SELECT USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_sneakers_updated_at'
      AND tgrelid = 'public.sneakers'::regclass
  ) THEN
    CREATE TRIGGER update_sneakers_updated_at
      BEFORE UPDATE ON public.sneakers
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS sneaker_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_sneaker_id_fkey'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_sneaker_id_fkey
      FOREIGN KEY (sneaker_id)
      REFERENCES public.sneakers(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_listings_sneaker_id
  ON public.listings(sneaker_id);


-- ============================================================================
-- FILE: 20260709003600_add_sneaker_description_and_gallery_images.sql
-- LAST WRITTEN: 06/07/2026 02:00:39
-- ============================================================================

ALTER TABLE public.sneakers
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS gallery_images TEXT[] DEFAULT '{}'::TEXT[];


-- ============================================================================
-- FILE: 20260709001700_add_listing_variant_conditions_for_mixed_inventory.sql
-- LAST WRITTEN: 06/07/2026 12:43:14
-- ============================================================================

ALTER TABLE public.listing_variants
  ADD COLUMN IF NOT EXISTS condition TEXT;

UPDATE public.listing_variants AS lv
SET condition = CASE
  WHEN l.condition = 'new' THEN 'new'
  ELSE 'used'
END
FROM public.listings AS l
WHERE l.id = lv.listing_id
  AND (lv.condition IS NULL OR lv.condition NOT IN ('new', 'used'));

ALTER TABLE public.listing_variants
  ALTER COLUMN condition SET DEFAULT 'new';

ALTER TABLE public.listing_variants
  ALTER COLUMN condition SET NOT NULL;

ALTER TABLE public.listing_variants
  DROP CONSTRAINT IF EXISTS listing_variants_listing_id_size_key;

ALTER TABLE public.listing_variants
  DROP CONSTRAINT IF EXISTS listing_variants_condition_check;

ALTER TABLE public.listing_variants
  ADD CONSTRAINT listing_variants_condition_check
  CHECK (condition IN ('new', 'used'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_variants_listing_size_condition_unique
  ON public.listing_variants(listing_id, size, condition);

CREATE OR REPLACE FUNCTION public.sync_listing_from_variants(target_listing_id UUID)
RETURNS VOID AS $$
DECLARE
  aggregated_sizes JSONB;
  available_variant_count INT;
BEGIN
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'size', size,
          'price', price,
          'quantity', quantity,
          'condition', condition
        )
        ORDER BY size, condition
      ) FILTER (WHERE is_active = true),
      '[]'::jsonb
    ),
    COUNT(*) FILTER (WHERE is_active = true AND quantity > 0)
  INTO aggregated_sizes, available_variant_count
  FROM public.listing_variants
  WHERE listing_id = target_listing_id;

  UPDATE public.listings
  SET
    sizes = aggregated_sizes,
    status = CASE
      WHEN status = 'sold_out' AND available_variant_count > 0 THEN 'active'
      WHEN status = 'active' AND available_variant_count <= 0 THEN 'sold_out'
      ELSE status
    END
  WHERE id = target_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT public.sync_listing_from_variants(id) FROM public.listings;


-- ============================================================================
-- FILE: 20260709001800_allow_mixed_listing_condition.sql
-- LAST WRITTEN: 06/07/2026 13:01:31
-- ============================================================================

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_condition_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_condition_check
  CHECK (condition IN ('new', 'like_new', 'used_excellent', 'used_good', 'used_fair', 'mixed'));


-- ============================================================================
-- FILE: 20260709001900_add_itemized_used_inventory.sql
-- LAST WRITTEN: 06/08/2026 17:45:37
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.listing_used_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  size TEXT NOT NULL CHECK (btrim(size) <> ''),
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity = 1),
  condition TEXT NOT NULL DEFAULT 'used_good'
    CHECK (condition IN ('like_new', 'used_excellent', 'used_good', 'used_fair')),
  condition_photo_url TEXT NOT NULL CHECK (btrim(condition_photo_url) <> ''),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_used_items_listing_photo_unique
  ON public.listing_used_items(listing_id, condition_photo_url);

CREATE INDEX IF NOT EXISTS idx_listing_used_items_listing_id
  ON public.listing_used_items(listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_used_items_active
  ON public.listing_used_items(listing_id, is_active);

CREATE TRIGGER update_listing_used_items_updated_at
  BEFORE UPDATE ON public.listing_used_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.custom_offers
  ADD COLUMN IF NOT EXISTS listing_used_item_id UUID REFERENCES public.listing_used_items(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS listing_used_item_id UUID REFERENCES public.listing_used_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custom_offers_listing_used_item_id
  ON public.custom_offers(listing_used_item_id);

CREATE INDEX IF NOT EXISTS idx_orders_listing_used_item_id
  ON public.orders(listing_used_item_id);

ALTER TABLE public.custom_offers
  DROP CONSTRAINT IF EXISTS custom_offers_single_inventory_target_check;

ALTER TABLE public.custom_offers
  ADD CONSTRAINT custom_offers_single_inventory_target_check
  CHECK (num_nonnulls(listing_variant_id, listing_used_item_id) <= 1);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_single_inventory_target_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_single_inventory_target_check
  CHECK (num_nonnulls(listing_variant_id, listing_used_item_id) <= 1);

ALTER TABLE public.listing_used_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read listing used items" ON public.listing_used_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE public.listings.id = public.listing_used_items.listing_id
        AND (
          public.listings.status = 'active'
          OR public.listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
          )
          OR EXISTS (
            SELECT 1
            FROM public.orders
            WHERE public.orders.listing_id = public.listing_used_items.listing_id
              AND (
                public.orders.buyer_id = auth.uid()
                OR public.orders.seller_id = auth.uid()
              )
          )
        )
    )
  );

CREATE POLICY "Sellers can insert listing used items" ON public.listing_used_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE public.listings.id = public.listing_used_items.listing_id
        AND (
          public.listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can update listing used items" ON public.listing_used_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE public.listings.id = public.listing_used_items.listing_id
        AND (
          public.listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can delete listing used items" ON public.listing_used_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE public.listings.id = public.listing_used_items.listing_id
        AND (
          public.listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
          )
        )
    )
  );


-- ============================================================================
-- FILE: 20260709002100_add_purchased_condition_photo_to_orders.sql
-- LAST WRITTEN: 06/09/2026 16:45:18
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS purchased_condition_photo_url TEXT;


-- ============================================================================
-- FILE: 20260709002000_add_legacy_used_inventory_compatibility.sql
-- LAST WRITTEN: 06/09/2026 17:40:01
-- ============================================================================

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS inventory_review_status TEXT
    CHECK (inventory_review_status IN ('legacy_used_photo_review_required'));

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS inventory_review_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_inventory_review_status
  ON public.listings(inventory_review_status)
  WHERE inventory_review_status IS NOT NULL;

WITH normalized_legacy_used AS (
  SELECT
    l.id AS listing_id,
    l.condition AS listing_condition,
    COALESCE(
      (
        SELECT array_agg(image_url)
        FROM unnest(COALESCE(l.images, ARRAY[]::TEXT[])) AS image_url
        WHERE btrim(image_url) <> ''
      ),
      ARRAY[]::TEXT[]
    ) AS cleaned_images,
    lv.id AS variant_id,
    lv.size,
    lv.price,
    lv.quantity,
    COUNT(*) OVER (PARTITION BY l.id) AS active_used_variant_rows,
    SUM(lv.quantity) OVER (PARTITION BY l.id) AS active_used_unit_count,
    COALESCE((
      SELECT COUNT(*)
      FROM public.listing_variants AS new_lv
      WHERE new_lv.listing_id = l.id
        AND new_lv.condition = 'new'
        AND new_lv.is_active = true
        AND new_lv.quantity > 0
    ), 0) AS active_new_variant_count,
    COALESCE((
      SELECT COUNT(*)
      FROM public.listing_used_items AS lui
      WHERE lui.listing_id = l.id
        AND lui.is_active = true
        AND lui.quantity > 0
    ), 0) AS active_used_item_count
  FROM public.listings AS l
  INNER JOIN public.listing_variants AS lv
    ON lv.listing_id = l.id
  WHERE l.status <> 'removed'
    AND lv.condition = 'used'
    AND lv.is_active = true
    AND lv.quantity > 0
),
safe_single_pair_candidates AS (
  SELECT *
  FROM normalized_legacy_used
  WHERE active_used_item_count = 0
    AND active_used_variant_rows = 1
    AND active_used_unit_count = 1
    AND COALESCE(array_length(cleaned_images, 1), 0) = 1
),
safe_used_item_backfill AS (
  INSERT INTO public.listing_used_items (
    listing_id,
    size,
    price,
    quantity,
    condition,
    condition_photo_url,
    is_active
  )
  SELECT
    listing_id,
    size,
    price,
    1,
    CASE
      WHEN listing_condition = 'like_new' THEN 'like_new'
      WHEN listing_condition = 'used_excellent' THEN 'used_excellent'
      WHEN listing_condition = 'used_fair' THEN 'used_fair'
      ELSE 'used_good'
    END,
    cleaned_images[1],
    true
  FROM safe_single_pair_candidates
  ON CONFLICT (listing_id, condition_photo_url) DO NOTHING
  RETURNING listing_id
),
review_required_listings AS (
  SELECT DISTINCT
    listing_id,
    active_new_variant_count,
    active_used_unit_count,
    active_used_item_count,
    COALESCE(array_length(cleaned_images, 1), 0) AS image_count
  FROM normalized_legacy_used
  WHERE NOT (
      active_used_variant_rows = 1
      AND active_used_item_count = 0
      AND active_used_unit_count = 1
      AND COALESCE(array_length(cleaned_images, 1), 0) = 1
    )
),
deactivate_legacy_used_variants AS (
  UPDATE public.listing_variants AS lv
  SET is_active = false
  WHERE lv.id IN (
    SELECT variant_id FROM safe_single_pair_candidates
    UNION
    SELECT legacy.variant_id
    FROM normalized_legacy_used AS legacy
    INNER JOIN review_required_listings AS review
      ON review.listing_id = legacy.listing_id
  )
  RETURNING lv.listing_id
)
UPDATE public.listings AS l
SET
  inventory_review_status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM review_required_listings AS review
      WHERE review.listing_id = l.id
    )
      THEN 'legacy_used_photo_review_required'
    ELSE NULL
  END,
  inventory_review_notes = CASE
    WHEN EXISTS (
      SELECT 1
      FROM review_required_listings AS review
      WHERE review.listing_id = l.id
    )
      THEN CASE
        WHEN EXISTS (
          SELECT 1
          FROM review_required_listings AS review
          WHERE review.listing_id = l.id
            AND review.active_used_unit_count > 1
        )
          THEN 'Legacy used inventory had multiple units without item-level condition photos. Checkout was disabled until the seller assigns one photo per used pair.'
        WHEN EXISTS (
          SELECT 1
          FROM review_required_listings AS review
          WHERE review.listing_id = l.id
            AND review.image_count = 0
        )
          THEN 'Legacy used inventory was missing a listing-level condition photo. Checkout was disabled until the seller uploads one photo per used pair.'
        ELSE 'Legacy used inventory could not be safely mapped to item-level condition photos. Checkout was disabled until the seller reviews the listing and assigns one photo per used pair.'
      END
    ELSE NULL
  END,
  status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM review_required_listings AS review
      WHERE review.listing_id = l.id
        AND review.active_new_variant_count = 0
        AND review.active_used_item_count = 0
    )
      THEN 'inactive'
    ELSE l.status
  END,
  condition = CASE
    WHEN EXISTS (
      SELECT 1
      FROM review_required_listings AS review
      WHERE review.listing_id = l.id
        AND review.active_new_variant_count > 0
        AND review.active_used_item_count = 0
    )
      THEN 'new'
    ELSE l.condition
  END
WHERE EXISTS (
  SELECT 1
  FROM safe_single_pair_candidates AS safe
  WHERE safe.listing_id = l.id
) OR EXISTS (
  SELECT 1
  FROM review_required_listings AS review
  WHERE review.listing_id = l.id
);


-- ============================================================================
-- FILE: 20260709000600_add_seller_trust_and_chain_of_custody_foundation.sql
-- LAST WRITTEN: 06/11/2026 11:31:38
-- ============================================================================

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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


-- ============================================================================
-- FILE: 20260709000800_add_seller_trust_admin_controls.sql
-- LAST WRITTEN: 06/11/2026 12:10:14
-- ============================================================================

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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


-- ============================================================================
-- FILE: 20260709000900_add_order_auth_risk_controls.sql
-- LAST WRITTEN: 06/11/2026 12:50:33
-- ============================================================================

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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


-- ============================================================================
-- FILE: 20260709000200_add_tiered_payout_and_reserve_controls.sql
-- LAST WRITTEN: 06/11/2026 17:05:15
-- ============================================================================

-- ============================================================================
-- TIERED PAYOUT + RESERVE CONTROLS
-- ============================================================================
-- Adds centralized payout state, payout ledger rows, reserve freeze metadata,
-- and order-level payout policy snapshots so tier-based payout timing can be
-- enforced without duplicating Stripe transfer logic in multiple routes.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_tier_snapshot TEXT CHECK (seller_tier_snapshot IN ('tier_1', 'tier_2', 'tier_3')),
  ADD COLUMN IF NOT EXISTS payout_schedule TEXT CHECK (payout_schedule IN (
    'buyer_confirmation_or_review_expiry',
    'delivery',
    'carrier_acceptance_and_delivery_split'
  )),
  ADD COLUMN IF NOT EXISTS reserve_percentage_bps_snapshot INT CHECK (
    reserve_percentage_bps_snapshot IS NULL OR (
      reserve_percentage_bps_snapshot >= 0 AND reserve_percentage_bps_snapshot <= 10000
    )
  ),
  ADD COLUMN IF NOT EXISTS reserve_hold_duration_days_snapshot INT CHECK (
    reserve_hold_duration_days_snapshot IS NULL OR reserve_hold_duration_days_snapshot >= 0
  ),
  ADD COLUMN IF NOT EXISTS minimum_reserve_balance_cents_snapshot BIGINT CHECK (
    minimum_reserve_balance_cents_snapshot IS NULL OR minimum_reserve_balance_cents_snapshot >= 0
  ),
  ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'pending' CHECK (payout_status IN (
    'pending', 'partially_paid', 'paid', 'frozen', 'refunded', 'failed'
  )),
  ADD COLUMN IF NOT EXISTS payout_frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_frozen_reason TEXT,
  ADD COLUMN IF NOT EXISTS payout_last_trigger TEXT,
  ADD COLUMN IF NOT EXISTS payout_last_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_last_error TEXT,
  ADD COLUMN IF NOT EXISTS seller_amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_amount_paid_cents >= 0),
  ADD COLUMN IF NOT EXISTS seller_amount_held_in_reserve_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_amount_held_in_reserve_cents >= 0),
  ADD COLUMN IF NOT EXISTS seller_amount_frozen_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_amount_frozen_cents >= 0),
  ADD COLUMN IF NOT EXISTS seller_amount_refunded_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_amount_refunded_cents >= 0);

CREATE TABLE IF NOT EXISTS public.order_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payout_step TEXT NOT NULL CHECK (payout_step IN (
    'final_release',
    'delivery_release',
    'carrier_acceptance_release',
    'delivery_balance_release',
    'manual_override_release'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'paid', 'frozen', 'failed', 'cancelled'
  )),
  gross_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (gross_amount_cents >= 0),
  reserve_withheld_cents BIGINT NOT NULL DEFAULT 0 CHECK (reserve_withheld_cents >= 0),
  minimum_balance_top_up_cents BIGINT NOT NULL DEFAULT 0 CHECK (minimum_balance_top_up_cents >= 0),
  net_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (net_paid_cents >= 0),
  reserve_release_eligible_at TIMESTAMPTZ,
  stripe_transfer_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  trigger_source TEXT,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  frozen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT order_payouts_order_step_unique UNIQUE (order_id, payout_step)
);

CREATE INDEX IF NOT EXISTS idx_order_payouts_order_id ON public.order_payouts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payouts_seller_id ON public.order_payouts(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_payouts_status ON public.order_payouts(status);
CREATE INDEX IF NOT EXISTS idx_order_payouts_paid_at ON public.order_payouts(paid_at);

ALTER TABLE public.seller_reserve_entries
  ADD COLUMN IF NOT EXISTS order_payout_id UUID REFERENCES public.order_payouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_seller_reserve_entries_order_payout_id ON public.seller_reserve_entries(order_payout_id);
CREATE INDEX IF NOT EXISTS idx_seller_reserve_entries_is_frozen ON public.seller_reserve_entries(is_frozen);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_order_payouts_updated_at'
  ) THEN
    CREATE TRIGGER update_order_payouts_updated_at
      BEFORE UPDATE ON public.order_payouts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Snapshot existing orders so payout processing can safely reason about legacy
-- rows without requiring order recreation.
UPDATE public.orders AS o
SET
  seller_tier_snapshot = COALESCE(
    o.seller_tier_snapshot,
    CASE
      WHEN p.seller_tier IN ('tier_1', 'tier_2', 'tier_3') THEN p.seller_tier
      ELSE 'tier_1'
    END
  ),
  payout_schedule = COALESCE(
    o.payout_schedule,
    CASE
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_3' THEN 'carrier_acceptance_and_delivery_split'
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_2' THEN 'delivery'
      ELSE 'buyer_confirmation_or_review_expiry'
    END
  ),
  reserve_percentage_bps_snapshot = COALESCE(
    o.reserve_percentage_bps_snapshot,
    CASE
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_3' THEN 200
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_2' THEN 500
      ELSE 1500
    END
  ),
  reserve_hold_duration_days_snapshot = COALESCE(
    o.reserve_hold_duration_days_snapshot,
    CASE
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_3' THEN NULL
      ELSE 30
    END
  ),
  minimum_reserve_balance_cents_snapshot = COALESCE(
    o.minimum_reserve_balance_cents_snapshot,
    CASE
      WHEN COALESCE(p.seller_tier, 'tier_1') = 'tier_3' THEN 50000
      ELSE 0
    END
  ),
  payout_status = CASE
    WHEN o.status = 'refunded' THEN 'refunded'
    WHEN o.status = 'disputed' OR COALESCE(o.seller_funds_frozen, false) THEN 'frozen'
    WHEN o.stripe_transfer_id IS NOT NULL THEN 'paid'
    ELSE o.payout_status
  END,
  seller_amount_paid_cents = CASE
    WHEN o.stripe_transfer_id IS NOT NULL AND COALESCE(o.seller_amount_paid_cents, 0) = 0
      THEN GREATEST(0, ROUND(COALESCE(o.seller_earnings, 0) * 100))
    ELSE o.seller_amount_paid_cents
  END
FROM public.profiles AS p
WHERE o.seller_id = p.id;

ALTER TABLE public.order_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their order payouts" ON public.order_payouts;
CREATE POLICY "Sellers can read their order payouts" ON public.order_payouts
  FOR SELECT
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Buyers can read their order payouts" ON public.order_payouts;
CREATE POLICY "Buyers can read their order payouts" ON public.order_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_payouts.order_id
        AND o.buyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage order payouts" ON public.order_payouts;
CREATE POLICY "Admins can manage order payouts" ON public.order_payouts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );


-- ============================================================================
-- FILE: 20260709000700_add_seller_trust_security_hardening.sql
-- LAST WRITTEN: 06/11/2026 18:15:12
-- ============================================================================

-- Security hardening support for dispute-window exceptions.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispute_admin_exception_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_admin_exception_reason TEXT;


-- ============================================================================
-- FILE: 20260709001100_add_relay_tag_requests_and_controls.sql
-- LAST WRITTEN: 06/12/2026 19:22:26
-- ============================================================================

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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


-- ============================================================================
-- FILE: 20260709001400_fix_relay_tag_admin_metadata_columns.sql
-- LAST WRITTEN: 06/12/2026 19:22:26
-- ============================================================================

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


-- ============================================================================
-- FILE: 20260709002500_add_order_checkout_session_recovery.sql
-- LAST WRITTEN: 06/12/2026 20:52:14
-- ============================================================================

-- ============================================================================
-- STRIPE CHECKOUT SESSION RECOVERY
-- Tracks the Stripe checkout session on shoe orders so we can safely finalize
-- orders from either the webhook or the post-checkout success page without
-- creating duplicates.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_stripe_checkout_session_id
  ON public.orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_checkout_session_id
  ON public.orders(stripe_checkout_session_id);


-- ============================================================================
-- FILE: 20260709002600_add_buyer_challenge_code_to_orders.sql
-- LAST WRITTEN: 06/14/2026 18:24:32
-- ============================================================================

-- Add a separate challenge code for buyer delivery verification.
-- This is generated when delivery is confirmed (mark-delivered or background job)
-- and is distinct from the seller's challenge_code used during post-sale auth.

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS buyer_challenge_code text;

COMMENT ON COLUMN orders.buyer_challenge_code IS 'Challenge code for buyer mobile verification flow, generated at delivery confirmation';


-- ============================================================================
-- FILE: 20260709000000_add_relay_balance_foundation.sql
-- LAST WRITTEN: 06/15/2026 22:51:42
-- ============================================================================

-- ============================================================================
-- RELAY BALANCE + EXPOSURE TRACKING FOUNDATION
-- ============================================================================
-- Additive schema only: keep the existing order, auth, tag, dispute, reserve,
-- and payout systems intact while introducing a Relay-managed seller balance
-- ledger and withdrawal/exposure primitives.

-- ============================================================================
-- ORDER-LEVEL CENT SNAPSHOTS FOR BALANCE CREDITING
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_proceeds_cents BIGINT,
  ADD COLUMN IF NOT EXISTS relay_fee_cents BIGINT,
  ADD COLUMN IF NOT EXISTS stripe_fee_estimate_cents BIGINT,
  ADD COLUMN IF NOT EXISTS balance_credit_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS review_window_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS funds_available_at TIMESTAMPTZ;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_balance_credit_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_balance_credit_status_check
    CHECK (balance_credit_status IN (
      'not_started',
      'pending',
      'available',
      'failed',
      'reversed'
    ));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_seller_proceeds_cents_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_seller_proceeds_cents_check
    CHECK (seller_proceeds_cents IS NULL OR seller_proceeds_cents >= 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_relay_fee_cents_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_relay_fee_cents_check
    CHECK (relay_fee_cents IS NULL OR relay_fee_cents >= 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_stripe_fee_estimate_cents_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_stripe_fee_estimate_cents_check
    CHECK (stripe_fee_estimate_cents IS NULL OR stripe_fee_estimate_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_orders_balance_credit_status
  ON public.orders(balance_credit_status);
CREATE INDEX IF NOT EXISTS idx_orders_funds_available_at
  ON public.orders(funds_available_at);
CREATE INDEX IF NOT EXISTS idx_orders_review_window_ends_at
  ON public.orders(review_window_ends_at);

UPDATE public.orders
SET
  seller_proceeds_cents = COALESCE(
    seller_proceeds_cents,
    ROUND(COALESCE(seller_earnings, 0) * 100)
  ),
  relay_fee_cents = COALESCE(
    relay_fee_cents,
    ROUND(COALESCE(platform_fee, 0) * 100)
  ),
  stripe_fee_estimate_cents = COALESCE(
    stripe_fee_estimate_cents,
    ROUND(COALESCE(stripe_fee, 0) * 100)
  ),
  review_window_ends_at = COALESCE(review_window_ends_at, review_deadline),
  funds_available_at = COALESCE(funds_available_at, review_deadline)
WHERE
  seller_proceeds_cents IS NULL
  OR relay_fee_cents IS NULL
  OR stripe_fee_estimate_cents IS NULL
  OR review_window_ends_at IS NULL
  OR funds_available_at IS NULL;

-- ============================================================================
-- RELAY BALANCE CACHE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.relay_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_balance_cents BIGINT NOT NULL DEFAULT 0,
  available_balance_cents BIGINT NOT NULL DEFAULT 0,
  pending_balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (pending_balance_cents >= 0),
  exposure_cents BIGINT NOT NULL DEFAULT 0 CHECK (exposure_cents >= 0),
  withdrawable_balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (withdrawable_balance_cents >= 0),
  CONSTRAINT relay_balances_total_consistency_check
    CHECK (total_balance_cents = available_balance_cents + pending_balance_cents),
  CONSTRAINT relay_balances_withdrawable_consistency_check
    CHECK (
      withdrawable_balance_cents <= CASE
        WHEN available_balance_cents > 0 THEN available_balance_cents
        ELSE 0
      END
    ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_balances_seller_id
  ON public.relay_balances(seller_id);

-- ============================================================================
-- APPEND-ONLY RELAY BALANCE LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.relay_balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'order_pending_credit',
    'order_available_credit',
    'withdrawal_requested',
    'withdrawal_completed',
    'withdrawal_failed',
    'exposure_hold_created',
    'exposure_hold_released',
    'dispute_freeze',
    'dispute_debit',
    'admin_adjustment'
  )),
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = lower(currency)),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN (
    'pending',
    'posted',
    'completed',
    'failed',
    'canceled'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT relay_balance_ledger_order_required_check CHECK (
    CASE
      WHEN type IN (
        'order_pending_credit',
        'order_available_credit',
        'exposure_hold_created',
        'exposure_hold_released',
        'dispute_freeze',
        'dispute_debit'
      ) THEN order_id IS NOT NULL
      ELSE TRUE
    END
  ),
  CONSTRAINT relay_balance_ledger_amount_direction_check CHECK (
    CASE
      WHEN type IN (
        'order_pending_credit',
        'order_available_credit',
        'withdrawal_completed',
        'withdrawal_failed',
        'exposure_hold_created',
        'exposure_hold_released',
        'dispute_freeze'
      ) THEN amount_cents > 0
      WHEN type IN (
        'withdrawal_requested',
        'dispute_debit'
      ) THEN amount_cents < 0
      ELSE amount_cents <> 0
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_seller_id
  ON public.relay_balance_ledger(seller_id);
CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_order_id
  ON public.relay_balance_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_type
  ON public.relay_balance_ledger(type);
CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_status
  ON public.relay_balance_ledger(status);
CREATE INDEX IF NOT EXISTS idx_relay_balance_ledger_created_at
  ON public.relay_balance_ledger(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_balance_ledger_order_pending_credit_unique
  ON public.relay_balance_ledger(order_id, type)
  WHERE order_id IS NOT NULL
    AND type = 'order_pending_credit'
    AND status IN ('pending', 'posted', 'completed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_balance_ledger_order_available_credit_unique
  ON public.relay_balance_ledger(order_id, type)
  WHERE order_id IS NOT NULL
    AND type = 'order_available_credit'
    AND status IN ('pending', 'posted', 'completed');

-- ============================================================================
-- EXPOSURE HOLDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exposure_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'released',
    'consumed',
    'disputed'
  )),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exposure_holds_seller_id
  ON public.exposure_holds(seller_id);
CREATE INDEX IF NOT EXISTS idx_exposure_holds_order_id
  ON public.exposure_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_exposure_holds_status
  ON public.exposure_holds(status);
CREATE INDEX IF NOT EXISTS idx_exposure_holds_created_at
  ON public.exposure_holds(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exposure_holds_open_order_unique
  ON public.exposure_holds(order_id)
  WHERE status IN ('active', 'disputed');

-- ============================================================================
-- WITHDRAWAL REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  stripe_transfer_id TEXT,
  stripe_transfer_fee_cents BIGINT NOT NULL DEFAULT 25 CHECK (stripe_transfer_fee_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'canceled'
  )),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT withdrawal_requests_completed_at_check CHECK (
    CASE
      WHEN status = 'completed' THEN completed_at IS NOT NULL
      ELSE TRUE
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_seller_id
  ON public.withdrawal_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status
  ON public.withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at
  ON public.withdrawal_requests(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_requests_stripe_transfer_id_unique
  ON public.withdrawal_requests(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

-- ============================================================================
-- BALANCE RECALCULATION HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_relay_balance(target_seller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_pending BIGINT := 0;
  calculated_available BIGINT := 0;
  calculated_exposure BIGINT := 0;
BEGIN
  IF target_seller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'order_pending_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN -amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_requested'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_failed'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'dispute_debit'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'admin_adjustment'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0)
  INTO calculated_pending, calculated_available
  FROM public.relay_balance_ledger
  WHERE seller_id = target_seller_id;

  SELECT COALESCE(SUM(amount_cents), 0)
  INTO calculated_exposure
  FROM public.exposure_holds
  WHERE seller_id = target_seller_id
    AND status IN ('active', 'disputed');

  INSERT INTO public.relay_balances (
    seller_id,
    total_balance_cents,
    available_balance_cents,
    pending_balance_cents,
    exposure_cents,
    withdrawable_balance_cents,
    updated_at
  )
  VALUES (
    target_seller_id,
    GREATEST(calculated_pending, 0) + calculated_available,
    calculated_available,
    GREATEST(calculated_pending, 0),
    GREATEST(calculated_exposure, 0),
    GREATEST(calculated_available - calculated_exposure, 0),
    NOW()
  )
  ON CONFLICT (seller_id) DO UPDATE
  SET
    total_balance_cents = EXCLUDED.total_balance_cents,
    available_balance_cents = EXCLUDED.available_balance_cents,
    pending_balance_cents = EXCLUDED.pending_balance_cents,
    exposure_cents = EXCLUDED.exposure_cents,
    withdrawable_balance_cents = EXCLUDED.withdrawable_balance_cents,
    updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_relay_balance_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalculate_relay_balance(NEW.seller_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_relay_balance_from_exposure_holds()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalculate_relay_balance(COALESCE(NEW.seller_id, OLD.seller_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_relay_balance_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'relay_balance_ledger is append-only; % is not allowed', TG_OP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_relay_balances_updated_at'
  ) THEN
    CREATE TRIGGER update_relay_balances_updated_at
      BEFORE UPDATE ON public.relay_balances
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sync_relay_balance_after_ledger_insert'
  ) THEN
    CREATE TRIGGER sync_relay_balance_after_ledger_insert
      AFTER INSERT ON public.relay_balance_ledger
      FOR EACH ROW EXECUTE FUNCTION public.sync_relay_balance_from_ledger();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_relay_balance_ledger_update'
  ) THEN
    CREATE TRIGGER prevent_relay_balance_ledger_update
      BEFORE UPDATE ON public.relay_balance_ledger
      FOR EACH ROW EXECUTE FUNCTION public.prevent_relay_balance_ledger_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_relay_balance_ledger_delete'
  ) THEN
    CREATE TRIGGER prevent_relay_balance_ledger_delete
      BEFORE DELETE ON public.relay_balance_ledger
      FOR EACH ROW EXECUTE FUNCTION public.prevent_relay_balance_ledger_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sync_relay_balance_after_exposure_hold_write'
  ) THEN
    CREATE TRIGGER sync_relay_balance_after_exposure_hold_write
      AFTER INSERT OR UPDATE OR DELETE ON public.exposure_holds
      FOR EACH ROW EXECUTE FUNCTION public.sync_relay_balance_from_exposure_holds();
  END IF;
END $$;

-- ============================================================================
-- BACKFILL CURRENT SELLERS INTO RELAY BALANCE CACHE
-- ============================================================================
INSERT INTO public.relay_balances (
  seller_id,
  total_balance_cents,
  available_balance_cents,
  pending_balance_cents,
  exposure_cents,
  withdrawable_balance_cents,
  updated_at
)
SELECT
  p.id,
  0,
  0,
  0,
  0,
  0,
  NOW()
FROM public.profiles AS p
WHERE p.role = 'seller'
ON CONFLICT (seller_id) DO NOTHING;

-- Recalculate after seeding so any future preloaded ledger / exposure rows are
-- reflected if this migration is replayed in a derived environment.
DO $$
DECLARE
  seller_row RECORD;
BEGIN
  FOR seller_row IN
    SELECT id
    FROM public.profiles
    WHERE role = 'seller'
  LOOP
    PERFORM public.recalculate_relay_balance(seller_row.id);
  END LOOP;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- These tables are intended to be mutated by server routes / service role.
-- Sellers get scoped read access to their own balance data; admins can manage.
-- ============================================================================
ALTER TABLE public.relay_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exposure_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their relay balances" ON public.relay_balances;
CREATE POLICY "Sellers can read their relay balances" ON public.relay_balances
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage relay balances" ON public.relay_balances;
CREATE POLICY "Admins can manage relay balances" ON public.relay_balances
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

DROP POLICY IF EXISTS "Sellers can read their relay balance ledger" ON public.relay_balance_ledger;
CREATE POLICY "Sellers can read their relay balance ledger" ON public.relay_balance_ledger
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage relay balance ledger" ON public.relay_balance_ledger;
CREATE POLICY "Admins can manage relay balance ledger" ON public.relay_balance_ledger
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

DROP POLICY IF EXISTS "Sellers can read their exposure holds" ON public.exposure_holds;
CREATE POLICY "Sellers can read their exposure holds" ON public.exposure_holds
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage exposure holds" ON public.exposure_holds;
CREATE POLICY "Admins can manage exposure holds" ON public.exposure_holds
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

DROP POLICY IF EXISTS "Sellers can read their withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Sellers can read their withdrawal requests" ON public.withdrawal_requests
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Admins can manage withdrawal requests" ON public.withdrawal_requests
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


-- ============================================================================
-- FILE: 20260709003900_update_relay_balance_ledger_idempotency_indexes.sql
-- LAST WRITTEN: 06/15/2026 22:51:48
-- ============================================================================

-- ============================================================================
-- RELAY BALANCE LEDGER IDEMPOTENCY INDEX UPDATE
-- ============================================================================
-- Follow-up migration for environments that already applied
-- add_relay_balance_foundation.sql. This replaces the single available-credit
-- per-order uniqueness rule with metadata-based idempotency so staged releases
-- (for example Tier 3 carrier acceptance + delivery) can coexist safely.

DROP INDEX IF EXISTS public.idx_relay_balance_ledger_order_available_credit_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_balance_ledger_idempotency_key_unique
  ON public.relay_balance_ledger(type, ((metadata->>'idempotency_key')))
  WHERE metadata ? 'idempotency_key';


-- ============================================================================
-- FILE: 20260709000300_add_withdrawal_request_review_controls.sql
-- LAST WRITTEN: 06/15/2026 23:04:16
-- ============================================================================

-- ============================================================================
-- WITHDRAWAL REQUEST REVIEW + IDEMPOTENCY CONTROLS
-- ============================================================================
-- Adds explicit review/cancel tracking and a first-class idempotency key for
-- Relay Balance withdrawal requests.

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_requests_idempotency_key_unique
  ON public.withdrawal_requests(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_review_required
  ON public.withdrawal_requests(review_required);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_reviewed_by_admin_id
  ON public.withdrawal_requests(reviewed_by_admin_id);

ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_review_required_status_check;

ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_review_required_status_check CHECK (
    CASE
      WHEN review_required THEN status IN ('pending', 'processing', 'completed', 'failed', 'canceled')
      ELSE TRUE
    END
  );


-- ============================================================================
-- FILE: 20260709000500_add_seller_identity_profiles.sql
-- LAST WRITTEN: 06/15/2026 23:33:11
-- ============================================================================

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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


-- ============================================================================
-- FILE: 20260709000400_add_relay_balance_admin_freeze_controls.sql
-- LAST WRITTEN: 06/15/2026 23:49:32
-- ============================================================================

-- ============================================================================
-- RELAY BALANCE ADMIN FREEZE CONTROLS
-- ============================================================================
-- Adds seller-wide Relay Balance freeze metadata so admins can temporarily
-- block withdrawals without mutating append-only ledger history.

ALTER TABLE public.relay_balances
  ADD COLUMN IF NOT EXISTS admin_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_reason TEXT,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_relay_balances_admin_frozen
  ON public.relay_balances(admin_frozen);

CREATE INDEX IF NOT EXISTS idx_relay_balances_frozen_by_admin_id
  ON public.relay_balances(frozen_by_admin_id);

ALTER TABLE public.relay_balances
  DROP CONSTRAINT IF EXISTS relay_balances_frozen_reason_check;

ALTER TABLE public.relay_balances
  ADD CONSTRAINT relay_balances_frozen_reason_check CHECK (
    CASE
      WHEN admin_frozen THEN frozen_reason IS NOT NULL AND length(trim(frozen_reason)) > 0
      ELSE TRUE
    END
  );


-- ============================================================================
-- FILE: 20260709001300_fix_missing_tag_orders_table.sql
-- LAST WRITTEN: 06/17/2026 13:36:55
-- ============================================================================

-- ============================================================================
-- FIX MISSING TAG ORDERS TABLE
-- Follow-up migration for environments where Relay tag purchases shipped before
-- the underlying `tag_orders` table migration existed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tag_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bundle_id TEXT NOT NULL,
  bundle_name TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'processing', 'shipped', 'fulfilled')),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  shipping_tracking_number TEXT,
  shipping_carrier TEXT,
  admin_notes TEXT,
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS bundle_id TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS bundle_name TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS quantity INT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS price_cents INT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'paid';
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shipping_tracking_number TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tag_orders
  ALTER COLUMN seller_id SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN bundle_id SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN bundle_name SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN price_cents SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.tag_orders
  DROP CONSTRAINT IF EXISTS tag_orders_quantity_check;
ALTER TABLE public.tag_orders
  ADD CONSTRAINT tag_orders_quantity_check CHECK (quantity > 0);

ALTER TABLE public.tag_orders
  DROP CONSTRAINT IF EXISTS tag_orders_price_cents_check;
ALTER TABLE public.tag_orders
  ADD CONSTRAINT tag_orders_price_cents_check CHECK (price_cents >= 0);

ALTER TABLE public.tag_orders
  DROP CONSTRAINT IF EXISTS tag_orders_status_check;
ALTER TABLE public.tag_orders
  ADD CONSTRAINT tag_orders_status_check
  CHECK (status IN ('paid', 'processing', 'shipped', 'fulfilled'));

CREATE INDEX IF NOT EXISTS idx_tag_orders_seller_id ON public.tag_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_tag_orders_status ON public.tag_orders(status);
CREATE INDEX IF NOT EXISTS idx_tag_orders_paid_at ON public.tag_orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_tag_orders_created_at ON public.tag_orders(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_orders_stripe_checkout_session_id
  ON public.tag_orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_orders_stripe_payment_intent_id
  ON public.tag_orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.tag_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their tag orders" ON public.tag_orders;
CREATE POLICY "Sellers can read their tag orders" ON public.tag_orders
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage tag orders" ON public.tag_orders;
CREATE POLICY "Admins can manage tag orders" ON public.tag_orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_tag_orders_updated_at'
  ) THEN
    CREATE TRIGGER update_tag_orders_updated_at
      BEFORE UPDATE ON public.tag_orders
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Refresh PostgREST schema cache so Preview/API routes can see the table
-- immediately after this migration is applied.
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- FILE: 20260709001200_add_tag_order_shipping_label_fields.sql
-- LAST WRITTEN: 06/17/2026 13:46:18
-- ============================================================================

-- ============================================================================
-- TAG ORDER SHIPPING LABEL FIELDS
-- Follow-up migration for environments that already created `tag_orders`.
-- Stores Shippo label metadata for Relay tag fulfillment shipments.
-- ============================================================================

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shippo_transaction_id TEXT;

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shippo_shipment_id TEXT;

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shippo_rate_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_orders_shippo_transaction_id
  ON public.tag_orders(shippo_transaction_id)
  WHERE shippo_transaction_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- FILE: 20260709000100_add_launch_payout_model.sql
-- LAST WRITTEN: 06/18/2026 19:18:01
-- ============================================================================

-- ============================================================================
-- RELAY LAUNCH PAYOUT MODEL
-- ============================================================================
-- Launch behavior keeps pooled funds on the Relay platform balance and tracks
-- seller ownership in the Relay ledger. Seller connected accounts are only
-- used as withdrawal destinations.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_funding_source TEXT
    CHECK (payment_funding_source IN ('card', 'relay_balance'))
    DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS relay_balance_payment_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_settlement_status TEXT
    CHECK (stripe_settlement_status IN (
      'not_applicable',
      'pending',
      'pending_settlement_unknown',
      'settled'
    ))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_funds_available_on TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_funds_settled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_payment_funding_source
  ON public.orders(payment_funding_source);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_relay_balance_payment_idempotency_key
  ON public.orders(relay_balance_payment_idempotency_key)
  WHERE relay_balance_payment_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_funds_available_on
  ON public.orders(stripe_funds_available_on);

CREATE INDEX IF NOT EXISTS idx_orders_stripe_settlement_status
  ON public.orders(stripe_settlement_status);

ALTER TABLE public.order_payouts
  ADD COLUMN IF NOT EXISTS payment_source_type TEXT
    CHECK (payment_source_type IN ('card', 'relay_balance')),
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_funds_available_on TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_funds_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_settlement_status TEXT
    CHECK (stripe_settlement_status IN (
      'not_applicable',
      'pending',
      'pending_settlement_unknown',
      'settled'
    ));

CREATE INDEX IF NOT EXISTS idx_order_payouts_payment_source_type
  ON public.order_payouts(payment_source_type);

CREATE INDEX IF NOT EXISTS idx_order_payouts_stripe_settlement_status
  ON public.order_payouts(stripe_settlement_status);

UPDATE public.orders
SET payment_funding_source = COALESCE(
  payment_funding_source,
  CASE
    WHEN stripe_payment_intent_id IS NULL THEN 'relay_balance'
    ELSE 'card'
  END
)
WHERE payment_funding_source IS NULL;

UPDATE public.orders
SET stripe_settlement_status = CASE
  WHEN payment_funding_source = 'relay_balance' THEN 'not_applicable'
  WHEN stripe_funds_settled_at IS NOT NULL THEN 'settled'
  WHEN stripe_funds_available_on IS NOT NULL AND stripe_funds_available_on <= NOW() THEN 'settled'
  WHEN stripe_funds_available_on IS NOT NULL THEN 'pending'
  ELSE COALESCE(stripe_settlement_status, 'pending')
END
WHERE stripe_settlement_status IS NULL
   OR stripe_settlement_status NOT IN (
     'not_applicable',
     'pending',
     'pending_settlement_unknown',
     'settled'
   );

UPDATE public.order_payouts AS op
SET
  payment_source_type = COALESCE(op.payment_source_type, o.payment_funding_source),
  stripe_charge_id = COALESCE(op.stripe_charge_id, o.stripe_charge_id),
  stripe_balance_transaction_id = COALESCE(
    op.stripe_balance_transaction_id,
    o.stripe_balance_transaction_id
  ),
  stripe_funds_available_on = COALESCE(
    op.stripe_funds_available_on,
    o.stripe_funds_available_on
  ),
  stripe_funds_settled_at = COALESCE(
    op.stripe_funds_settled_at,
    o.stripe_funds_settled_at
  ),
  stripe_settlement_status = COALESCE(
    op.stripe_settlement_status,
    o.stripe_settlement_status
  )
FROM public.orders AS o
WHERE op.order_id = o.id;

ALTER TABLE public.relay_balance_ledger
  DROP CONSTRAINT IF EXISTS relay_balance_ledger_type_check;

ALTER TABLE public.relay_balance_ledger
  ADD CONSTRAINT relay_balance_ledger_type_check
    CHECK (type IN (
      'order_pending_credit',
      'order_available_credit',
      'relay_balance_purchase_debit',
      'withdrawal_requested',
      'withdrawal_completed',
      'withdrawal_failed',
      'exposure_hold_created',
      'exposure_hold_released',
      'dispute_freeze',
      'dispute_debit',
      'admin_adjustment'
    ));

ALTER TABLE public.relay_balance_ledger
  DROP CONSTRAINT IF EXISTS relay_balance_ledger_order_required_check;

ALTER TABLE public.relay_balance_ledger
  ADD CONSTRAINT relay_balance_ledger_order_required_check
    CHECK (
      CASE
        WHEN type IN (
          'order_pending_credit',
          'order_available_credit',
          'relay_balance_purchase_debit',
          'exposure_hold_created',
          'exposure_hold_released',
          'dispute_freeze',
          'dispute_debit'
        ) THEN order_id IS NOT NULL
        ELSE TRUE
      END
    );

ALTER TABLE public.relay_balance_ledger
  DROP CONSTRAINT IF EXISTS relay_balance_ledger_amount_direction_check;

ALTER TABLE public.relay_balance_ledger
  ADD CONSTRAINT relay_balance_ledger_amount_direction_check
    CHECK (
      CASE
        WHEN type IN (
          'order_pending_credit',
          'order_available_credit',
          'withdrawal_completed',
          'withdrawal_failed',
          'exposure_hold_created',
          'exposure_hold_released',
          'dispute_freeze'
        ) THEN amount_cents > 0
        WHEN type IN (
          'relay_balance_purchase_debit',
          'withdrawal_requested',
          'dispute_debit'
        ) THEN amount_cents < 0
        ELSE amount_cents <> 0
      END
    );

-- Disable launch-time early payouts and reserve behavior while preserving the
-- existing compatibility columns.
UPDATE public.orders
SET
  payout_schedule = 'buyer_confirmation_or_review_expiry',
  reserve_percentage_bps_snapshot = 0,
  reserve_hold_duration_days_snapshot = NULL,
  minimum_reserve_balance_cents_snapshot = 0;

CREATE OR REPLACE FUNCTION public.recalculate_relay_balance(target_seller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_pending BIGINT := 0;
  calculated_available BIGINT := 0;
BEGIN
  IF target_seller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'order_pending_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN -amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'relay_balance_purchase_debit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_requested'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_failed'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'dispute_debit'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'admin_adjustment'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0)
  INTO calculated_pending, calculated_available
  FROM public.relay_balance_ledger
  WHERE seller_id = target_seller_id;

  INSERT INTO public.relay_balances (
    seller_id,
    total_balance_cents,
    available_balance_cents,
    pending_balance_cents,
    exposure_cents,
    withdrawable_balance_cents,
    updated_at
  )
  VALUES (
    target_seller_id,
    GREATEST(calculated_pending, 0) + calculated_available,
    calculated_available,
    GREATEST(calculated_pending, 0),
    0,
    GREATEST(calculated_available, 0),
    NOW()
  )
  ON CONFLICT (seller_id) DO UPDATE
  SET
    total_balance_cents = EXCLUDED.total_balance_cents,
    available_balance_cents = EXCLUDED.available_balance_cents,
    pending_balance_cents = EXCLUDED.pending_balance_cents,
    exposure_cents = EXCLUDED.exposure_cents,
    withdrawable_balance_cents = EXCLUDED.withdrawable_balance_cents,
    updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_relay_balance_order_purchase(
  p_buyer_id UUID,
  p_seller_id UUID,
  p_listing_id UUID,
  p_listing_variant_id UUID,
  p_listing_used_item_id UUID,
  p_custom_offer_id UUID,
  p_size TEXT,
  p_shoe_price_cents BIGINT,
  p_shipping_cost_cents BIGINT,
  p_total_charge_cents BIGINT,
  p_relay_fee_cents BIGINT,
  p_stripe_fee_estimate_cents BIGINT,
  p_seller_proceeds_cents BIGINT,
  p_buyer_shipping_address JSONB,
  p_challenge_code TEXT,
  p_shipping_deadline TIMESTAMPTZ,
  p_purchased_condition_photo_url TEXT,
  p_auth_snapshot JSONB,
  p_payout_snapshot JSONB,
  p_checkout_idempotency_key TEXT
)
RETURNS TABLE(order_id UUID, created BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  existing_order_id UUID;
  buyer_available_balance BIGINT := 0;
  buyer_balance_row_id UUID;
  order_payout_step TEXT := 'final_release';
  listing_sizes JSONB;
  legacy_size_index INT;
  legacy_size_entry JSONB;
  has_available_inventory BOOLEAN := false;
BEGIN
  IF p_buyer_id IS NULL OR p_seller_id IS NULL OR p_listing_id IS NULL THEN
    RAISE EXCEPTION 'Missing required Relay Balance checkout identifiers.';
  END IF;

  IF p_buyer_id = p_seller_id THEN
    RAISE EXCEPTION 'Buyer cannot purchase their own listing.';
  END IF;

  IF COALESCE(BTRIM(p_checkout_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Relay Balance checkout idempotency key is required.';
  END IF;

  SELECT o.id
  INTO existing_order_id
  FROM public.orders AS o
  WHERE o.relay_balance_payment_idempotency_key = p_checkout_idempotency_key
  LIMIT 1;

  IF existing_order_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_order_id, FALSE;
    RETURN;
  END IF;

  INSERT INTO public.relay_balances (
    seller_id,
    total_balance_cents,
    available_balance_cents,
    pending_balance_cents,
    exposure_cents,
    withdrawable_balance_cents,
    updated_at
  )
  VALUES (
    p_buyer_id,
    0,
    0,
    0,
    0,
    0,
    NOW()
  )
  ON CONFLICT (seller_id) DO NOTHING;

  SELECT rb.id, COALESCE(rb.available_balance_cents, 0)
  INTO buyer_balance_row_id, buyer_available_balance
  FROM public.relay_balances AS rb
  WHERE rb.seller_id = p_buyer_id
  FOR UPDATE;

  IF buyer_balance_row_id IS NULL THEN
    buyer_available_balance := 0;
  END IF;

  IF buyer_available_balance < COALESCE(p_total_charge_cents, 0) THEN
    RAISE EXCEPTION 'Insufficient Relay Balance available for this purchase.';
  END IF;

  IF p_listing_used_item_id IS NOT NULL THEN
    UPDATE public.listing_used_items
    SET
      quantity = 0,
      is_active = FALSE
    WHERE id = p_listing_used_item_id
      AND listing_id = p_listing_id
      AND COALESCE(quantity, 0) = 1
      AND COALESCE(is_active, TRUE) = TRUE
    RETURNING id
    INTO existing_order_id;

    IF existing_order_id IS NULL THEN
      RAISE EXCEPTION 'This used pair is no longer available.';
    END IF;
  ELSIF p_listing_variant_id IS NOT NULL THEN
    UPDATE public.listing_variants
    SET
      quantity = GREATEST(COALESCE(quantity, 0) - 1, 0),
      is_active = CASE
        WHEN GREATEST(COALESCE(quantity, 0) - 1, 0) <= 0 THEN FALSE
        ELSE COALESCE(is_active, TRUE)
      END
    WHERE id = p_listing_variant_id
      AND listing_id = p_listing_id
      AND COALESCE(quantity, 0) > 0
      AND COALESCE(is_active, TRUE) = TRUE
    RETURNING id
    INTO existing_order_id;

    IF existing_order_id IS NULL THEN
      RAISE EXCEPTION 'This size is no longer available.';
    END IF;
  ELSE
    SELECT l.sizes
    INTO listing_sizes
    FROM public.listings AS l
    WHERE l.id = p_listing_id
    FOR UPDATE;

    SELECT element.ordinality - 1, element.value
    INTO legacy_size_index, legacy_size_entry
    FROM jsonb_array_elements(COALESCE(listing_sizes, '[]'::jsonb)) WITH ORDINALITY AS element(value, ordinality)
    WHERE element.value->>'size' = p_size
    LIMIT 1;

    IF legacy_size_entry IS NULL OR COALESCE((legacy_size_entry->>'quantity')::INT, 0) <= 0 THEN
      RAISE EXCEPTION 'This size is no longer available.';
    END IF;

    listing_sizes := jsonb_set(
      listing_sizes,
      ARRAY[legacy_size_index::TEXT, 'quantity'],
      to_jsonb(GREATEST(COALESCE((legacy_size_entry->>'quantity')::INT, 0) - 1, 0))
    );

    UPDATE public.listings
    SET sizes = listing_sizes
    WHERE id = p_listing_id;
  END IF;

  INSERT INTO public.orders (
    listing_id,
    listing_variant_id,
    listing_used_item_id,
    buyer_id,
    seller_id,
    custom_offer_id,
    status,
    size,
    price,
    shipping_cost,
    platform_fee,
    stripe_fee,
    seller_earnings,
    relay_fee_cents,
    stripe_fee_estimate_cents,
    seller_proceeds_cents,
    payment_funding_source,
    relay_balance_payment_idempotency_key,
    stripe_settlement_status,
    challenge_code,
    buyer_shipping_address,
    shipping_deadline,
    purchased_condition_photo_url,
    relay_tag_required,
    checkcheck_required,
    checkcheck_reason,
    checkcheck_status,
    random_audit_required,
    random_audit_rate_bps_snapshot,
    high_risk_sku_required,
    high_risk_sku_id,
    high_risk_sku_reason,
    auth_requirements_evaluated_at,
    seller_tier_snapshot,
    payout_schedule,
    reserve_percentage_bps_snapshot,
    reserve_hold_duration_days_snapshot,
    minimum_reserve_balance_cents_snapshot,
    balance_credit_status
  )
  VALUES (
    p_listing_id,
    p_listing_variant_id,
    p_listing_used_item_id,
    p_buyer_id,
    p_seller_id,
    p_custom_offer_id,
    'paid',
    p_size,
    (COALESCE(p_shoe_price_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_shipping_cost_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_relay_fee_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_stripe_fee_estimate_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_seller_proceeds_cents, 0)::NUMERIC / 100.0),
    COALESCE(p_relay_fee_cents, 0),
    COALESCE(p_stripe_fee_estimate_cents, 0),
    COALESCE(p_seller_proceeds_cents, 0),
    'relay_balance',
    p_checkout_idempotency_key,
    'not_applicable',
    p_challenge_code,
    COALESCE(p_buyer_shipping_address, '{}'::jsonb),
    p_shipping_deadline,
    NULLIF(p_purchased_condition_photo_url, ''),
    COALESCE((p_auth_snapshot->>'relayTagRequired')::BOOLEAN, FALSE),
    COALESCE((p_auth_snapshot->>'checkcheckRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'checkcheckReason', ''),
    COALESCE(NULLIF(p_auth_snapshot->>'checkcheckStatus', ''), 'not_required'),
    COALESCE((p_auth_snapshot->>'randomAuditRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'randomAuditRateBpsSnapshot', '')::INT,
    COALESCE((p_auth_snapshot->>'highRiskSkuRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'highRiskSkuId', ''),
    NULLIF(p_auth_snapshot->>'highRiskSkuReason', ''),
    NULLIF(p_auth_snapshot->>'authRequirementsEvaluatedAt', '')::TIMESTAMPTZ,
    COALESCE(NULLIF(p_payout_snapshot->>'sellerTierSnapshot', ''), 'tier_1'),
    COALESCE(NULLIF(p_payout_snapshot->>'payoutSchedule', ''), 'buyer_confirmation_or_review_expiry'),
    COALESCE(NULLIF(p_payout_snapshot->>'reservePercentageBps', '')::INT, 0),
    NULLIF(p_payout_snapshot->>'reserveHoldDurationDays', '')::INT,
    COALESCE(NULLIF(p_payout_snapshot->>'minimumReserveBalanceCents', '')::BIGINT, 0),
    'pending'
  )
  RETURNING id
  INTO order_id;

  INSERT INTO public.relay_balance_ledger (
    seller_id,
    order_id,
    type,
    amount_cents,
    currency,
    status,
    metadata
  )
  VALUES (
    p_buyer_id,
    order_id,
    'relay_balance_purchase_debit',
    -COALESCE(p_total_charge_cents, 0),
    'usd',
    'posted',
    jsonb_build_object(
      'source', 'relay_balance_checkout',
      'idempotency_key', 'relay_balance_purchase:' || p_checkout_idempotency_key || ':buyer_debit',
      'payment_funding_source', 'relay_balance',
      'counterparty_user_id', p_seller_id,
      'order_total_cents', COALESCE(p_total_charge_cents, 0)
    )
  );

  INSERT INTO public.relay_balance_ledger (
    seller_id,
    order_id,
    type,
    amount_cents,
    currency,
    status,
    metadata
  )
  VALUES (
    p_seller_id,
    order_id,
    'order_pending_credit',
    COALESCE(p_seller_proceeds_cents, 0),
    'usd',
    'posted',
    jsonb_build_object(
      'source', 'relay_balance_checkout',
      'idempotency_key', 'money:order:' || order_id::TEXT || ':pending_credit',
      'seller_tier', COALESCE(NULLIF(p_payout_snapshot->>'sellerTierSnapshot', ''), 'tier_1'),
      'payment_funding_source', 'relay_balance',
      'buyer_id', p_buyer_id
    )
  );

  INSERT INTO public.order_payouts (
    order_id,
    seller_id,
    payout_step,
    payment_source_type,
    stripe_settlement_status,
    status,
    gross_amount_cents,
    reserve_withheld_cents,
    minimum_balance_top_up_cents,
    net_paid_cents,
    stripe_transfer_id,
    idempotency_key,
    trigger_source,
    metadata
  )
  VALUES (
    order_id,
    p_seller_id,
    order_payout_step,
    'relay_balance',
    'not_applicable',
    'pending',
    COALESCE(p_seller_proceeds_cents, 0),
    0,
    0,
    COALESCE(p_seller_proceeds_cents, 0),
    NULL,
    'order-payout-' || order_id::TEXT || '-' || order_payout_step,
    'relay_balance_checkout',
    jsonb_build_object(
      'releaseDestination', 'relay_balance',
      'paymentSourceType', 'relay_balance',
      'createdAtCheckout', TRUE
    )
  )
  ON CONFLICT (order_id, payout_step) DO UPDATE
  SET
    payment_source_type = EXCLUDED.payment_source_type,
    stripe_settlement_status = EXCLUDED.stripe_settlement_status,
    gross_amount_cents = EXCLUDED.gross_amount_cents,
    reserve_withheld_cents = EXCLUDED.reserve_withheld_cents,
    minimum_balance_top_up_cents = EXCLUDED.minimum_balance_top_up_cents,
    net_paid_cents = EXCLUDED.net_paid_cents,
    trigger_source = EXCLUDED.trigger_source,
    metadata = EXCLUDED.metadata;

  IF p_custom_offer_id IS NOT NULL THEN
    UPDATE public.custom_offers
    SET status = 'accepted'
    WHERE id = p_custom_offer_id;
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.listing_variants AS lv
      WHERE lv.listing_id = p_listing_id
        AND COALESCE(lv.quantity, 0) > 0
        AND COALESCE(lv.is_active, TRUE) = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.listing_used_items AS lui
      WHERE lui.listing_id = p_listing_id
        AND COALESCE(lui.quantity, 0) > 0
        AND COALESCE(lui.is_active, TRUE) = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.listings AS l
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.sizes, '[]'::jsonb)) AS element(value)
      WHERE l.id = p_listing_id
        AND COALESCE((element.value->>'quantity')::INT, 0) > 0
    )
  INTO has_available_inventory;

  UPDATE public.listings
  SET status = CASE
    WHEN has_available_inventory THEN 'active'
    ELSE 'sold_out'
  END
  WHERE id = p_listing_id
    AND status IN ('active', 'sold_out');

  RETURN QUERY SELECT order_id, TRUE;
END;
$$;

UPDATE public.relay_balances
SET
  exposure_cents = 0,
  withdrawable_balance_cents = GREATEST(available_balance_cents, 0),
  updated_at = NOW();


-- ============================================================================
-- FILE: 20260709002700_add_stripe_connect_transfer_readiness.sql
-- LAST WRITTEN: 06/18/2026 19:39:35
-- ============================================================================

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


-- ============================================================================
-- FILE: add_launch_founding_seller_program.sql
-- LAST WRITTEN: 06/19/2026 00:18:09
-- ============================================================================

-- ============================================================================
-- LAUNCH FOUNDING SELLER PROGRAM FLAG
-- ============================================================================
-- Founding seller status is a launch badge / program flag. It is intentionally
-- separate from seller tier and does not imply faster payout timing.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founding_seller BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_founding_seller_launch
  ON public.profiles(is_founding_seller);


-- ============================================================================
-- FILE: 20260709001000_add_launch_refund_dispute_recovery.sql
-- LAST WRITTEN: 06/19/2026 01:03:44
-- ============================================================================

-- ============================================================================
-- LAUNCH REFUND / DISPUTE SELLER RECOVERY
-- ============================================================================
-- Launch payout behavior keeps seller funds in the Relay ledger until
-- withdrawal. Refund and dispute resolution therefore needs an internal,
-- append-only recovery path that can:
-- 1. reverse pending seller credit before funds become available
-- 2. recover from available seller balance when coverage exists
-- 3. stop cleanly and require admin review when recovery would overdraw
--    the seller or appears to be post-withdrawal

CREATE OR REPLACE FUNCTION public.resolve_launch_refund_seller_recovery(
  p_order_id UUID
)
RETURNS TABLE (
  order_id UUID,
  seller_id UUID,
  buyer_id UUID,
  payment_funding_source TEXT,
  seller_proceeds_cents BIGINT,
  pending_credit_total_cents BIGINT,
  available_credit_total_cents BIGINT,
  dispute_debit_total_cents BIGINT,
  pending_outstanding_cents BIGINT,
  available_outstanding_cents BIGINT,
  seller_available_balance_cents BIGINT,
  recovered_amount_cents BIGINT,
  recovery_status TEXT,
  admin_review_required BOOLEAN,
  admin_review_reason TEXT,
  has_completed_withdrawals BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  order_row public.orders%ROWTYPE;
  funding_source TEXT;
  pending_credit_total BIGINT := 0;
  available_credit_total BIGINT := 0;
  dispute_debit_total BIGINT := 0;
  pending_outstanding BIGINT := 0;
  available_outstanding BIGINT := 0;
  seller_available BIGINT := 0;
  completed_withdrawals BOOLEAN := FALSE;
BEGIN
  SELECT *
  INTO order_row
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  funding_source := COALESCE(
    NULLIF(order_row.payment_funding_source, ''),
    CASE
      WHEN order_row.stripe_payment_intent_id IS NOT NULL THEN 'card'
      ELSE 'relay_balance'
    END
  );

  seller_proceeds_cents := COALESCE(
    order_row.seller_proceeds_cents,
    GREATEST(0, ROUND(COALESCE(order_row.seller_earnings, 0) * 100)::BIGINT),
    0
  );

  PERFORM public.recalculate_relay_balance(order_row.seller_id);

  PERFORM 1
  FROM public.relay_balances
  WHERE seller_id = order_row.seller_id
  FOR UPDATE;

  SELECT COALESCE(available_balance_cents, 0)
  INTO seller_available
  FROM public.relay_balances
  WHERE seller_id = order_row.seller_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.withdrawal_requests
    WHERE seller_id = order_row.seller_id
      AND status = 'completed'
  )
  INTO completed_withdrawals;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'order_pending_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'dispute_debit'
          AND status IN ('posted', 'completed')
          THEN ABS(amount_cents)
        ELSE 0
      END
    ), 0)
  INTO pending_credit_total, available_credit_total, dispute_debit_total
  FROM public.relay_balance_ledger
  WHERE order_id = order_row.id;

  pending_outstanding := GREATEST(0, pending_credit_total - available_credit_total);
  available_outstanding := GREATEST(0, available_credit_total - dispute_debit_total);

  order_id := order_row.id;
  seller_id := order_row.seller_id;
  buyer_id := order_row.buyer_id;
  payment_funding_source := funding_source;
  pending_credit_total_cents := pending_credit_total;
  available_credit_total_cents := available_credit_total;
  dispute_debit_total_cents := dispute_debit_total;
  pending_outstanding_cents := pending_outstanding;
  available_outstanding_cents := available_outstanding;
  seller_available_balance_cents := seller_available;
  recovered_amount_cents := 0;
  admin_review_required := FALSE;
  admin_review_reason := NULL;
  has_completed_withdrawals := completed_withdrawals;

  IF pending_outstanding = 0 AND available_outstanding = 0 THEN
    recovery_status := 'already_recovered';
    RETURN NEXT;
    RETURN;
  END IF;

  IF pending_outstanding > 0 AND available_outstanding = 0 THEN
    INSERT INTO public.relay_balance_ledger (
      seller_id,
      order_id,
      type,
      amount_cents,
      currency,
      status,
      metadata
    )
    VALUES (
      order_row.seller_id,
      order_row.id,
      'order_available_credit',
      pending_outstanding,
      'usd',
      'posted',
      jsonb_build_object(
        'source', 'launch_refund_recovery',
        'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_reversal_available',
        'release_key', 'refund_reversal',
        'release_trigger', 'refund_reversal',
        'forced_release', TRUE,
        'refund_reversal', TRUE,
        'payment_funding_source', funding_source
      )
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.relay_balance_ledger (
      seller_id,
      order_id,
      type,
      amount_cents,
      currency,
      status,
      metadata
    )
    VALUES (
      order_row.seller_id,
      order_row.id,
      'dispute_debit',
      -pending_outstanding,
      'usd',
      'posted',
      jsonb_build_object(
        'source', 'launch_refund_recovery',
        'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_reversal_debit',
        'refund_recovery_stage', 'pending_reversal',
        'payment_funding_source', funding_source
      )
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.orders
    SET
      balance_credit_status = 'reversed',
      updated_at = NOW()
    WHERE id = order_row.id;

    UPDATE public.order_payouts
    SET
      status = 'cancelled',
      failure_reason = COALESCE(
        failure_reason,
        'Order refunded before seller funds became available.'
      ),
      updated_at = NOW()
    WHERE order_id = order_row.id
      AND status IN ('pending', 'paid', 'frozen');

    recovered_amount_cents := pending_outstanding;
    recovery_status := 'pending_reversed';
    RETURN NEXT;
    RETURN;
  END IF;

  IF pending_outstanding = 0 AND available_outstanding > 0 THEN
    IF seller_available >= available_outstanding THEN
      INSERT INTO public.relay_balance_ledger (
        seller_id,
        order_id,
        type,
        amount_cents,
        currency,
        status,
        metadata
      )
      VALUES (
        order_row.seller_id,
        order_row.id,
        'dispute_debit',
        -available_outstanding,
        'usd',
        'posted',
        jsonb_build_object(
          'source', 'launch_refund_recovery',
          'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_available_debit',
          'refund_recovery_stage', 'available_balance_debit',
          'payment_funding_source', funding_source
        )
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.orders
      SET
        balance_credit_status = 'reversed',
        updated_at = NOW()
      WHERE id = order_row.id;

      UPDATE public.order_payouts
      SET
        status = 'cancelled',
        failure_reason = COALESCE(
          failure_reason,
          'Order refunded and seller available balance was recovered.'
        ),
        updated_at = NOW()
      WHERE order_id = order_row.id
        AND status IN ('pending', 'paid', 'frozen');

      recovered_amount_cents := available_outstanding;
      recovery_status := 'available_balance_debited';
      RETURN NEXT;
      RETURN;
    END IF;

    recovery_status := CASE
      WHEN completed_withdrawals THEN 'admin_review_post_withdrawal'
      ELSE 'admin_review_insufficient_available'
    END;
    admin_review_required := TRUE;
    admin_review_reason := CASE
      WHEN completed_withdrawals THEN 'Seller has completed withdrawals and available balance is insufficient for automatic recovery.'
      ELSE 'Seller available balance is insufficient for automatic recovery.'
    END;

    UPDATE public.order_payouts
    SET
      failure_reason = COALESCE(
        failure_reason,
        'Refund requires manual recovery review because seller funds are not fully recoverable.'
      ),
      updated_at = NOW()
    WHERE order_id = order_row.id
      AND status IN ('pending', 'frozen');

    RETURN NEXT;
    RETURN;
  END IF;

  recovery_status := 'admin_review_mixed_credit_state';
  admin_review_required := TRUE;
  admin_review_reason := 'Order has mixed pending and available seller credit state. Manual review is required.';

  UPDATE public.order_payouts
  SET
    failure_reason = COALESCE(
      failure_reason,
      'Refund requires manual review because the order has mixed pending and available seller credit.'
    ),
    updated_at = NOW()
  WHERE order_id = order_row.id
    AND status IN ('pending', 'frozen');

  RETURN NEXT;
END;
$$;


-- ============================================================================
-- FILE: 20260709003800_fix_relay_balance_ledger_manual_cleanup_deletes.sql
-- LAST WRITTEN: 06/25/2026 14:36:12
-- ============================================================================

-- ============================================================================
-- RELAY BALANCE LEDGER MANUAL CLEANUP SUPPORT
-- ============================================================================
-- Manual test cleanup in Supabase should be able to delete users/orders and
-- let the associated Relay balance records cascade cleanly. We keep the ledger
-- append-only for updates, but allow deletes so parent-row cleanup works.

ALTER TABLE public.relay_balance_ledger
  DROP CONSTRAINT IF EXISTS relay_balance_ledger_order_id_fkey;

ALTER TABLE public.relay_balance_ledger
  ADD CONSTRAINT relay_balance_ledger_order_id_fkey
    FOREIGN KEY (order_id)
    REFERENCES public.orders(id)
    ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.recalculate_relay_balance(target_seller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_pending BIGINT := 0;
  calculated_available BIGINT := 0;
BEGIN
  IF target_seller_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = target_seller_id
  ) THEN
    DELETE FROM public.relay_balances
    WHERE seller_id = target_seller_id;

    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'order_pending_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN -amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'relay_balance_purchase_debit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_requested'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_failed'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'dispute_debit'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'admin_adjustment'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0)
  INTO calculated_pending, calculated_available
  FROM public.relay_balance_ledger
  WHERE seller_id = target_seller_id;

  INSERT INTO public.relay_balances (
    seller_id,
    total_balance_cents,
    available_balance_cents,
    pending_balance_cents,
    exposure_cents,
    withdrawable_balance_cents,
    updated_at
  )
  VALUES (
    target_seller_id,
    GREATEST(calculated_pending, 0) + calculated_available,
    calculated_available,
    GREATEST(calculated_pending, 0),
    0,
    GREATEST(calculated_available, 0),
    NOW()
  )
  ON CONFLICT (seller_id) DO UPDATE
  SET
    total_balance_cents = EXCLUDED.total_balance_cents,
    available_balance_cents = EXCLUDED.available_balance_cents,
    pending_balance_cents = EXCLUDED.pending_balance_cents,
    exposure_cents = EXCLUDED.exposure_cents,
    withdrawable_balance_cents = EXCLUDED.withdrawable_balance_cents,
    updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_relay_balance_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalculate_relay_balance(COALESCE(NEW.seller_id, OLD.seller_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_relay_balance_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'relay_balance_ledger is append-only; % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS sync_relay_balance_after_ledger_insert ON public.relay_balance_ledger;

CREATE TRIGGER sync_relay_balance_after_ledger_insert
  AFTER INSERT OR DELETE ON public.relay_balance_ledger
  FOR EACH ROW EXECUTE FUNCTION public.sync_relay_balance_from_ledger();


-- ============================================================================
-- FILE: 20260709001500_add_founding_seller_and_condition_photo_flags.sql
-- LAST WRITTEN: 07/08/2026 15:30:17
-- ============================================================================

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
