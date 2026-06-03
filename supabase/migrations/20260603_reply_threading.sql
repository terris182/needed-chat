-- WHI-474: Add reply threading to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
