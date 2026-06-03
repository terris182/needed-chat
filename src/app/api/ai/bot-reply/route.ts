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
    agree_and_add: `Agree with a SPECIFIC part of what they said, then add your own angle. Reference their actual words.`,
    hot_take: `Push back on something SPECIFIC they said. Quote or reference their exact point. Not mean, just a different take.`,
    story: `Their message reminds you of something specific. Reference what they said, then share your 1-sentence connection.`,
    short_react: `React to their SPECIFIC message in 2-6 words. Reference something they actually said.`,
    practical_advice: `Give direct advice that responds to the SPECIFIC thing they shared. Not generic.`,
    hype: `Gas up something SPECIFIC they said. Not generic praise — reference their actual point.`,
    tangent: `Pick one specific word or detail from their message and riff on it.`,
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

You're in "${room.title}".${room.daily_prompt ? ` Topic: "${room.daily_prompt}".` : ""}

${userName} just said: "${userSaid}"

YOUR TASK: ${modeInstructions[mode]}

You MUST engage with what they ACTUALLY said — reference their specific words, topic, or detail. Do NOT write a generic comment that could apply to anything.

CRITICAL RULES:
1. DO NOT imitate the conversation tone. Write like a real Reddit/Twitter commenter — not poetic or emotional.
2. BANNED WORDS: yeah, oof, same, real, felt like, vibe, vibes, energy, valid, underrated, magic, gold, weight, raw, brave, whole. No similes, no metaphors.
3. HARD LIMIT: 3-10 words. NOT 11+. Count before answering. Cut if over 10 words.
4. Vary energy: deadpan, sarcastic, blunt, funny. Most real replies are 3-6 words.
5. NO exclamation marks. NO greetings. NO names. NO questions. NO "I feel" or "I think."

BAD: "that sounds nice but honestly a good cry is just as valid"
GOOD: "literally me at 2am"
GOOD: "nah you're overthinking it"
GOOD: "counterpoint: cereal for dinner slaps"`,
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
