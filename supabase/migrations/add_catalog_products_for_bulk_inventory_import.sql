CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
