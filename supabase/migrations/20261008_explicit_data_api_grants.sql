-- Explicit Data API grants.
-- From 2026-10-30 Supabase no longer auto-grants Data API access to new tables
-- in the public schema. This migration adds the grants explicitly. It does not
-- change any RLS policy, and grants are additive and idempotent.
--
-- anon: nothing. Every app route that reads data requires a signed-in user
-- (see src/lib/supabase/middleware.ts), and no code path reads a table with
-- the anon key while signed out.
-- authenticated: tables the app touches through the anon-key client
-- (src/lib/supabase/client.ts and server.ts) as a signed-in user. RLS still
-- decides which rows are visible.
-- service_role: every table, used by API routes, cron and seed scripts.

-- service_role: all tables and the materialized view
grant select, insert, update, delete on table
  public.users_profile,
  public.rooms,
  public.room_members,
  public.room_invites,
  public.needed_prompts,
  public.room_recommendations,
  public.messages,
  public.reports,
  public.room_prompts,
  public.subscriptions,
  public.ad_events,
  public.crisis_events,
  public.push_subscriptions,
  public.activation_events,
  public.journal_synthesis,
  public.rate_limit_buckets
to service_role;

grant select on table public.room_engagement to service_role;

-- authenticated: signed-in app reads and writes
grant select, insert, update, delete on table
  public.users_profile,
  public.rooms,
  public.room_members,
  public.room_invites,
  public.messages,
  public.activation_events
to authenticated;

-- message_reactions is used by the app but no migration in this repo creates
-- it (it may exist only in the live database). Grant only if it is present.
do $$
begin
  if to_regclass('public.message_reactions') is not null then
    grant select, insert, update, delete on table public.message_reactions to service_role;
    grant select, insert, update, delete on table public.message_reactions to authenticated;
  end if;
end
$$;

-- Future tables created by the migration role get the same grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
