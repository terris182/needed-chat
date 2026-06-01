-- Add is_bot flag to users_profile
alter table users_profile add column if not exists is_bot boolean default false;

-- Bots can read all rooms (service role bypasses RLS, but flag helps app logic)
-- Allow service role to insert messages for bot users (already covered by service role bypass)

-- Index for quick bot exclusion in queries
create index if not exists users_profile_is_bot_idx on users_profile (is_bot) where is_bot = true;
