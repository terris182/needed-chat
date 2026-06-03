import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getActivePersonas, randomBot } from "@/lib/bots/personas";
import { cleanBotOutput } from "@/lib/bots/clean-output";
import { getTopicContext } from "@/lib/bots/topic-context";

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

// Conversation behaviors — what the bot does in this turn
const BEHAVIORS = [
  "share_experience",    // share something from their own life related to topic
  "ask_followup",        // ask a genuine question about what someone said
  "different_angle",     // bring up a different aspect of the topic
  "agree_and_build",     // agree with someone and add to it
  "gentle_disagree",     // respectfully offer a different take
  "react_short",         // brief natural reaction (2-6 words)
] as const;

export async function POST(request: Request) {
  const { room_id, last_user_message_at } = await request.json();
  if (!room_id) {
    return NextResponse.json({ error: "Missing room_id" }, { status: 400 });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ pace: "stopped", skipped: "no bots" });
  const botIds = personas.map((p) => p.id);

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
      return NextResponse.json({ pace, posted: false, reason: "too soon" });
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

  const lastMsg = recentMsgs[0];
  const bot = randomBot(lastMsg?.user_id);
  if (!bot) return NextResponse.json({ pace, posted: false, reason: "no bot available" });

  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  // Get topic context for grounding
  const topicFacts = await getTopicContext(
    room.title, room.daily_prompt, getSupabase(), room.id
  );
  const factsBlock = topicFacts
    ? `\n\nREAL FACTS about this topic (reference these, don't make things up):\n${topicFacts}`
    : "";

  const behavior = BEHAVIORS[Math.floor(Math.random() * BEHAVIORS.length)];

  // DIVERSIFIED reply targeting:
  // 30% reply to a human message, 25% reply to a bot message,
  // 45% no reply target (general room comment / new angle)
  const nonBotMsgs = recentMsgs.filter((m: any) => !botIds.includes(m.user_id));
  const botMsgs = recentMsgs.filter((m: any) => botIds.includes(m.user_id) && m.user_id !== bot.id);

  let replyTarget: any = null;
  const roll = Math.random();
  if (roll < 0.30 && nonBotMsgs.length > 0) {
    replyTarget = nonBotMsgs[Math.floor(Math.random() * Math.min(nonBotMsgs.length, 3))];
  } else if (roll < 0.55 && botMsgs.length > 0) {
    replyTarget = botMsgs[Math.floor(Math.random() * Math.min(botMsgs.length, 3))];
  }
  // else: no reply target, bot adds to the room generally

  const context = recentMsgs
    .slice(0, 6)
    .reverse()
    .map((m: any) => {
      const name = m.users_profile?.username || "someone";
      return `${name}: ${m.body}`;
    })
    .join("\n");

  const replyContext = replyTarget
    ? `\n\nYou're replying to ${replyTarget.users_profile?.username || "someone"} who said: "${replyTarget.body}"`
    : "";

  const behaviorInstructions: Record<string, string> = {
    share_experience: "Share something from your own life or experience related to the topic. Be specific — a real moment, place, or detail.",
    ask_followup: "Ask a genuine follow-up question about something someone said. Show real curiosity.",
    different_angle: "Bring up a different aspect of the topic that nobody has mentioned yet. Use real facts if you have them.",
    agree_and_build: "Agree with something someone said and add your own related thought or experience on top.",
    gentle_disagree: "Offer a different perspective. Not confrontational — just 'I actually see it differently because...'",
    react_short: "Give a brief, natural reaction to the conversation. 3-8 words. Something genuine, not performative.",
  };

  const icebreakerContext = room.daily_prompt
    ? ` The room's topic/question is: "${room.daily_prompt}".`
    : "";

  const systemPrompt = `${bot.voice}

You're in "${room.title}".${icebreakerContext}${factsBlock}

YOUR TASK: ${behaviorInstructions[behavior]}${replyContext}

RULES:
1. Sound like a real person in a group chat, not a commenter performing for likes.
2. Be specific — reference real things, not vague generalities.
3. Max 20 words, 1-2 sentences. Under 12 preferred.
4. No therapy-speak, no poetic language, no exclamation marks.
5. No greetings, no names. Lowercase ok.
6. If you reference the topic, use REAL facts from the context above.`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 50,
    temperature: 0.9,
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
