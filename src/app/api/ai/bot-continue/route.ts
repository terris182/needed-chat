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

const INACTIVITY_SLOW_MS = 2 * 60 * 1000;  // 2 min → slow pace
const INACTIVITY_STOP_MS = 5 * 60 * 1000;  // 5 min → stop entirely
const MIN_BOT_GAP_MS = 6 * 1000;           // min 6s between bot messages
const MAX_BOT_MESSAGES_PER_HOUR = 30;
const ACTIVE_REPLY_CHANCE = 0.75;
const SLOW_REPLY_CHANCE = 0.3;

// Called periodically by the client to keep bots chatting at a natural pace
export async function POST(request: Request) {
  const { room_id, last_user_message_at } = await request.json();
  if (!room_id) {
    return NextResponse.json({ error: "Missing room_id" }, { status: 400 });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ pace: "stopped", skipped: "no bots" });
  const botIds = personas.map((p) => p.id);

  // Determine pace based on user inactivity
  const now = Date.now();
  const lastActivity = last_user_message_at ? new Date(last_user_message_at).getTime() : 0;
  const inactiveMs = lastActivity ? now - lastActivity : Infinity;

  if (inactiveMs > INACTIVITY_STOP_MS) {
    return NextResponse.json({ pace: "stopped", reason: "user inactive > 5 min" });
  }

  const pace = inactiveMs > INACTIVITY_SLOW_MS ? "slow" : "active";
  const replyChance = pace === "slow" ? SLOW_REPLY_CHANCE : ACTIVE_REPLY_CHANCE;

  // Roll the dice — don't post every time
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

  // Get recent messages
  const { data: recentMsgs } = await getSupabase()
    .from("messages")
    .select("user_id, body, created_at")
    .eq("room_id", room_id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (!recentMsgs?.length) {
    return NextResponse.json({ pace, posted: false, reason: "no messages" });
  }

  // Check min gap — don't post if a bot posted recently
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

  // Build conversation context
  const context = recentMsgs
    .slice(0, 8)
    .reverse()
    .map((m: any) => {
      const isBot = botIds.includes(m.user_id);
      return `someone: ${m.body}`;
    })
    .join("\n");

  // Determine if user has spoken — adjust prompt accordingly
  const userHasSpoken = recentMsgs.some((m: any) => !botIds.includes(m.user_id));
  const icebreakerContext = room.daily_prompt
    ? ` The room's icebreaker is: "${room.daily_prompt}".`
    : "";

  let systemPrompt: string;
  if (userHasSpoken) {
    systemPrompt = `${bot.voice}\n\nYou're in an anonymous chat room called "${room.title}".${icebreakerContext} This is immersive storytelling through chat — like The Breakfast Club unfolding in real-time through messages. Someone just revealed something about their life. Let it spark a SCENE from yours — not a reaction, a scene. Put us there. What you saw, heard, felt. Your story should interlock with theirs like puzzle pieces from different boxes that somehow fit. Build the narrative — each message should make people want to read the next one. Be vivid, surprising, honest. No therapy-speak, no greetings, no names, no questions. 2-3 sentences that read like the best page in a novel.`;
  } else {
    // Bots chatting among themselves — building the world before user engages
    systemPrompt = `${bot.voice}\n\nYou're in an anonymous chat room called "${room.title}".${icebreakerContext} This is immersive storytelling — a few strangers' stories are starting to collide, like the first act of a movie where you realize all these people are connected in ways they don't see yet. Pick up a thread from what someone else said and weave YOUR story into it. Tell a specific moment — not a summary. A scene. Drop a detail that makes people curious about what happened next. Your story should feel like it's ABOUT the same thing as theirs but from a completely different angle. No questions, no greetings, no names. 2-3 sentences that make this chat feel like turning pages.`;
  }

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 120,
    temperature: 0.85,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Recent conversation:\n${context}` },
    ],
  });

  const body = completion.choices[0]?.message?.content?.trim();
  if (!body) return NextResponse.json({ pace, posted: false, reason: "empty response" });

  await getSupabase().from("messages").insert({
    room_id: room.id,
    user_id: bot.id,
    body,
    message_type: "user",
    moderation_status: "safe",
  });

  return NextResponse.json({ pace, posted: true, bot: bot.displayName });
}
