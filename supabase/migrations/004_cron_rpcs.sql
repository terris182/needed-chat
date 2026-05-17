-- Refresh materialized view (called by hourly cron)
create or replace function refresh_room_engagement()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently room_engagement;
end;
$$;

-- Update 24h message counts (called by hourly cron)
create or replace function update_message_counts_24h()
returns void
language plpgsql
security definer
as $$
begin
  update rooms r
  set message_count_24h = coalesce(sub.cnt, 0)
  from (
    select room_id, count(*) as cnt
    from messages
    where created_at > now() - interval '24 hours'
      and moderation_status in ('pending', 'safe')
    group by room_id
  ) sub
  where r.id = sub.room_id;

  -- Zero out rooms with no recent messages
  update rooms
  set message_count_24h = 0
  where id not in (
    select distinct room_id from messages
    where created_at > now() - interval '24 hours'
      and moderation_status in ('pending', 'safe')
  );
end;
$$;

-- Find invite candidates for a room (called by invite-fit-users cron)
create or replace function find_invite_candidates(
  target_room_id uuid,
  room_embedding vector(1536),
  match_threshold float default 0.5,
  max_candidates int default 10
)
returns table (
  user_id uuid,
  similarity float,
  tags text[]
)
language sql stable
security definer
as $$
  select
    np.user_id,
    1 - (np.embedding <=> room_embedding) as similarity,
    np.ai_tags as tags
  from needed_prompts np
  where
    -- Has a recent prompt with embedding
    np.embedding is not null
    and np.created_at > now() - interval '30 days'
    and np.ai_safe_to_match = true
    -- Similarity threshold
    and 1 - (np.embedding <=> room_embedding) > match_threshold
    -- Not already a member
    and not exists (
      select 1 from room_members rm
      where rm.room_id = target_room_id and rm.user_id = np.user_id
    )
    -- Not already invited (pending or declined in last 30 days)
    and not exists (
      select 1 from room_invites ri
      where ri.room_id = target_room_id
        and ri.user_id = np.user_id
        and (ri.status = 'pending' or (ri.status = 'declined' and ri.responded_at > now() - interval '30 days'))
    )
    -- Not in safety blackout
    and not exists (
      select 1 from users_profile up
      where up.id = np.user_id
        and (up.safety_blackout_until is not null and up.safety_blackout_until > now())
    )
    -- Matchmaking enabled
    and exists (
      select 1 from users_profile up
      where up.id = np.user_id and up.matchmaking_enabled = true and up.account_status = 'active'
    )
  order by similarity desc
  limit max_candidates;
$$;
