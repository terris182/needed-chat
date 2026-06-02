import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getActivePersonas, randomBot } from "@/lib/bots/personas";

let _supabase: any = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return _supabase;
}

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// Called by the client after a user sends a message
// A bot responds if conditions are right
export async function POST(request: Request) {
  const { room_id, user_id } = await request.json();
  if (!room_id || !user_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ ok: true, skipped: "no bots" });

  const botIds = personas.map((p) => p.id);

  // Don't reply to bots
  if (botIds.includes(user_id)) {
    return NextResponse.json({ ok: true, skipped: "bot message" });
  }

  const { data: room } = await getSupabase()
    .from("rooms")
    .select("id, title, status, daily_prompt")
    .eq("id", room_id)
    .single();

  if (!room || !["active", "seeding"].includes(room.status)) {
    return NextResponse.json({ ok: true, skipped: "room inactive" });
  }

  // Get recent messages for context
  const { data: recentMsgs } = await getSupabase()
    .from("messages")
    .select("user_id, body, created_at")
    .eq("room_id", room_id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!recentMsgs?.length) return NextResponse.json({ ok: true, skipped: "no messages" });

  // Don't pile on — skip if a bot already replied to the last user message
  const lastUserMsgIdx = recentMsgs.findIndex((m: any) => !botIds.includes(m.user_id));
  if (lastUserMsgIdx > 0) {
    const msgsBetween = recentMsgs.slice(0, lastUserMsgIdx);
    const botAlreadyReplied = msgsBetween.some((m: any) => botIds.includes(m.user_id));
    if (botAlreadyReplied) return NextResponse.json({ ok: true, skipped: "bot already replied" });
  }

  // Rate limit: max 6 bot messages per room per day
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: botMsgCount } = await getSupabase()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room_id)
    .in("user_id", botIds)
    .gte("created_at", dayAgo);

  if ((botMsgCount || 0) >= 6) return NextResponse.json({ ok: true, skipped: "daily limit" });

  // Pick a bot that didn't send the last message
  const lastMsg = recentMsgs[0];
  const bot = randomBot(lastMsg?.user_id);
  if (!bot) return NextResponse.json({ ok: true, skipped: "no bot available" });

  // Ensure bot is a member
  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  // Build conversation context
  const context = recentMsgs
    .slice(0, 6)
    .reverse()
    .map((m: any) => `someone: ${m.body}`)
    .join("\n");

  // Small delay to feel natural (1-3 seconds)
  const delay = 1000 + Math.random() * 2000;
  await new Promise((r) => setTimeout(r, delay));

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 80,
    temperature: 0.85,
    messages: [
      {
        role: "system",
        content: `${bot.voice}\n\nYou're in an anonymous peer support chat room called "${room.title}". Someone just shared something. Share your own experience or reaction — focus on YOUR story first. If what they said connects to something you've been through, briefly acknowledge it then share your own thing. Don't ask questions. Don't be a therapist. Just be a person in the room sharing alongside them. No greetings, no names.`,
      },
      { role: "user", content: `Recent conversation:\n${context}` },
    ],
  });

  const body = completion.choices[0]?.message?.content?.trim();
  if (!body) return NextResponse.json({ ok: true, skipped: "empty response" });

  await getSupabase().from("messages").insert({
    room_id: room.id,
    user_id: bot.id,
    body,
    message_type: "user",
    moderation_status: "safe",
  });

  return NextResponse.json({ ok: true, replied: true, bot: bot.displayName });
}
