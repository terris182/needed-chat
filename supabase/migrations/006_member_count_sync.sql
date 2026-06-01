-- WHI-465: Fix room member counts — base seed numbers + real-time trigger

-- 1. Add base_member_count column for seed/fake floor numbers
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS base_member_count int DEFAULT 0;

-- 2. Seed existing rooms with plausible base counts by safety tier
-- GREEN (pop culture) rooms get higher base, RED (safe space) get lower
UPDATE rooms SET base_member_count = CASE
  WHEN ad_safety_rating = 'green' THEN floor(random() * 10 + 15)::int   -- 15-24
  WHEN ad_safety_rating = 'yellow' THEN floor(random() * 8 + 10)::int   -- 10-17
  WHEN ad_safety_rating = 'red' THEN floor(random() * 5 + 8)::int       -- 8-12
  ELSE 5
END
WHERE origin = 'seed' AND base_member_count = 0;

-- User-created rooms get a small base (3-6) so they don't look empty
UPDATE rooms SET base_member_count = floor(random() * 4 + 3)::int
WHERE origin = 'user' AND base_member_count = 0;

-- 3. Sync active_member_count = base + actual room_members right now
UPDATE rooms r SET active_member_count = r.base_member_count + coalesce(sub.cnt, 0)
FROM (
  SELECT room_id, count(*) as cnt FROM room_members GROUP BY room_id
) sub
WHERE r.id = sub.room_id;

-- Also update rooms with zero actual members
UPDATE rooms SET active_member_count = base_member_count
WHERE id NOT IN (SELECT DISTINCT room_id FROM room_members);

-- 4. Trigger function: keep active_member_count in sync on join/leave
CREATE OR REPLACE FUNCTION sync_room_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_room_id uuid;
  actual_count int;
  base int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_room_id := OLD.room_id;
  ELSE
    target_room_id := NEW.room_id;
  END IF;

  SELECT count(*) INTO actual_count
  FROM room_members WHERE room_id = target_room_id;

  SELECT coalesce(base_member_count, 0) INTO base
  FROM rooms WHERE id = target_room_id;

  UPDATE rooms
  SET active_member_count = base + actual_count,
      updated_at = now()
  WHERE id = target_room_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- 5. Attach trigger to room_members
DROP TRIGGER IF EXISTS trg_sync_member_count ON room_members;
CREATE TRIGGER trg_sync_member_count
  AFTER INSERT OR DELETE ON room_members
  FOR EACH ROW EXECUTE FUNCTION sync_room_member_count();
