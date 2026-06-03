import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getActivePersonas, randomBots } from "@/lib/bots/personas";
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

function cleanBotMessage(raw: string): string {
  let body = raw.trim().replace(/^[—–-]+\s*/, "");
  body = body.split("\n")[0].trim();
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

  if (!messages?.length || (messages.length <= 1 && userMessages.length === 1)) {
    await seedConversation(room, botIds, roomIcebreaker);
  } else {
    await continueConvo(room, messages, botIds, roomIcebreaker);
  }

  return NextResponse.json({ ok: true });
}

async function seedConversation(
  room: any, botIds: string[],
  icebreakerQuestion?: string | null
) {
  const bots = randomBots(3);
  if (bots.length < 3) return;

  // Add all 3 bots as members
  await getSupabase().from("room_members").upsert(
    bots.map((b) => ({ room_id: room.id, user_id: b.id, role: "member" })),
    { onConflict: "room_id,user_id" }
  );

  // Fetch topic context so bots have real information
  const topicFacts = await getTopicContext(
    room.title, icebreakerQuestion, getSupabase(), room.id
  );

  const questionContext = icebreakerQuestion
    ? `The icebreaker question is: "${icebreakerQuestion}".`
    : `The room topic is "${room.title}".`;

  const factsBlock = topicFacts
    ? `\n\nREAL FACTS about this topic (use these, don't make things up):\n${topicFacts}`
    : "";

  const baseRules = `Write like you're in a group chat with friends. Lowercase ok, casual, real. Share from your own experience or knowledge. Be SPECIFIC — name real things, places, details. Don't repeat what others said. No greetings, no names, no therapy-speak, no poetic language.`;

  // Backdate timestamps so it looks like convo started a few minutes ago
  const now = Date.now();
  const timestamps = [
    new Date(now - 4 * 60 * 1000).toISOString(),  // ~4 min ago
    new Date(now - 3.2 * 60 * 1000).toISOString(), // ~3 min ago
    new Date(now - 2.5 * 60 * 1000).toISOString(), // ~2.5 min ago
    new Date(now - 1.8 * 60 * 1000).toISOString(), // ~2 min ago
    new Date(now - 1.2 * 60 * 1000).toISOString(), // ~1 min ago
    new Date(now - 0.5 * 60 * 1000).toISOString(), // ~30s ago
  ];

  // Message 1: Bot 1 answers the icebreaker (tagged as icebreaker response)
  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 60, temperature: 0.9,
    messages: [{ role: "system", content: `${bots[0].voice}\n\nYou're in "${room.title}". ${questionContext}${factsBlock}\n\nAnswer the question from your own experience. 1-2 sentences, max 20 words. ${baseRules}` }],
  });
  const body1 = cleanBotMessage(r1.choices[0]?.message?.content || "");
  if (!body1) return;
  const { data: msg1 } = await getSupabase().from("messages").insert({
    room_id: room.id, user_id: bots[0].id, body: body1,
    message_type: "user", moderation_status: "safe",
    created_at: timestamps[0],
    metadata: icebreakerQuestion ? { context_prompt: icebreakerQuestion } : null,
  }).select("id").single();

  // Message 2: Bot 2 answers the icebreaker differently
  const r2 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 60, temperature: 0.9,
    messages: [
      { role: "system", content: `${bots[1].voice}\n\nYou're in "${room.title}". ${questionContext}${factsBlock}\n\nSomeone already answered. Give your OWN different answer from your experience. 1-2 sentences, max 20 words. ${baseRules}` },
      { role: "user", content: `Someone said: "${body1}"\n\nShare something different:` },
    ],
  });
  const body2 = cleanBotMessage(r2.choices[0]?.message?.content || "");
  if (!body2) return;
  const { data: msg2 } = await getSupabase().from("messages").insert({
    room_id: room.id, user_id: bots[1].id, body: body2,
    message_type: "user", moderation_status: "safe",
    created_at: timestamps[1],
    metadata: icebreakerQuestion ? { context_prompt: icebreakerQuestion } : null,
  }).select("id").single();

  // Message 3: Bot 1 replies to Bot 2 — creates back-and-forth
  const r3 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 50, temperature: 0.9,
    messages: [
      { role: "system", content: `${bots[0].voice}\n\nYou're in "${room.title}".${factsBlock}\n\nSomeone just shared something. React naturally — agree, disagree, ask a follow-up, or build on it. Keep it short and conversational (under 15 words). ${baseRules}` },
      { role: "user", content: `They said: "${body2}"` },
    ],
  });
  const body3 = cleanBotMessage(r3.choices[0]?.message?.content || "");
  if (body3) {
    await getSupabase().from("messages").insert({
      room_id: room.id, user_id: bots[0].id, body: body3,
      message_type: "user", moderation_status: "safe",
      created_at: timestamps[2],
      reply_to_id: msg2?.id || null,
    });
  }

  // Message 4: Bot 3 joins with their own icebreaker answer
  const r4 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 60, temperature: 0.9,
    messages: [
      { role: "system", content: `${bots[2].voice}\n\nYou're in "${room.title}". ${questionContext}${factsBlock}\n\nTwo people have been chatting. Jump in with YOUR answer to the question — different from theirs. 1-2 sentences, max 20 words. ${baseRules}` },
      { role: "user", content: `Conversation so far:\n- "${body1}"\n- "${body2}"\n${body3 ? `- "${body3}"` : ""}\n\nShare your take:` },
    ],
  });
  const body4 = cleanBotMessage(r4.choices[0]?.message?.content || "");
  if (!body4) return;
  const { data: msg4 } = await getSupabase().from("messages").insert({
    room_id: room.id, user_id: bots[2].id, body: body4,
    message_type: "user", moderation_status: "safe",
    created_at: timestamps[3],
    metadata: icebreakerQuestion ? { context_prompt: icebreakerQuestion } : null,
  }).select("id").single();

  // Message 5: Bot 2 reacts to Bot 3 — keeps the thread alive
  const r5 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 40, temperature: 0.9,
    messages: [
      { role: "system", content: `${bots[1].voice}\n\nYou're in "${room.title}".${factsBlock}\n\nSomeone just shared something interesting. Give a brief, natural reaction or follow-up question. Under 12 words. ${baseRules}` },
      { role: "user", content: `They said: "${body4}"` },
    ],
  });
  const body5 = cleanBotMessage(r5.choices[0]?.message?.content || "");
  if (body5) {
    await getSupabase().from("messages").insert({
      room_id: room.id, user_id: bots[1].id, body: body5,
      message_type: "user", moderation_status: "safe",
      created_at: timestamps[4],
      reply_to_id: msg4?.id || null,
    });
  }

  // Optionally add a reaction from Bot 3 to Bot 1's original message
  if (msg1?.id && Math.random() < 0.6) {
    const emojis = ["🔥", "💯", "😂", "❤️"];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    await getSupabase().from("message_reactions").insert({
      message_id: msg1.id,
      user_id: bots[2].id,
      emoji,
    }).catch(() => {}); // non-critical
  }
}

async function continueConvo(room: any, messages: any[], botIds: string[], icebreakerQuestion?: string | null) {
  const userMsg = messages.find((m: any) => !botIds.includes(m.user_id));
  const bot = randomBots(1, userMsg?.user_id)[0];
  if (!bot) return;

  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  const topicFacts = await getTopicContext(
    room.title, icebreakerQuestion || room.daily_prompt, getSupabase(), room.id
  );
  const factsBlock = topicFacts
    ? `\n\nREAL FACTS about this topic (use these, don't make things up):\n${topicFacts}`
    : "";

  const context = messages.slice(0, 5).reverse().map((m: any) => `someone: ${m.body}`).join("\n");
  const iceContext = icebreakerQuestion
    ? ` The room's icebreaker is: "${icebreakerQuestion}".`
    : (room.daily_prompt ? ` The room's icebreaker is: "${room.daily_prompt}".` : "");

  const systemPrompt = `${bot.voice}\n\nYou're in "${room.title}".${iceContext}${factsBlock}\n\nRULES:\n1. Match the energy of the conversation — light stays light, deep stays deep.\n2. Share something real from your own experience or knowledge about this topic.\n3. Be specific — real details, real places, real things.\n4. 1-2 sentences, under 20 words. No greetings, no names.\n5. Don't use therapy-speak or poetic language.`;

  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 60, temperature: 0.9,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Recent:\n${context}` },
    ],
  });
  const contBody = cleanBotMessage(r1.choices[0]?.message?.content || "");
  if (!contBody) return;
  await getSupabase().from("messages").insert({
    room_id: room.id, user_id: bot.id, body: contBody,
    message_type: "user", moderation_status: "safe",
  });
}
