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

const BOT_MESSAGES_PER_ROOM_PER_DAY = 4;
const MIN_SILENCE_HOURS = 4;

// Vercel Cron: every 3 hours
// vercel.json: { "path": "/api/cron/bot-activity", "schedule": "0 */3 * * *" }
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ ok: true, skipped: "no bots configured" });

  const botIds = personas.map((p) => p.id);
  const silenceCutoff = new Date(Date.now() - MIN_SILENCE_HOURS * 3600 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Get rooms with human activity in last 7 days
  const { data: rooms } = await getSupabase()
    .from("rooms")
    .select("id, title, slug")
    .in("status", ["active", "seeding"])
    .limit(20);

  if (!rooms?.length) return NextResponse.json({ ok: true, messages_posted: 0 });

  let posted = 0;

  for (const room of rooms) {
    // Check bot message count today
    const { count: botMsgCount } = await getSupabase()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .in("user_id", botIds)
      .gte("created_at", dayAgo);

    if ((botMsgCount || 0) >= BOT_MESSAGES_PER_ROOM_PER_DAY) continue;

    // Check last message — skip if humans were recently active
    const { data: lastMsgs } = await getSupabase()
      .from("messages")
      .select("user_id, body, created_at")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .limit(8);

    if (!lastMsgs?.length) continue;

    const lastMsg = lastMsgs[0];
    // Skip if last message was recent (human or bot) — let humans breathe
    if (lastMsg.created_at > silenceCutoff) continue;

    // Skip if last message was already a bot and only bots have talked recently
    const recentHumanMsg = lastMsgs.find((m: any) => !botIds.includes(m.user_id));
    if (!recentHumanMsg) continue; // Only post if humans have participated

    // Pick a bot that didn't send the last message
    const bot = randomBot(lastMsg.user_id);
    if (!bot) continue;

    // Ensure bot is a room member
    await getSupabase().from("room_members").upsert(
      { room_id: room.id, user_id: bot.id, role: "member" },
      { onConflict: "room_id,user_id" }
    );

    // Build context from recent messages
    const context = lastMsgs
      .slice(0, 6)
      .reverse()
      .map((m: any) => {
        const who = botIds.includes(m.user_id) ? "someone" : "someone";
        return `${who}: ${m.body}`;
      })
      .join("\n");

    // Generate bot message
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 120,
      temperature: 0.85,
      messages: [
        {
          role: "system",
          content: `${bot.voice}\n\nYou're in an anonymous chat room called "${room.title}". This is immersive storytelling through chat. The conversation has been quiet. Drop back in with a new piece of YOUR story — something that's been on your mind, told like a scene. Vivid, specific, make the reader curious. No greetings, no names, no questions. 2-3 sentences that feel like opening a new chapter.`,
        },
        {
          role: "user",
          content: `Recent conversation:\n${context}\n\nContinue naturally as ${bot.displayName}:`,
        },
      ],
    });

    const body = completion.choices[0]?.message?.content?.trim();
    if (!body) continue;

    await getSupabase().from("messages").insert({
      room_id: room.id,
      user_id: bot.id,
      body,
      message_type: "user",
      moderation_status: "safe",
    });

    posted++;
  }

  return NextResponse.json({ ok: true, messages_posted: posted });
}
