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

// Vercel Cron: runs hourly
// vercel.json: { "crons": [{ "path": "/api/cron/refresh-engagement", "schedule": "0 * * * *" }] }
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Refresh materialized view
    await getSupabase().rpc("refresh_room_engagement");

    // Update denormalized counts on rooms table
    const { data: engagement } = await getSupabase()
      .from("room_engagement")
      .select("room_id, active_count, invite_quota");

    if (engagement) {
      for (const row of engagement) {
        await getSupabase()
          .from("rooms")
          .update({
            active_member_count: row.active_count,
            invite_quota: row.invite_quota,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.room_id);
      }
    }

    // Update 24h message counts
    await getSupabase().rpc("update_message_counts_24h");

    return NextResponse.json({ ok: true, rooms_updated: engagement?.length ?? 0 });
  } catch (error) {
    console.error("refresh-engagement error:", error);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
