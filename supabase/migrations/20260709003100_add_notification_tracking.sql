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
