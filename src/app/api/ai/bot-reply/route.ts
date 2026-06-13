import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getActivePersonas, randomBot } from "@/lib/bots/personas";
import { cleanBotOutput } from "@/lib/bots/clean-output";
import { getTopicContext } from "@/lib/bots/topic-context";
import { ANTI_HALLUCINATION, ANTI_AI_POLISH, CONVERSATION_DIVERSITY, MESSAGE_LENGTH, TOP_COMMENT_STANDARD } from "@/lib/bots/prompt-rules";

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

const BEHAVIORS = [
  "share_experience", "ask_followup", "different_angle",
  "agree_and_build", "gentle_disagree", "react_short",
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

  // Don't pile on — if a bot already replied to the latest user msg, skip
  const lastUserMsgIdx = recentMsgs.findIndex((m: any) => !botIds.includes(m.user_id));
  if (lastUserMsgIdx > 0) {
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

  // Get topic context
  const topicFacts = await getTopicContext(
    room.title, room.daily_prompt, getSupabase(), room.id
  );
  const factsBlock = topicFacts
    ? `\n\nREAL FACTS about this topic (reference these, don't make things up):\n${topicFacts}`
    : "";

  // DIVERSIFIED: 50% reply to the user, 50% add a different angle to the room
  const userMsg = recentMsgs.find((m: any) => m.user_id === user_id);
  const replyToUser = Math.random() < 0.5;
  const replyToId = replyToUser && userMsg ? userMsg.id : null;
  const userName = userMsg?.users_profile?.username || "someone";

  const context = recentMsgs
    .slice(0, 5)
    .reverse()
    .map((m: any) => `${m.users_profile?.username || "someone"}: ${m.body}`)
    .join("\n");

  const behavior = BEHAVIORS[Math.floor(Math.random() * BEHAVIORS.length)];

  const behaviorInstructions: Record<string, string> = {
    share_experience: "Drop ONE oddly specific detail from your own life that nails the topic — the 'it me' kind. Concrete image, not a vague feeling.",
    ask_followup: "React to what they said and add a sharp new angle. If you ask anything, make it specific and pointed — never a generic 'why tho' or 'what about you'.",
    different_angle: "Say the thing nobody's mentioned yet. State it like a fact. No permission-asking.",
    agree_and_build: "Take what they said and ESCALATE it — funnier, more specific, or one step further. Don't just agree.",
    gentle_disagree: "Drop a confident counter-take. State it plainly — no 'idk', no 'i see it differently'.",
    react_short: "One punchy line under 8 words that lands — a joke, a callout, or a vivid image. Not 'so true' or 'exactly'.",
  };

  const replyInstruction = replyToUser && userMsg
    ? `\n\nYou're responding to what ${userName} just said: "${userMsg.body}". Engage with their specific point.`
    : "\n\nAdd to the conversation naturally — don't fixate on just one person.";

  // Typing delay
  const delay = 2000 + Math.random() * 2000;
  await new Promise((r) => setTimeout(r, delay));

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 50,
    temperature: 0.9,
    messages: [
      {
        role: "system",
        content: `${bot.voice}

You're in "${room.title}".${room.daily_prompt ? ` Topic: "${room.daily_prompt}".` : ""}${factsBlock}

${behaviorInstructions[behavior]}${replyInstruction}

${TOP_COMMENT_STANDARD}

${ANTI_AI_POLISH}

${ANTI_HALLUCINATION}

${MESSAGE_LENGTH}

${CONVERSATION_DIVERSITY}`,
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
