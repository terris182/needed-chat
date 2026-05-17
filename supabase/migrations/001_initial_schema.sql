-- needed.chat initial schema
-- BUILD_PLAN §8: Full data model with RLS

-- Extensions
create extension if not exists vector;

-------------------------------------------------
-- 1. Profiles
-------------------------------------------------
create table users_profile (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  username text unique not null,
  avatar_url text,
  bio text,
  anonymity_mode text default 'pseudonymous',
  account_status text default 'active',
  subscription_tier text default 'free' check (subscription_tier in ('free','plus','host','admin')),
  safety_blackout_until timestamptz,
  matchmaking_enabled boolean default true,
  digest_email_enabled boolean default true,
  digest_time time default '20:00',
  digest_tz text default 'America/Los_Angeles',
  ban_status text default 'none' check (ban_status in ('none','warned','soft_banned','hard_banned')),
  ban_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table users_profile enable row level security;
create policy "users read own" on users_profile for select using (auth.uid() = id);
create policy "users update own" on users_profile for update using (auth.uid() = id);

-------------------------------------------------
-- 2. Rooms
-------------------------------------------------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  category text,
  intensity text check (intensity in ('light','medium','deep')),
  ad_safety_rating text default 'yellow' check (ad_safety_rating in ('green','yellow','red')),
  tags text[],
  meta_target text,
  created_by uuid references users_profile(id),
  origin text check (origin in ('seed','user','admin')) default 'user',
  room_type text default 'public' check (room_type in ('public','private','scheduled')),
  status text default 'active' check (status in ('active','seeding','archived','closed')),
  is_featured boolean default false,
  entry_prompt text,
  daily_prompt text,
  daily_prompt_updated_at timestamptz,
  active_member_count int default 0,
  message_count_24h int default 0,
  invite_quota int default 10,
  embedding vector(1536),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index rooms_embedding_idx on rooms using hnsw (embedding vector_cosine_ops);
alter table rooms enable row level security;
create policy "rooms read public" on rooms for select using (room_type = 'public' and status in ('active','seeding'));
create policy "rooms update creator/host" on rooms for update using (
  created_by = auth.uid() or
  exists (select 1 from users_profile where id = auth.uid() and subscription_tier in ('host','admin'))
);

-------------------------------------------------
-- 3. Room members
-------------------------------------------------
create table room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users_profile(id) on delete cascade,
  role text default 'member' check (role in ('member','host','moderator')),
  joined_at timestamptz default now(),
  last_read_at timestamptz,
  last_message_at timestamptz,
  message_count_7d int default 0,
  engagement_status text default 'active' check (engagement_status in ('active','dormant','muted')),
  unique (room_id, user_id)
);
create index room_members_user_idx on room_members (user_id, engagement_status);
alter table room_members enable row level security;
create policy "members read own rooms" on room_members for select using (user_id = auth.uid());
create policy "members manage own" on room_members for all using (user_id = auth.uid());

-------------------------------------------------
-- 4. Invites
-------------------------------------------------
create table room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users_profile(id) on delete cascade,
  invited_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days'),
  responded_at timestamptz,
  status text default 'pending' check (status in ('pending','accepted','declined','expired')),
  fit_score numeric,
  reason text,
  unique (room_id, user_id)
);
create index room_invites_user_pending_idx on room_invites (user_id, status) where status = 'pending';
alter table room_invites enable row level security;
create policy "invites read own" on room_invites for select using (user_id = auth.uid());
create policy "invites update own" on room_invites for update using (user_id = auth.uid());

-------------------------------------------------
-- 5. Needed prompts (brand question answers)
-------------------------------------------------
create table needed_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id) on delete cascade,
  private_text text not null,
  ai_category text,
  ai_intensity text,
  ai_intent text,
  ai_tags text[],
  ai_risk_level text check (ai_risk_level in ('low','medium','high')),
  ai_safe_to_match boolean,
  embedding vector(1536),
  created_at timestamptz default now()
);
create index needed_prompts_user_date_idx on needed_prompts (user_id, created_at desc);
alter table needed_prompts enable row level security;
create policy "needed read own" on needed_prompts for select using (user_id = auth.uid());
create policy "needed insert own" on needed_prompts for insert with check (user_id = auth.uid());

-------------------------------------------------
-- 6. Recommendation audit trail
-------------------------------------------------
create table room_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id) on delete cascade,
  needed_prompt_id uuid references needed_prompts(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  reason text,
  score numeric,
  acted_on boolean default false,
  created_at timestamptz default now()
);
alter table room_recommendations enable row level security;
create policy "recs read own" on room_recommendations for select using (user_id = auth.uid());

-------------------------------------------------
-- 7. Messages
-------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users_profile(id) on delete set null,
  body text not null,
  message_type text default 'user' check (message_type in ('user','ai_prompt','system')),
  moderation_status text default 'pending' check (moderation_status in ('pending','safe','flagged','blocked')),
  moderation_reason text,
  created_at timestamptz default now()
);
create index messages_room_time_idx on messages (room_id, created_at desc);
alter table messages enable row level security;
create policy "messages read room members" on messages for select using (
  exists (select 1 from room_members where room_id = messages.room_id and user_id = auth.uid())
);
create policy "messages insert self" on messages for insert with check (user_id = auth.uid());

-------------------------------------------------
-- 8. Reports
-------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references users_profile(id),
  reported_user_id uuid references users_profile(id),
  room_id uuid references rooms(id),
  message_id uuid references messages(id),
  reason text not null,
  details text,
  status text default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  created_at timestamptz default now()
);
alter table reports enable row level security;
create policy "reports insert self" on reports for insert with check (reporter_user_id = auth.uid());

-------------------------------------------------
-- 9. Room prompts history
-------------------------------------------------
create table room_prompts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  prompt_text text not null,
  prompt_type text check (prompt_type in ('daily','entry','suggested')),
  created_by text check (created_by in ('ai','host','admin','seed')),
  created_at timestamptz default now()
);

-------------------------------------------------
-- 10. Subscriptions
-------------------------------------------------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  plan text check (plan in ('plus','host')),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "subs read own" on subscriptions for select using (user_id = auth.uid());

-------------------------------------------------
-- 11. Ad events
-------------------------------------------------
create table ad_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id) on delete set null,
  ad_type text,
  placement text,
  room_id uuid references rooms(id) on delete set null,
  room_ad_safety_rating text,
  shown_at timestamptz default now()
);

-------------------------------------------------
-- 12. Crisis events
-------------------------------------------------
create table crisis_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id) on delete set null,
  source text check (source in ('needed_prompt','message')),
  source_id uuid,
  risk_signal text,
  ai_response_shown text,
  resolved_at timestamptz,
  resolved_by uuid references users_profile(id),
  notes text,
  created_at timestamptz default now()
);

-------------------------------------------------
-- 13. Push subscriptions
-------------------------------------------------
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
create policy "push manage own" on push_subscriptions for all using (user_id = auth.uid());

-------------------------------------------------
-- 14. Activation funnel events
-------------------------------------------------
create table activation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id) on delete cascade,
  event text not null,
  metadata jsonb,
  created_at timestamptz default now()
);
create index activation_events_user_event_idx on activation_events (user_id, event);

-------------------------------------------------
-- 15. Journal synthesis (weekly, Plus tier)
-------------------------------------------------
create table journal_synthesis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id) on delete cascade,
  week_start date not null,
  body text not null,
  themes text[],
  created_at timestamptz default now(),
  unique (user_id, week_start)
);
alter table journal_synthesis enable row level security;
create policy "synth read own" on journal_synthesis for select using (user_id = auth.uid());

-------------------------------------------------
-- 16. Rate limit buckets
-------------------------------------------------
create table rate_limit_buckets (
  key text primary key,
  count int default 0,
  window_start timestamptz default now()
);

-------------------------------------------------
-- Materialized view: room engagement (§8.1)
-------------------------------------------------
create materialized view room_engagement as
select
  r.id as room_id,
  count(distinct case when rm.last_message_at > now() - interval '7 days' then rm.user_id end) as active_count,
  count(distinct case when rm.last_read_at > now() - interval '3 days' then rm.user_id end) as recent_readers,
  count(distinct rm.user_id) as total_members,
  greatest(10, ceil(count(distinct case when rm.last_message_at > now() - interval '7 days' then rm.user_id end) * 1.5))::int as invite_quota
from rooms r
left join room_members rm on rm.room_id = r.id and rm.engagement_status != 'muted'
where r.status in ('active','seeding')
group by r.id;

create unique index room_engagement_room_idx on room_engagement (room_id);
