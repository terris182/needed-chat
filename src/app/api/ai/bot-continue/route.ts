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

const INACTIVITY_SLOW_MS = 2 * 60 * 1000;
const INACTIVITY_STOP_MS = 5 * 60 * 1000;
const MIN_BOT_GAP_MS = 6 * 1000;
const MAX_BOT_MESSAGES_PER_HOUR = 30;
const ACTIVE_REPLY_CHANCE = 0.85;
const SLOW_REPLY_CHANCE = 0.35;

// Behavior archetypes — randomly assigned each call for variety
const BEHAVIOR_MODES = [
  "agree_and_add",      // "this. also [own thing]"
  "hot_take",           // disagree or offer contrarian view
  "story",              // share a specific anecdote
  "short_react",        // just 2-5 words, like a real comment
  "practical_advice",   // actually helpful, not just vibes
  "hype",               // validate / gas someone up
  "tangent",            // riff on a detail, go somewhere unexpected
] as const;

export async function POST(request: Request) {
  const { room_id, last_user_message_at } = await request.json();
  if (!room_id) {
    return NextResponse.json({ error: "Missing room_id" }, { status: 400 });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ pace: "stopped", skipped: "no bots" });
  const botIds = personas.map((p) => p.id);

  // Determine pace
  const now = Date.now();
  const lastActivity = last_user_message_at ? new Date(last_user_message_at).getTime() : 0;
  const inactiveMs = lastActivity ? now - lastActivity : Infinity;

  if (inactiveMs > INACTIVITY_STOP_MS) {
    return NextResponse.json({ pace: "stopped", reason: "user inactive > 5 min" });
  }

  const pace = inactiveMs > INACTIVITY_SLOW_MS ? "slow" : "active";
  const replyChance = pace === "slow" ? SLOW_REPLY_CHANCE : ACTIVE_REPLY_CHANCE;

  if (Math.random() > replyChance) {
    return NextResponse.json({ pace, posted: false, reason: "skipped by chance" });
  }

  const { data: room } = await getSupabase()
    .from("rooms")
    .select("id, title, status, daily_prompt")
    .eq("id", room_id)
    .single();

  if (!room || !["active", "seeding"].includes(room.status)) {
    return NextResponse.json({ pace: "stopped", skipped: "room inactive" });
  }

  // Get recent messages with usernames for threading context
  const { data: recentMsgs } = await getSupabase()
    .from("messages")
    .select("id, user_id, body, created_at, reply_to_id, users_profile(username)")
    .eq("room_id", room_id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (!recentMsgs?.length) {
    return NextResponse.json({ pace, posted: false, reason: "no messages" });
  }

  // Check min gap
  const lastBotMsg = recentMsgs.find((m: any) => botIds.includes(m.user_id));
  if (lastBotMsg) {
    const lastBotTime = new Date(lastBotMsg.created_at).getTime();
    if (now - lastBotTime < MIN_BOT_GAP_MS) {
      return NextResponse.json({ pace, posted: false, reason: "too soon after last bot msg" });
    }
  }

  // Hourly rate limit
  const hourAgo = new Date(now - 3600 * 1000).toISOString();
  const { count: botMsgCount } = await getSupabase()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room_id)
    .in("user_id", botIds)
    .gte("created_at", hourAgo);

  if ((botMsgCount || 0) >= MAX_BOT_MESSAGES_PER_HOUR) {
    return NextResponse.json({ pace: "slow", posted: false, reason: "hourly limit" });
  }

  // Pick a bot that didn't send the last message
  const lastMsg = recentMsgs[0];
  const bot = randomBot(lastMsg?.user_id);
  if (!bot) return NextResponse.json({ pace, posted: false, reason: "no bot available" });

  // Ensure bot is a member
  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  // Pick a random behavior mode
  const mode = BEHAVIOR_MODES[Math.floor(Math.random() * BEHAVIOR_MODES.length)];

  // Decide whether to reply to a specific message (60% chance) or the room generally
  const nonBotMsgs = recentMsgs.filter((m: any) => !botIds.includes(m.user_id));
  const replyTarget = (Math.random() < 0.6 && nonBotMsgs.length > 0)
    ? nonBotMsgs[Math.floor(Math.random() * Math.min(nonBotMsgs.length, 3))]
    : (Math.random() < 0.4 && recentMsgs.length > 1)
      ? recentMsgs[Math.floor(Math.random() * Math.min(recentMsgs.length, 4))]
      : null;

  // Build conversation context — only last 4 messages to reduce style contamination
  const context = recentMsgs
    .slice(0, 4)
    .reverse()
    .map((m: any) => {
      const name = m.users_profile?.username || "someone";
      return `${name}: ${m.body}`;
    })
    .join("\n");

  const replyContext = replyTarget
    ? `\n\nYou're replying specifically to ${replyTarget.users_profile?.username || "someone"} who said: "${replyTarget.body}"`
    : "";

  const icebreakerContext = room.daily_prompt
    ? ` The room's topic/question is: "${room.daily_prompt}".`
    : "";

  // Mode-specific instruction
  const modeInstructions: Record<string, string> = {
    agree_and_add: "Agree with something someone said, then add your own quick take or experience. Like 'this. i [your thing]' or 'exactly — [your addition]'.",
    hot_take: "Disagree or offer a contrarian perspective. Not mean, just a different angle. Like 'idk i think [opposite view]' or 'unpopular opinion but [take]'.",
    story: "Share a brief, specific anecdote from your life that connects to the conversation. One detail that makes it real.",
    short_react: "Just react in 2-6 words. Like 'literally me', 'this is so real', 'ok wait what', 'not me reading this at 2am', 'the accuracy'. Keep it VERY short.",
    practical_advice: "Give actual useful advice or perspective, not just vibes. Be direct and helpful. Like 'honestly just [practical thing]' or 'what worked for me was [specific]'.",
    hype: "Gas someone up. Validate what they said with enthusiasm. Like 'no because you're so right', 'say it louder', 'this needs more upvotes'.",
    tangent: "Riff on one specific detail from the conversation and take it somewhere unexpected or funny.",
  };

  const systemPrompt = `${bot.voice}

You're in "${room.title}".${icebreakerContext}

YOUR TASK: ${modeInstructions[mode]}${replyContext}

CRITICAL RULES:
1. DO NOT imitate the tone of the conversation history. It may be overly poetic/emotional — that's NOT what you should sound like. Write like a real Reddit/Twitter commenter instead.
2. BANNED WORDS: yeah, oof, same, real, felt like, vibe, vibes, energy, valid, underrated, magic, gold, weight, raw, brave, whole. Also banned: similes, metaphors, "walking [noun]", "just [verb]".
3. HARD LIMIT: 3-10 words. NOT 11+. Count before answering. If over 10 words, CUT IT DOWN.
4. Vary energy: deadpan, sarcastic, blunt, funny. Most real comments are 3-6 words and imperfect.
5. NO exclamation marks. NO greetings. NO names. NO questions. NO "I feel" or "I think."

BAD (do NOT write like this): "last week i went to a coffee shop and watched the rain hit the window"
BAD: "that sounds nice but honestly a good cry in the shower is just as valid"
GOOD: "literally me at 2am"
GOOD: "ok but why is this so accurate"
GOOD: "counterpoint: cereal for dinner slaps"
GOOD: "the bar is on the floor"
GOOD: "nah you're overthinking it"`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 25,
    temperature: 0.95,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Recent conversation:\n${context}` },
    ],
  });

  let body = completion.choices[0]?.message?.content?.trim();
  if (!body) return NextResponse.json({ pace, posted: false, reason: "empty response" });

  // Clean up
  body = body.replace(/^[—–-]+\s*/, "");
  // Remove wrapping quotes
  body = body.replace(/^["'](.*)["']$/, "$1");
  if (!body) return NextResponse.json({ pace, posted: false, reason: "cleaned to empty" });

  await getSupabase().from("messages").insert({
    room_id: room.id,
    user_id: bot.id,
    body,
    message_type: "user",
    moderation_status: "safe",
    reply_to_id: replyTarget?.id || null,
  });

  return NextResponse.json({ pace, posted: true, bot: bot.displayName });
}
