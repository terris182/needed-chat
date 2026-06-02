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

// Clean bot output: remove em-dash starts, trim incomplete trailing sentences
function cleanBotMessage(raw: string): string {
  let body = raw.trim().replace(/^[—–-]+\s*/, "");
  if (body.length > 0 && !body.match(/[.!?…"']$/)) {
    const lastSentence = body.match(/^.*[.!?…"']/);
    if (lastSentence) body = lastSentence[0];
  }
  return body;
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
    ? `The icebreaker is: "${icebreakerQuestion}".`
    : `The room topic is "${room.title}".`;

  const toneRule = `Write like you're texting a friend at 1am — lowercase ok, no quotation marks around titles, no poetic language. NEVER use "like a..." or "it felt like..." comparisons. No metaphors, no similes, no imagery. Just say what happened. Be SPECIFIC: name a real place, object, time. Max 1-2 sentences, under 20 words. No greetings, no names, no questions.`;

  // Bot 1: answers the icebreaker from their own experience
  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 50, temperature: 0.95,
    messages: [{ role: "system", content: `${bots[0].voice}\n\nYou're in "${room.title}". ${questionContext} Answer from YOUR life with a detail only you'd know. ${toneRule}` }],
  });
  const body1 = cleanBotMessage(r1.choices[0]?.message?.content || "");
  if (!body1) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bots[0].id, body: body1, message_type: "user", moderation_status: "safe" });

  await new Promise((r) => setTimeout(r, 600));

  // Bot 2: DIFFERENT answer — no echoing bot 1
  const r2 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 50, temperature: 0.95,
    messages: [
      { role: "system", content: `${bots[1].voice}\n\nYou're in "${room.title}". ${questionContext} Someone already answered. You MUST give a completely different answer — different topic, different vibe. Don't riff on their answer, share YOUR OWN unrelated thing. ${toneRule}` },
      { role: "user", content: `Someone said: "${body1}"\n\nGive a DIFFERENT answer, not related to theirs:` },
    ],
  });
  const body2 = cleanBotMessage(r2.choices[0]?.message?.content || "");
  if (!body2) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bots[1].id, body: body2, message_type: "user", moderation_status: "safe" });

  await new Promise((r) => setTimeout(r, 800));

  // Bot 3: yet another different answer
  const r3 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 50, temperature: 0.95,
    messages: [
      { role: "system", content: `${bots[2].voice}\n\nYou're in "${room.title}". ${questionContext} Two people already answered with different things. Give YOUR answer — completely different from both. Maybe find one tiny thread connecting all three. ${toneRule}` },
      { role: "user", content: `Others said:\n- "${body1}"\n- "${body2}"\n\nGive a DIFFERENT answer:` },
    ],
  });
  const body3 = cleanBotMessage(r3.choices[0]?.message?.content || "");
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
  const iceContext = icebreakerQuestion ? ` The room's icebreaker is: "${icebreakerQuestion}".` : (room.daily_prompt ? ` The room's icebreaker is: "${room.daily_prompt}".` : "");
  const systemPrompt = `${bot.voice}\n\nYou're in "${room.title}".${iceContext}\n\nRULES:\n1. MATCH THEIR ENERGY. Vulnerable → meet them there. Light → stay light.\n2. Sometimes start with a brief reaction ("yeah", "that's real", "oof same") before your moment.\n3. Your moment: SPECIFIC — a real place, object, time. No metaphors, no "it felt like...".\n4. Text at 1am style. Lowercase ok. No quotation marks. No therapy-speak.\n5. Max 1-2 sentences, under 20 words. No greetings, no names.`;

  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 50, temperature: 0.9,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Recent:\n${context}` },
    ],
  });
  const contBody = cleanBotMessage(r1.choices[0]?.message?.content || "");
  if (!contBody) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot.id, body: contBody, message_type: "user", moderation_status: "safe" });
}
