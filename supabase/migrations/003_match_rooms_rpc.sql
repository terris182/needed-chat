-- RPC for cosine similarity room matching (called from match-or-create-room)
create or replace function match_rooms(
  query_embedding vector(1536),
  match_threshold float default 0.5,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  category text,
  intensity text,
  ad_safety_rating text,
  similarity float
)
language sql stable
as $$
  select
    rooms.id,
    rooms.title,
    rooms.slug,
    rooms.description,
    rooms.category,
    rooms.intensity,
    rooms.ad_safety_rating,
    1 - (rooms.embedding <=> query_embedding) as similarity
  from rooms
  where
    rooms.status in ('active', 'seeding')
    and rooms.embedding is not null
    and 1 - (rooms.embedding <=> query_embedding) > match_threshold
  order by rooms.embedding <=> query_embedding
  limit match_count;
$$;
