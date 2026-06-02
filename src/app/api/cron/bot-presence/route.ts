import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getActivePersonas, randomBot, randomBots } from "@/lib/bots/personas";

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

// Vercel Cron: every 10 minutes
// vercel.json: { "path": "/api/cron/bot-presence", "schedule": "*/10 * * * *" }
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ ok: true, skipped: "no bots configured" });

  const botIds = personas.map((p) => p.id);
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // Find rooms where a non-bot user joined in the last 15 min
  const { data: newMembers } = await getSupabase()
    .from("room_members")
    .select("room_id, user_id, joined_at")
    .gte("joined_at", fifteenMinAgo)
    .not("user_id", "in", `(${botIds.join(",")})`)
    .limit(10);

  if (!newMembers?.length) return NextResponse.json({ ok: true, rooms_seeded: 0 });

  // Deduplicate by room
  const roomIds = [...new Set(newMembers.map((m: any) => m.room_id))];
  let seeded = 0;

  for (const roomId of roomIds) {
    const { data: room } = await getSupabase()
      .from("rooms")
      .select("id, title, slug, status")
      .eq("id", roomId)
      .single();

    if (!room || !["active", "seeding"].includes(room.status)) continue;

    // Get message count and last few messages
    const { data: existingMsgs } = await getSupabase()
      .from("messages")
      .select("user_id, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(10);

    const msgCount = existingMsgs?.length || 0;

    // Check if bots already responded to this new arrival recently
    const recentBotMsg = existingMsgs?.find(
      (m: any) => botIds.includes(m.user_id) && m.created_at > fifteenMinAgo
    );
    if (recentBotMsg) continue; // Already responded

    if (msgCount < 3) {
      // Room is nearly empty — seed with a 2-bot exchange to give it life
      await seedEmptyRoom(room, personas, botIds);
    } else {
      // Room has history — one bot continues naturally (subtle, not a greeting)
      await continueExistingConvo(room, existingMsgs, botIds);
    }
    seeded++;
  }

  return NextResponse.json({ ok: true, rooms_seeded: seeded });
}

async function seedEmptyRoom(room: any, personas: any[], botIds: string[]) {
  const bots = randomBots(3);
  if (bots.length < 2) return;

  // Ensure all bots are members
  await getSupabase().from("room_members").upsert(
    bots.map((b) => ({ room_id: room.id, user_id: b.id, role: "member" })),
    { onConflict: "room_id,user_id" }
  );

  const questionContext = room.daily_prompt
    ? `The room's icebreaker question is: "${room.daily_prompt}". Answer it honestly from YOUR experience.`
    : `Share one short, real thing you're carrying related to "${room.title}".`;

  // Bot 1: answers the icebreaker
  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: [{ role: "system", content: `${bots[0].voice}\n\nYou're in an anonymous chat room called "${room.title}". ${questionContext} Focus on YOUR answer. No greetings, no names.` }],
  });
  const body1 = r1.choices[0]?.message?.content?.trim();
  if (!body1) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bots[0].id, body: body1, message_type: "user", moderation_status: "safe" });

  await new Promise((r) => setTimeout(r, 1500));

  // Bot 2: answers the same question, brief nod to bot 1 if it relates
  const r2 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: [
      { role: "system", content: `${bots[1].voice}\n\nYou're in an anonymous chat room called "${room.title}". ${questionContext} Focus on YOUR answer first. If what someone else said connects, briefly acknowledge it then share YOUR thing. No questions, no therapizing. No greetings, no names.` },
      { role: "user", content: `Someone else said: ${body1}` },
    ],
  });
  const body2 = r2.choices[0]?.message?.content?.trim();
  if (!body2) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bots[1].id, body: body2, message_type: "user", moderation_status: "safe" });

  if (bots.length >= 3) {
    await new Promise((r) => setTimeout(r, 2000));

    // Bot 3: answers the icebreaker, can lightly reference others
    const r3 = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
      messages: [
        { role: "system", content: `${bots[2].voice}\n\nYou're in an anonymous chat room called "${room.title}". ${questionContext} Focus on YOUR answer first. A couple others have shared. If their experiences resonate, a brief nod is fine, then share YOUR experience. No questions, no therapizing. No greetings, no names.` },
        { role: "user", content: `Others said:\n- ${body1}\n- ${body2}` },
      ],
    });
    const body3 = r3.choices[0]?.message?.content?.trim();
    if (body3) {
      await getSupabase().from("messages").insert({ room_id: room.id, user_id: bots[2].id, body: body3, message_type: "user", moderation_status: "safe" });
    }
  }
}

async function continueExistingConvo(room: any, messages: any[], botIds: string[]) {
  const lastMsg = messages[0];
  const bot = randomBot(lastMsg?.user_id);
  if (!bot) return;

  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  const context = messages
    .slice(0, 5)
    .reverse()
    .map((m: any) => `someone: ${m.body}`)
    .join("\n");

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 70,
    temperature: 0.85,
    messages: [
      {
        role: "system",
        content: `${bot.voice}\n\nYou're in an anonymous peer support chat room called "${room.title}". Continue the conversation naturally. Don't greet or introduce yourself — just respond to what's being talked about.`,
      },
      { role: "user", content: `Recent conversation:\n${context}\n\nRespond as ${bot.displayName}:` },
    ],
  });

  const body = completion.choices[0]?.message?.content?.trim();
  if (!body) return;

  await getSupabase().from("messages").insert({
    room_id: room.id, user_id: bot.id, body,
    message_type: "user", moderation_status: "safe",
  });
}
