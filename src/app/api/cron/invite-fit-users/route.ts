import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getOpenAI } from "@/lib/openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Vercel Cron: runs every 6 hours
// vercel.json: { "crons": [{ "path": "/api/cron/invite-fit-users", "schedule": "0 */6 * * *" }] }
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get active rooms with capacity
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, title, slug, embedding, ad_safety_rating, active_member_count, invite_quota")
      .in("status", ["active", "seeding"])
      .not("embedding", "is", null);

    if (!rooms?.length) {
      return NextResponse.json({ ok: true, invites_sent: 0 });
    }

    let totalInvites = 0;

    for (const room of rooms) {
      // Skip if at capacity
      if (room.active_member_count >= room.invite_quota) continue;

      const slotsAvailable = room.invite_quota - room.active_member_count;

      // Find users with recent needed_prompts that match this room
      // Exclude: already members, already invited (pending/declined in last 30 days), blackout active, matchmaking disabled
      const { data: candidates } = await supabase.rpc("find_invite_candidates", {
        target_room_id: room.id,
        room_embedding: room.embedding,
        match_threshold: 0.50,
        max_candidates: Math.min(slotsAvailable, 10), // cap per room per cycle
      });

      if (!candidates?.length) continue;

      // Create invitations
      for (const candidate of candidates) {
        // Generate a reason
        let reason = "This looks like a fit for what's been on your mind.";
        try {
          const completion = await getOpenAI().chat.completions.create({
            model: "gpt-4.1-nano",
            max_tokens: 40,
            messages: [
              {
                role: "system",
                content: "Write a brief, warm one-sentence reason why this room matches the user. Max 12 words. Don't start with 'This room' or 'Because'.",
              },
              {
                role: "user",
                content: `Room: "${room.title}". User's recent topic tags: ${candidate.tags?.join(", ") || "general"}`,
              },
            ],
          });
          reason = completion.choices[0].message.content || reason;
        } catch {
          // Use default reason
        }

        await supabase.from("room_invites").upsert(
          {
            room_id: room.id,
            user_id: candidate.user_id,
            fit_score: candidate.similarity,
            reason,
            status: "pending",
            invited_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "room_id,user_id" }
        );

        totalInvites++;
      }
    }

    return NextResponse.json({ ok: true, invites_sent: totalInvites });
  } catch (error) {
    console.error("invite-fit-users error:", error);
    return NextResponse.json({ error: "Invite cron failed" }, { status: 500 });
  }
}
