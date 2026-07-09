CREATE TABLE integration_api_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
