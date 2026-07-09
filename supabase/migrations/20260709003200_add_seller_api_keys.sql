CREATE TABLE seller_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
