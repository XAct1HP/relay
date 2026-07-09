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
