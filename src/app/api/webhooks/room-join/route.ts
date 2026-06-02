import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getActivePersonas, randomBots } from "@/lib/bots/personas";

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

// Supabase Database Webhook — fires on INSERT to room_members
export async function POST(request: Request) {
  const sig = request.headers.get("x-supabase-webhook-secret");
  if (sig !== (process.env.ROOM_JOIN_WEBHOOK_SECRET || "").trim()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const record = payload.record;
  const icebreakerQuestion = payload.icebreaker_question || null;
  if (!record?.room_id || !record?.user_id) {
    return NextResponse.json({ ok: true, skipped: "no record" });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ ok: true, skipped: "no bots" });

  const botIds = personas.map((p) => p.id);
  if (botIds.includes(record.user_id)) {
    return NextResponse.json({ ok: true, skipped: "bot joined" });
  }

  const { data: room } = await getSupabase()
    .from("rooms").select("id, title, status, daily_prompt").eq("id", record.room_id).single();

  if (!room || !["active", "seeding"].includes(room.status)) {
    return NextResponse.json({ ok: true, skipped: "room inactive" });
  }

  const roomIcebreaker = icebreakerQuestion || room.daily_prompt || null;

  const { data: messages } = await getSupabase()
    .from("messages").select("user_id, body").eq("room_id", room.id)
    .order("created_at", { ascending: false }).limit(8);

  const userMessages = messages?.filter((m: any) => !botIds.includes(m.user_id)) || [];
  const userAnswer = userMessages.length > 0 ? userMessages[0].body : null;

  if (!messages?.length || (messages.length <= 1 && userMessages.length === 1)) {
    // Room is empty or only has the user's icebreaker answer — seed with 3 bots
    await seedWithThreeBots(room, botIds, roomIcebreaker, userAnswer);
  } else {
    // Room has conversation — bot responds to the latest
    await continueConvo(room, messages, botIds, roomIcebreaker);
  }

  return NextResponse.json({ ok: true });
}

async function seedWithThreeBots(
  room: any, botIds: string[],
  icebreakerQuestion?: string | null, userAnswer?: string | null
) {
  const bots = randomBots(3);
  if (bots.length < 3) return;

  // Add all 3 bots as members
  await getSupabase().from("room_members").upsert(
    bots.map((b) => ({ room_id: room.id, user_id: b.id, role: "member" })),
    { onConflict: "room_id,user_id" }
  );

  const questionContext = icebreakerQuestion
    ? `The room's icebreaker question is: "${icebreakerQuestion}". Answer it honestly and personally from YOUR experience.`
    : `Share one short, real thing you're carrying related to "${room.title}".`;

  // Bot 1: answers the icebreaker from their own experience
  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: [{ role: "system", content: `${bots[0].voice}\n\nYou're in an anonymous chat room called "${room.title}". ${questionContext} Focus entirely on YOUR answer. No greetings, no names, no quoting the question. Just your honest personal answer.` }],
  });
  const body1 = r1.choices[0]?.message?.content?.trim();
  if (!body1) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bots[0].id, body: body1, message_type: "user", moderation_status: "safe" });

  await new Promise((r) => setTimeout(r, 1500));

  // Bot 2: answers the same icebreaker, lightly acknowledges bot 1 if it relates
  const r2 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: [
      { role: "system", content: `${bots[1].voice}\n\nYou're in an anonymous chat room called "${room.title}". ${questionContext} Focus on YOUR answer first. If what someone else said connects to your experience, you can briefly acknowledge it (like "yeah, same" or "I feel that") then share YOUR thing. Don't ask them questions. Don't be a therapist. No greetings, no names.` },
      { role: "user", content: `Someone else in the room said: ${body1}` },
    ],
  });
  const body2 = r2.choices[0]?.message?.content?.trim();
  if (!body2) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bots[1].id, body: body2, message_type: "user", moderation_status: "safe" });

  await new Promise((r) => setTimeout(r, 2000));

  // Bot 3: answers the icebreaker, can lightly reference what others said
  const r3 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: [
      { role: "system", content: `${bots[2].voice}\n\nYou're in an anonymous chat room called "${room.title}". ${questionContext} Focus on YOUR answer first. A couple other people have already shared. If their experiences resonate, a brief nod is fine ("I relate to that"), then share YOUR own experience. Don't ask questions. Don't therapize. No greetings, no names.` },
      { role: "user", content: `Others in the room said:\n- ${body1}\n- ${body2}` },
    ],
  });
  const body3 = r3.choices[0]?.message?.content?.trim();
  if (!body3) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bots[2].id, body: body3, message_type: "user", moderation_status: "safe" });
}

async function continueConvo(room: any, messages: any[], botIds: string[], icebreakerQuestion?: string | null) {
  const userMsg = messages.find((m: any) => !botIds.includes(m.user_id));
  const bot = randomBots(1, userMsg?.user_id)[0];
  if (!bot) return;

  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  const context = messages.slice(0, 5).reverse().map((m: any) => `someone: ${m.body}`).join("\n");
  const systemPrompt = `${bot.voice}\n\nYou're in an anonymous chat room called "${room.title}". Share your own experience related to what's being discussed. Focus on YOUR story. If someone's message resonates, briefly acknowledge it then share your own thing. Don't ask questions. Don't therapize. No greetings, no names.`;

  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 80, temperature: 0.85,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Recent:\n${context}` },
    ],
  });
  const body1 = r1.choices[0]?.message?.content?.trim();
  if (!body1) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot.id, body: body1, message_type: "user", moderation_status: "safe" });
}
