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

  // Use daily_prompt as icebreaker context (set when user joins via recommendations page)
  const roomIcebreaker = icebreakerQuestion || room.daily_prompt || null;

  const { data: messages } = await getSupabase()
    .from("messages").select("user_id, body").eq("room_id", room.id)
    .order("created_at", { ascending: false }).limit(8);

  // Filter out non-bot messages to find the user's answer
  const userMessages = messages?.filter((m: any) => !botIds.includes(m.user_id)) || [];
  const userAnswer = userMessages.length > 0 ? userMessages[0].body : null;

  if (!messages?.length || (messages.length <= 1 && userMessages.length === 1)) {
    // Room is empty or only has the user's icebreaker answer — seed bots who also answer the icebreaker
    await seedWithTwoBots(room, botIds, roomIcebreaker, userAnswer);
  } else {
    // Room has conversation — bot responds to the latest
    await continueConvo(room, messages, botIds, roomIcebreaker);
  }

  return NextResponse.json({ ok: true });
}

async function seedWithTwoBots(room: any, botIds: string[], icebreakerQuestion?: string | null, userAnswer?: string | null) {
  const bot1 = randomBot();
  const bot2 = randomBot(bot1?.id);
  if (!bot1 || !bot2) return;

  await getSupabase().from("room_members").upsert(
    [{ room_id: room.id, user_id: bot1.id, role: "member" },
     { room_id: room.id, user_id: bot2.id, role: "member" }],
    { onConflict: "room_id,user_id" }
  );

  const questionContext = icebreakerQuestion
    ? `The room's icebreaker question is: "${icebreakerQuestion}". Answer it honestly and personally — like everyone else in the room did.`
    : `Write one short opening message about something real you're carrying related to "${room.title}".`;

  // Bot 1 answers the icebreaker
  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: [{ role: "system", content: `${bot1.voice}\n\nYou're in an anonymous peer support room called "${room.title}". ${questionContext} No names, no greetings, no quoting the question. Just your honest answer.` }],
  });
  const body1 = r1.choices[0]?.message?.content?.trim();
  if (!body1) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot1.id, body: body1, message_type: "user", moderation_status: "safe" });

  await new Promise((r) => setTimeout(r, 1500));

  // Bot 2: if user already answered, respond to the user's answer. Otherwise answer the icebreaker too.
  const bot2Messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (userAnswer) {
    bot2Messages.push(
      { role: "system", content: `${bot2.voice}\n\nYou're in an anonymous peer support room called "${room.title}". Someone just shared their answer to the room's question. Respond warmly to what they said — relate to it, share something of your own. No greetings.` },
      { role: "user", content: `${bot1.displayName} said: ${body1}\n\nSomeone new said: ${userAnswer}` },
    );
  } else {
    bot2Messages.push(
      { role: "system", content: `${bot2.voice}\n\nYou're in an anonymous peer support room called "${room.title}". ${questionContext} No names, no greetings. Just your honest answer, different from what was already shared.` },
      { role: "user", content: `Someone else answered: ${body1}` },
    );
  }

  const r2 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: bot2Messages,
  });
  const body2 = r2.choices[0]?.message?.content?.trim();
  if (!body2) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot2.id, body: body2, message_type: "user", moderation_status: "safe" });
}

async function continueConvo(room: any, messages: any[], botIds: string[], icebreakerQuestion?: string | null) {
  // Find the most recent non-bot message (the user's icebreaker answer)
  const userMsg = messages.find((m: any) => !botIds.includes(m.user_id));

  const bot1 = randomBot(userMsg?.user_id);
  if (!bot1) return;

  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot1.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  // If there's an icebreaker question and a user answer, respond to both
  const hasIcebreaker = icebreakerQuestion && userMsg;

  let systemPrompt: string;
  let userContent: string;

  if (hasIcebreaker) {
    systemPrompt = `${bot1.voice}\n\nYou're in an anonymous peer support room called "${room.title}". The room's question is: "${icebreakerQuestion}". Someone just answered it. Share your own honest answer to the same question AND respond warmly to what they said. Keep it short (2-3 sentences). No greetings.`;
    userContent = `They said: ${userMsg.body}`;
  } else {
    const context = messages.slice(0, 5).reverse().map((m: any) => `someone: ${m.body}`).join("\n");
    systemPrompt = `${bot1.voice}\n\nYou're in an anonymous peer support room called "${room.title}". Continue naturally — no greeting, no acknowledgment of anyone joining. Just respond to the conversation.`;
    userContent = `Recent:\n${context}\n\nContinue as ${bot1.displayName}:`;
  }

  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 80, temperature: 0.85,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });
  const body1 = r1.choices[0]?.message?.content?.trim();
  if (!body1) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot1.id, body: body1, message_type: "user", moderation_status: "safe" });

  // If icebreaker flow, add a second bot response for more life
  if (hasIcebreaker) {
    await new Promise((r) => setTimeout(r, 2000));
    const bot2 = randomBot(bot1.id);
    if (!bot2) return;

    await getSupabase().from("room_members").upsert(
      { room_id: room.id, user_id: bot2.id, role: "member" },
      { onConflict: "room_id,user_id" }
    );

    const r2 = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
      messages: [
        { role: "system", content: `${bot2.voice}\n\nYou're in an anonymous peer support room called "${room.title}". The question was: "${icebreakerQuestion}". Others have answered. Share your own honest, specific answer. Keep it short. No greetings.` },
        { role: "user", content: `${bot1.displayName}: ${body1}\nSomeone else: ${userMsg.body}` },
      ],
    });
    const body2 = r2.choices[0]?.message?.content?.trim();
    if (!body2) return;
    await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot2.id, body: body2, message_type: "user", moderation_status: "safe" });
  }
}
