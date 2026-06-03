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

const INACTIVITY_SLOW_MS = 2 * 60 * 1000;
const INACTIVITY_STOP_MS = 5 * 60 * 1000;
const MIN_BOT_GAP_MS = 6 * 1000;
const MAX_BOT_MESSAGES_PER_HOUR = 30;
const ACTIVE_REPLY_CHANCE = 0.85;
const SLOW_REPLY_CHANCE = 0.35;

// Behavior archetypes — randomly assigned each call for variety
const BEHAVIOR_MODES = [
  "relatable_comparison",  // "[thing] is the [universal experience] of [topic]"
  "self_deprecating",      // "not me [embarrassing relatable thing]"
  "detail_callout",        // "nobody's talking about [specific detail]"
  "hot_take",              // "unpopular opinion but [contrarian view]"
  "absurd_tangent",        // "imagine if [ridiculous escalation]"
  "short_validation",      // "the accuracy" / "this one got me" (2-5 words)
  "witty_observation",     // clever one-liner about specific content
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
  // Top-commenter patterns modeled after most-liked comments on Reddit/YouTube/X
  const modeInstructions: Record<string, string> = {
    relatable_comparison: "Map something from the conversation to a universally relatable experience. Format: '[thing] is the [everyday thing everyone knows]' or 'this has the same energy as [relatable situation]'. The comparison should make people go 'omg that's so accurate'. Example: 'Lucas is the friend who tells you to drink water at 3am'.",
    self_deprecating: "Make a confessional joke about yourself that everyone secretly relates to. Format: 'not me [embarrassing thing]' or 'me [doing relatable thing] instead of [thing I should be doing]'. Example: 'not me reading this at 2am pretending i don't have work in 4 hours'.",
    detail_callout: "Notice ONE specific detail in the conversation nobody else mentioned and make it the whole comment. Format: 'nobody's talking about [detail]' or 'ok but [specific thing]'. Example: 'the way he said our and not my though'.",
    hot_take: "Drop a contrarian opinion that starts a debate. Format: 'unpopular opinion but [take]' or 'nah i'm gonna push back — [reason]'. Not trolling, just a genuinely different angle.",
    absurd_tangent: "Take one detail and escalate it to something ridiculous/funny. Format: 'imagine if [absurd extension]' or 'somebody needs to [ridiculous suggestion]'. Example: 'imagine if the buzzkills formed a band'.",
    short_validation: "Ultra-short reaction (2-5 words) that captures what everyone felt. Pick from: 'the accuracy', 'this one got me', 'finally someone said it', 'ok this wins', 'screenshotting this'. Just the reaction, nothing else.",
    witty_observation: "Drop a clever one-liner that reframes something from the conversation. The kind of comment that makes people pause and think 'wait that's actually smart'. Brief and sharp.",
  };

  const systemPrompt = `${bot.voice}

You're in "${room.title}".${icebreakerContext}

YOUR TASK: ${modeInstructions[mode]}${replyContext}

KEY MINDSET: You're writing a comment that OTHER PEOPLE will want to like. You're performing for the audience, not just expressing yourself. Think: "what comment would get the most likes in this thread?"

RULES:
1. IGNORE the tone of existing messages. They may be bad. Write like a TOP-LIKED comment on Reddit/YouTube instead.
2. Your comment should make people laugh, feel seen, or think "wait that's actually smart."
3. HARD LIMIT: 5-15 words. Under 10 preferred.
4. NO sad/emotional/poetic language. NO "yeah," "oof," "same." NO therapy-speak. NO storytelling about your personal life.
5. NO exclamation marks unless ironic. NO greetings. NO names.

BAD (0 likes): "last week i went to a coffee shop and watched the rain"
BAD (0 likes): "that sounds nice but honestly a good cry is just as valid"  
GOOD (10k likes): "this has the same energy as sending 'we need to talk' then falling asleep"
GOOD (10k likes): "not me reading this at 2am pretending i don't have work"
GOOD (10k likes): "nobody's talking about the fact that he said our and not my"`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 25,
    temperature: 0.95,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Recent conversation:\n${context}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  const body = cleanBotOutput(raw);
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
