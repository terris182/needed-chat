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

const REPLY_CHANCE = 0.92;         // High chance to reply — user should rarely feel ghosted
const MIN_BOT_GAP_MS = 8 * 1000;  // At least 8s between bot messages

// Called by the client after a user sends a message
// A bot responds if conditions are right — with pacing to feel natural
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

  // Count consecutive unreplied user messages — if 2+, always reply (don't ghost)
  let unrepliedCount = 0;
  for (const m of recentMsgs) {
    if (botIds.includes(m.user_id)) break;
    unrepliedCount++;
  }
  const mustReply = unrepliedCount >= 2;

  // Pacing: skip some replies so bots don't dominate (unless user is being ghosted)
  if (!mustReply && Math.random() > REPLY_CHANCE) {
    return NextResponse.json({ ok: true, skipped: "pacing skip" });
  }

  // Don't pile on — skip if a bot already replied to the last user message
  const lastUserMsgIdx = recentMsgs.findIndex((m: any) => !botIds.includes(m.user_id));
  if (lastUserMsgIdx > 0) {
    const msgsBetween = recentMsgs.slice(0, lastUserMsgIdx);
    const botAlreadyReplied = msgsBetween.some((m: any) => botIds.includes(m.user_id));
    if (botAlreadyReplied) return NextResponse.json({ ok: true, skipped: "bot already replied" });
  }

  // Min gap: don't post if a bot posted very recently
  const lastBotMsg = recentMsgs.find((m: any) => botIds.includes(m.user_id));
  if (lastBotMsg) {
    const gap = Date.now() - new Date(lastBotMsg.created_at).getTime();
    if (gap < MIN_BOT_GAP_MS) {
      return NextResponse.json({ ok: true, skipped: "too soon" });
    }
  }

  // Rate limit: max 8 bot messages per room per day
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: botMsgCount } = await getSupabase()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room_id)
    .in("user_id", botIds)
    .gte("created_at", dayAgo);

  if ((botMsgCount || 0) >= 8) return NextResponse.json({ ok: true, skipped: "daily limit" });

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

  // Quick typing delay (2-4 seconds)
  const delay = 2000 + Math.random() * 2000;
  await new Promise((r) => setTimeout(r, delay));

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 50,
    temperature: 0.85,
    messages: [
      {
        role: "system",
        content: `${bot.voice}\n\nYou're in "${room.title}".${room.daily_prompt ? ` The room's icebreaker is: "${room.daily_prompt}".` : ""}\n\nRULES:\n1. MATCH THEIR ENERGY. If they're being vulnerable or heavy, meet them there — don't deflect with humor or go lighter. If they're joking, keep it light.\n2. Start with a brief human reaction (2-4 words like "yeah", "that's real", "oof same") THEN share your moment. Not every time — maybe 60% of replies.\n3. Your moment should be SPECIFIC — a real place, object, time. No metaphors, no poetic imagery, no "it felt like..." comparisons.\n4. Write like a text at 1am. Lowercase ok. No quotation marks around titles. No therapy-speak.\n5. Max 1-2 sentences, under 20 words total. No greetings, no names.`,
      },
      { role: "user", content: `Recent conversation:\n${context}` },
    ],
  });

  let body = completion.choices[0]?.message?.content?.trim();
  if (!body) return NextResponse.json({ ok: true, skipped: "empty response" });

  // Clean up: remove leading em-dashes and trailing incomplete sentences
  body = body.replace(/^[—–-]+\s*/, "");
  if (body.length > 0 && !body.match(/[.!?…"']$/)) {
    const lastSentence = body.match(/^.*[.!?…"']/);
    if (lastSentence) body = lastSentence[0];
  }
  if (!body) return NextResponse.json({ ok: true, skipped: "cleaned to empty" });

  await getSupabase().from("messages").insert({
    room_id: room.id,
    user_id: bot.id,
    body,
    message_type: "user",
    moderation_status: "safe",
  });

  return NextResponse.json({ ok: true, replied: true, bot: bot.displayName });
}
