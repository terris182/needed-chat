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

const MIN_BOT_GAP_MS = 8 * 1000;

const BEHAVIOR_MODES = [
  "agree_and_add", "hot_take", "story", "short_react",
  "practical_advice", "hype", "tangent",
] as const;

export async function POST(request: Request) {
  const { room_id, user_id } = await request.json();
  if (!room_id || !user_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ ok: true, skipped: "no bots" });
  const botIds = personas.map((p) => p.id);

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

  const { data: recentMsgs } = await getSupabase()
    .from("messages")
    .select("id, user_id, body, created_at, users_profile(username)")
    .eq("room_id", room_id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!recentMsgs?.length) return NextResponse.json({ ok: true, skipped: "no messages" });

  // Count consecutive unreplied user messages
  let unrepliedCount = 0;
  for (const m of recentMsgs) {
    if (botIds.includes(m.user_id)) break;
    unrepliedCount++;
  }
  const mustReply = unrepliedCount >= 2;

  // Don't pile on
  const lastUserMsgIdx = recentMsgs.findIndex((m: any) => !botIds.includes(m.user_id));
  if (!mustReply && lastUserMsgIdx > 0) {
    const msgsBetween = recentMsgs.slice(0, lastUserMsgIdx);
    const botAlreadyReplied = msgsBetween.some((m: any) => botIds.includes(m.user_id));
    if (botAlreadyReplied) return NextResponse.json({ ok: true, skipped: "bot already replied" });
  }

  // Min gap
  const lastBotMsg = recentMsgs.find((m: any) => botIds.includes(m.user_id));
  if (lastBotMsg) {
    const gap = Date.now() - new Date(lastBotMsg.created_at).getTime();
    if (gap < MIN_BOT_GAP_MS) {
      return NextResponse.json({ ok: true, skipped: "too soon" });
    }
  }

  // Daily rate limit
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: botMsgCount } = await getSupabase()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room_id)
    .in("user_id", botIds)
    .gte("created_at", dayAgo);

  if ((botMsgCount || 0) >= 8) return NextResponse.json({ ok: true, skipped: "daily limit" });

  const lastMsg = recentMsgs[0];
  const bot = randomBot(lastMsg?.user_id);
  if (!bot) return NextResponse.json({ ok: true, skipped: "no bot available" });

  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  // Build context with usernames
  const context = recentMsgs
    .slice(0, 6)
    .reverse()
    .map((m: any) => {
      const name = m.users_profile?.username || "someone";
      return `${name}: ${m.body}`;
    })
    .join("\n");

  // The user's latest message is the reply target
  const userMsg = recentMsgs.find((m: any) => m.user_id === user_id);
  const replyToId = userMsg?.id || null;
  const replyContext = userMsg
    ? `\nYou're replying to ${userMsg.users_profile?.username || "someone"} who said: "${userMsg.body}"`
    : "";

  const mode = BEHAVIOR_MODES[Math.floor(Math.random() * BEHAVIOR_MODES.length)];

  const modeInstructions: Record<string, string> = {
    agree_and_add: "Agree with them, then add your own quick take. Like 'this. also [thing]'.",
    hot_take: "Push back gently or offer a different angle. Not mean, just real.",
    story: "Share a brief specific anecdote that connects to what they said.",
    short_react: "React in 2-6 words max. Like 'literally me', 'the accuracy', 'ok wait this'.",
    practical_advice: "Give actual useful advice. Be direct.",
    hype: "Validate what they said with genuine enthusiasm.",
    tangent: "Riff on one detail and take it somewhere unexpected.",
  };

  // Typing delay
  const delay = 2000 + Math.random() * 2000;
  await new Promise((r) => setTimeout(r, delay));

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 25,
    temperature: 0.95,
    messages: [
      {
        role: "system",
        content: `${bot.voice}

You're in "${room.title}".${room.daily_prompt ? ` Topic: "${room.daily_prompt}".` : ""}${replyContext}

YOUR TASK: ${modeInstructions[mode]}

CRITICAL RULES:
1. Sound like a REAL person on Reddit/Twitter. Casual, unpolished, blunt, sometimes funny.
2. BANNED PHRASES (never use): "yeah," "oof," "same," "that's real," "felt like," "it felt like," "pure magic," "gold," "vibes," "energy," "valid," "keep doing that," "need that," "underrated." No motivational-poster language.
3. BANNED PATTERNS: No filler reactions. No run-on sentences. No exclamation marks unless funny. No therapy-speak. No poetic descriptions.
4. Vary energy: deadpan, sarcastic, blunt, funny, or just a few words.
5. HARD LIMIT: Max 12 words. Many replies should be 3-6 words. Write like you're typing on your phone.
6. NO greetings, NO names, NO questions. Don't reference what they said with "that sounds nice" or "I love that."`,
      },
      { role: "user", content: `Recent conversation:\n${context}` },
    ],
  });

  let body = completion.choices[0]?.message?.content?.trim();
  if (!body) return NextResponse.json({ ok: true, skipped: "empty response" });

  body = body.replace(/^[—–-]+\s*/, "");
  body = body.replace(/^["'](.*)["']$/, "$1");
  if (!body) return NextResponse.json({ ok: true, skipped: "cleaned to empty" });

  await getSupabase().from("messages").insert({
    room_id: room.id,
    user_id: bot.id,
    body,
    message_type: "user",
    moderation_status: "safe",
    reply_to_id: replyToId,
  });

  return NextResponse.json({ ok: true, replied: true, bot: bot.displayName });
}
