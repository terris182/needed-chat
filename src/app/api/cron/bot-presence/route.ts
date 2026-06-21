import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getActivePersonas, randomBot, randomBots } from "@/lib/bots/personas";
import { cleanBotOutput } from "@/lib/bots/clean-output";
import { getTopicContext } from "@/lib/bots/topic-context";
import { ANTI_HALLUCINATION, ANTI_AI_POLISH, MESSAGE_LENGTH, TOP_COMMENT_STANDARD, STRUCTURE_VARIETY, classifyRegister, registerInstruction, antiFixationInstruction } from "@/lib/bots/prompt-rules";

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
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const personas = getActivePersonas();
  if (!personas.length) return NextResponse.json({ ok: true, skipped: "no bots configured" });
  const botIds = personas.map((p) => p.id);
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data: newMembers } = await getSupabase()
    .from("room_members")
    .select("room_id, user_id, joined_at")
    .gte("joined_at", fifteenMinAgo)
    .not("user_id", "in", `(${botIds.join(",")})`)
    .limit(10);

  if (!newMembers?.length) return NextResponse.json({ ok: true, rooms_seeded: 0 });

  const roomIds = [...new Set(newMembers.map((m: any) => m.room_id))];
  let seeded = 0;

  for (const roomId of roomIds) {
    const { data: room } = await getSupabase()
      .from("rooms")
      .select("id, title, slug, status, daily_prompt")
      .eq("id", roomId)
      .single();

    if (!room || !["active", "seeding"].includes(room.status)) continue;

    const { data: existingMsgs } = await getSupabase()
      .from("messages")
      .select("id, user_id, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(10);

    const msgCount = existingMsgs?.length || 0;
    const recentBotMsg = existingMsgs?.find(
      (m: any) => botIds.includes(m.user_id) && m.created_at > fifteenMinAgo
    );
    if (recentBotMsg) continue;

    if (msgCount < 3) {
      await seedEmptyRoom(room, personas, botIds);
    } else {
      await continueExistingConvo(room, existingMsgs, botIds);
    }
    seeded++;
  }

  return NextResponse.json({ ok: true, rooms_seeded: seeded });
}

async function seedEmptyRoom(room: any, personas: any[], botIds: string[]) {
  const bots = randomBots(3);
  if (bots.length < 2) return;

  await getSupabase().from("room_members").upsert(
    bots.map((b) => ({ room_id: room.id, user_id: b.id, role: "member" })),
    { onConflict: "room_id,user_id" }
  );

  const topicFacts = await getTopicContext(
    room.title, room.daily_prompt, getSupabase(), room.id
  );
  const factsBlock = topicFacts
    ? `\n\nREAL FACTS (use these, don't make things up):\n${topicFacts}`
    : "";

  const questionContext = room.daily_prompt
    ? `The question is: "${room.daily_prompt}". Answer from your own experience.`
    : `React to "${room.title}" — share something real from your life or knowledge.`;

  const baseRules = `${registerInstruction(classifyRegister(room.title, room.daily_prompt))}

${TOP_COMMENT_STANDARD}

${ANTI_AI_POLISH}

${ANTI_HALLUCINATION}

${MESSAGE_LENGTH}

${STRUCTURE_VARIETY}`;

  // Bot 1: answers directly
  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 50, temperature: 0.9,
    messages: [{ role: "system", content: `${bots[0].voice}\n\nYou're in "${room.title}". ${questionContext}${factsBlock}\n\n${baseRules}` }],
  });
  const body1 = cleanBotOutput(r1.choices[0]?.message?.content);
  if (!body1) return;
  const { data: msg1 } = await getSupabase().from("messages").insert({
    room_id: room.id, user_id: bots[0].id, body: body1,
    message_type: "user", moderation_status: "safe",
    metadata: room.daily_prompt ? { context_prompt: room.daily_prompt } : null,
  }).select("id").single();

  await new Promise((r) => setTimeout(r, 1500));

  // Bot 2: different answer, sometimes replies to bot 1
  const shouldReply = Math.random() < 0.5;
  const r2 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 50, temperature: 0.9,
    messages: [
      { role: "system", content: `${bots[1].voice}\n\nYou're in "${room.title}". ${questionContext}${factsBlock}\n\nSomeone already shared their take. ${shouldReply ? "React to what they said or build on it." : "Share your own completely different take."}\n\n${baseRules}` },
      { role: "user", content: `Someone said: ${body1}` },
    ],
  });
  const body2 = cleanBotOutput(r2.choices[0]?.message?.content);
  if (!body2) return;
  const { data: msg2 } = await getSupabase().from("messages").insert({
    room_id: room.id, user_id: bots[1].id, body: body2,
    message_type: "user", moderation_status: "safe",
    reply_to_id: shouldReply && msg1?.id ? msg1.id : null,
    metadata: !shouldReply && room.daily_prompt ? { context_prompt: room.daily_prompt } : null,
  }).select("id").single();

  if (bots.length >= 3) {
    await new Promise((r) => setTimeout(r, 2000));

    // Bot 3: different energy — react, tangent, or new angle
    const r3 = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini", max_tokens: 50, temperature: 0.9,
      messages: [
        { role: "system", content: `${bots[2].voice}\n\nYou're in "${room.title}". ${questionContext}${factsBlock}\n\nTwo others commented. Add YOUR take — could be a reaction, a different angle, or a follow-up question.\n\n${baseRules}` },
        { role: "user", content: `Comments so far:\n- ${body1}\n- ${body2}` },
      ],
    });
    const body3 = cleanBotOutput(r3.choices[0]?.message?.content);
    if (body3) {
      const pickReply = Math.random();
      const replyId = pickReply < 0.3 ? msg1?.id : pickReply < 0.6 ? msg2?.id : null;
      await getSupabase().from("messages").insert({
        room_id: room.id, user_id: bots[2].id, body: body3,
        message_type: "user", moderation_status: "safe",
        reply_to_id: replyId || null,
      });
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

  const topicFacts = await getTopicContext(
    room.title, room.daily_prompt, getSupabase(), room.id
  );
  const factsBlock = topicFacts
    ? `\n\nREAL FACTS (reference these, don't make things up):\n${topicFacts}`
    : "";

  const context = messages
    .slice(0, 5)
    .reverse()
    .map((m: any) => `someone: ${m.body}`)
    .join("\n");

  // Diversified targeting — don't always reply to human
  const humanMsg = messages.find((m: any) => !botIds.includes(m.user_id));
  const botMsg = messages.find((m: any) => botIds.includes(m.user_id) && m.user_id !== bot.id);
  const roll = Math.random();
  const replyTarget = roll < 0.3 ? humanMsg : roll < 0.5 ? botMsg : null;
  const antiFix = antiFixationInstruction(messages.map((m: any) => m.body));

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 50,
    temperature: 0.9,
    messages: [
      {
        role: "system",
        content: `${bot.voice}\n\nYou're in "${room.title}".${room.daily_prompt ? ` Topic: "${room.daily_prompt}".` : ""}${factsBlock}${replyTarget ? ` Replying to someone who said: "${replyTarget.body}"` : ""}\n\n${registerInstruction(classifyRegister(room.title, room.daily_prompt))}\n\n${antiFix ? antiFix + " " : ""}Share something real and specific — the kind of line that would be a top comment. No greetings, no names, no therapy-speak. Lowercase ok.\n\n${TOP_COMMENT_STANDARD}\n\n${ANTI_AI_POLISH}\n\n${MESSAGE_LENGTH}\n\n${STRUCTURE_VARIETY}`,
      },
      { role: "user", content: `Recent conversation:\n${context}` },
    ],
  });

  const body = cleanBotOutput(completion.choices[0]?.message?.content);
  if (!body) return;

  await getSupabase().from("messages").insert({
    room_id: room.id, user_id: bot.id, body,
    message_type: "user", moderation_status: "safe",
    reply_to_id: replyTarget?.id || null,
  });
}
