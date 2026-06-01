import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

let _service: any = null;
function getService() {
  if (!_service) _service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return _service;
}

// Server-side room join: sets icebreaker, posts answer, creates membership, triggers bots
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { room_id, icebreaker, answer } = await request.json();
  if (!room_id || !icebreaker || !answer?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = getService();

  // 1. Set icebreaker as daily_prompt
  await db.from("rooms").update({
    daily_prompt: icebreaker,
    daily_prompt_updated_at: new Date().toISOString(),
  }).eq("id", room_id);

  // 2. Post user's answer
  await db.from("messages").insert({
    room_id,
    user_id: user.id,
    body: answer.trim(),
    message_type: "user",
    moderation_status: "safe",
  });

  // 3. Create membership
  await db.from("room_members").upsert(
    { room_id, user_id: user.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  // 4. Track activation
  await db.from("activation_events").insert({
    user_id: user.id,
    event: "joined_room",
    metadata: { room_id },
  });

  // 5. Trigger bot engagement directly (don't rely on DB webhook)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://needed.chat";
  fetch(`${appUrl}/api/webhooks/room-join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-supabase-webhook-secret": (process.env.ROOM_JOIN_WEBHOOK_SECRET || "").trim(),
    },
    body: JSON.stringify({
      record: { room_id, user_id: user.id },
      icebreaker_question: icebreaker,
    }),
  }).catch(() => {}); // fire-and-forget

  return NextResponse.json({ ok: true });
}
