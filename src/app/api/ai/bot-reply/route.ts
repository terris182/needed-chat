import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getActivePersonas, randomBot } from "@/lib/bots/personas";
import { cleanBotOutput } from "@/lib/bots/clean-output";

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
  "relatable_comparison", "self_deprecating", "detail_callout",
  "hot_take", "absurd_tangent", "short_validation", "witty_observation",
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

  // The user's latest message is the reply target — bot MUST engage with it
  const userMsg = recentMsgs.find((m: any) => m.user_id === user_id);
  const replyToId = userMsg?.id || null;
  const userSaid = userMsg?.body || "";
  const userName = userMsg?.users_profile?.username || "someone";

  // Build minimal context (just last 3 for background)
  const context = recentMsgs
    .slice(0, 3)
    .reverse()
    .map((m: any) => `${m.users_profile?.username || "someone"}: ${m.body}`)
    .join("\n");

  const mode = BEHAVIOR_MODES[Math.floor(Math.random() * BEHAVIOR_MODES.length)];

  const modeInstructions: Record<string, string> = {
    relatable_comparison: `Turn what they said into a perfect analogy. "[their thing] is the [universal experience] of [topic]." Make it so accurate people want to like it.`,
    self_deprecating: `React to what they said by confessing something embarrassing about yourself that relates. "not me [doing related embarrassing thing]."`,
    detail_callout: `Notice ONE specific detail in what they said that nobody else would catch. "the way you said [specific word/phrase] though." Make it the whole comment.`,
    hot_take: `Disagree with their specific point. "nah [why they're wrong]" or "unpopular opinion but [contrarian take on their point]." Reference their actual words.`,
    absurd_tangent: `Take one detail from their message and escalate it to something absurd/funny. "imagine if [ridiculous extension of their point]."`,
    short_validation: `Ultra-short reaction to their specific comment (2-5 words): "the accuracy", "this one wins", "screenshotting this", "ok this got me."`,
    witty_observation: `Drop a clever one-liner that reframes their point. The kind of reply that gets more likes than the original comment.`,
  };

  // Typing delay
  const delay = 2000 + Math.random() * 2000;
  await new Promise((r) => setTimeout(r, delay));

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 35,
    temperature: 0.95,
    messages: [
      {
        role: "system",
        content: `${bot.voice}

You're in "${room.title}".${room.daily_prompt ? ` Topic: "${room.daily_prompt}".` : ""}

${userName} just said: "${userSaid}"

YOUR TASK: ${modeInstructions[mode]}

You MUST engage with what they ACTUALLY said. Reference their specific words, topic, or detail.

KEY MINDSET: Write a reply that gets MORE likes than their original comment. You're performing for everyone reading, not just responding to them.

RULES:
1. Your reply should make people laugh, feel seen, or think "wait that's smart."
2. HARD LIMIT: 5-15 words. Under 10 preferred.
3. NO sad/emotional/poetic language. NO "yeah," "oof," "same." NO therapy-speak.
4. NO exclamation marks unless ironic. NO greetings. NO names.

BAD (0 likes): "that sounds nice but honestly a good cry is valid"
GOOD (10k likes): "this has the same energy as sending 'we need to talk' then falling asleep"
GOOD (10k likes): "not me reading this instead of dealing with my actual problems"`,
      },
      { role: "user", content: `Recent conversation:\n${context}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  const body = cleanBotOutput(raw);
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
