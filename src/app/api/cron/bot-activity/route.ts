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

const BOT_MESSAGES_PER_ROOM_PER_DAY = 4;
const MIN_SILENCE_HOURS = 4;

// Vercel Cron: every 3 hours
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

  const { data: rooms } = await getSupabase()
    .from("rooms")
    .select("id, title, slug, daily_prompt")
    .in("status", ["active", "seeding"])
    .limit(20);

  if (!rooms?.length) return NextResponse.json({ ok: true, messages_posted: 0 });

  let posted = 0;

  for (const room of rooms) {
    const { count: botMsgCount } = await getSupabase()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .in("user_id", botIds)
      .gte("created_at", dayAgo);

    if ((botMsgCount || 0) >= BOT_MESSAGES_PER_ROOM_PER_DAY) continue;

    const { data: lastMsgs } = await getSupabase()
      .from("messages")
      .select("id, user_id, body, created_at, users_profile(username)")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .limit(8);

    if (!lastMsgs?.length) continue;
    const lastMsg = lastMsgs[0];
    if (lastMsg.created_at > silenceCutoff) continue;
    const recentHumanMsg = lastMsgs.find((m: any) => !botIds.includes(m.user_id));
    if (!recentHumanMsg) continue;

    const bot = randomBot(lastMsg.user_id);
    if (!bot) continue;

    await getSupabase().from("room_members").upsert(
      { room_id: room.id, user_id: bot.id, role: "member" },
      { onConflict: "room_id,user_id" }
    );

    const context = lastMsgs
      .slice(0, 6)
      .reverse()
      .map((m: any) => {
        const name = m.users_profile?.username || "someone";
        return `${name}: ${m.body}`;
      })
      .join("\n");

    // Pick a message to reply to (prefer human messages)
    const humanMsg = lastMsgs.find((m: any) => !botIds.includes(m.user_id));
    const replyTarget = Math.random() < 0.5 ? humanMsg : null;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 35,
      temperature: 0.95,
      messages: [
        {
          role: "system",
          content: `${bot.voice}\n\nYou're in "${room.title}".${room.daily_prompt ? ` Topic: "${room.daily_prompt}".` : ""} It's been quiet.${replyTarget ? ` You're replying to ${replyTarget.users_profile?.username || "someone"} who said: "${replyTarget.body}"` : ""}\n\nDrop something from YOUR life. Sound like a real Reddit/Twitter comment — casual, blunt, maybe funny. BANNED: "yeah," "oof," "same," "that's real," "felt like," "vibes," "valid," "underrated," exclamation marks, therapy-speak. HARD LIMIT: Max 12 words. No greetings, no names.`,
        },
        { role: "user", content: `Recent conversation:\n${context}` },
      ],
    });

    const body = cleanBotOutput(completion.choices[0]?.message?.content);
    if (!body) continue;

    await getSupabase().from("messages").insert({
      room_id: room.id, user_id: bot.id, body,
      message_type: "user", moderation_status: "safe",
      reply_to_id: replyTarget?.id || null,
    });

    posted++;
  }

  return NextResponse.json({ ok: true, messages_posted: posted });
}
