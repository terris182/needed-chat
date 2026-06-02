import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

let _supabase: any = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return _supabase;
}

// Vercel Cron: runs daily at 3am UTC
// Manages room lifecycle: archive stale rooms, keep healthy ones alive
//
// RULES:
// - Seed rooms (origin='seed') are NEVER archived — they're the permanent catalog
// - User-created rooms get archived when they go stale
// - "Stale" = no messages in 14 days AND no active members in 7 days
// - Archived rooms are hidden from listings but data is preserved
// - Rooms with active members are always kept alive regardless of message count
// - Rooms less than 7 days old are always kept (grace period)

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Find user-created rooms that are candidates for archival
    const { data: candidateRooms } = await db
      .from("rooms")
      .select("id, slug, title, created_at, updated_at, message_count_24h")
      .eq("origin", "user")
      .in("status", ["active", "seeding"])
      .lt("created_at", sevenDaysAgo); // older than 7 days (past grace period)

    if (!candidateRooms?.length) {
      return NextResponse.json({ ok: true, archived: 0, reason: "no candidates" });
    }

    let archived = 0;
    const archivedRooms: string[] = [];

    for (const room of candidateRooms) {
      // Check for recent messages (last 14 days)
      const { count: recentMessageCount } = await db
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("room_id", room.id)
        .gte("created_at", fourteenDaysAgo);

      if ((recentMessageCount ?? 0) > 0) continue; // Has recent activity, keep alive

      // Check for active members (messaged in last 7 days)
      const { count: activeMemberCount } = await db
        .from("room_members")
        .select("*", { count: "exact", head: true })
        .eq("room_id", room.id)
        .gte("last_message_at", sevenDaysAgo);

      if ((activeMemberCount ?? 0) > 0) continue; // Has active members, keep alive

      // Room is stale — archive it
      await db.from("rooms").update({
        status: "archived",
        updated_at: now.toISOString(),
      }).eq("id", room.id);

      archived++;
      archivedRooms.push(room.slug);
    }

    // 2. Reactivate seed rooms that somehow got archived (safety net)
    const { data: archivedSeeds } = await db
      .from("rooms")
      .select("id")
      .eq("origin", "seed")
      .eq("status", "archived");

    let reactivated = 0;
    if (archivedSeeds?.length) {
      for (const room of archivedSeeds) {
        await db.from("rooms").update({ status: "active" }).eq("id", room.id);
        reactivated++;
      }
    }

    // 3. Update engagement refresh (piggyback on this cron)
    await db.rpc("refresh_room_engagement");

    return NextResponse.json({
      ok: true,
      candidates: candidateRooms.length,
      archived,
      archivedRooms,
      reactivated,
    });
  } catch (error) {
    console.error("room-lifecycle error:", error);
    return NextResponse.json({ error: "Lifecycle failed" }, { status: 500 });
  }
}
