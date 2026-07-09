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
