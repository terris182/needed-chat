-- Add topic_context column to rooms for caching factual context about room topics
-- Prevents bot hallucination by giving them real facts to reference
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS topic_context text;

-- Add metadata column to messages for storing context like icebreaker prompt
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata jsonb;
