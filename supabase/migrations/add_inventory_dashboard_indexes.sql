CREATE INDEX IF NOT EXISTS idx_listings_seller_updated_at
  ON listings(seller_id, updated_at DESC);
