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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
