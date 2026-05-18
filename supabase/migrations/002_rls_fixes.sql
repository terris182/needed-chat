-- Migration: Add missing RLS policies and enable Realtime
-- These were discovered during E2E testing of the chat flow

-- Allow users to insert their own profile (needed during onboarding)
CREATE POLICY "users insert own" ON users_profile
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to delete their own messages (needed for pre-publish moderation: blocked messages get deleted)
CREATE POLICY "messages delete own" ON messages
  FOR DELETE USING (user_id = auth.uid());

-- Allow users to update their own messages (needed for moderation status updates)
CREATE POLICY "messages update own" ON messages
  FOR UPDATE USING (user_id = auth.uid());

-- Enable Realtime on messages table (required for live chat updates)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
