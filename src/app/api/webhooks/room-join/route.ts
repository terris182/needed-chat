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
    .from("rooms").select("id, title, status").eq("id", record.room_id).single();

  if (!room || !["active", "seeding"].includes(room.status)) {
    return NextResponse.json({ ok: true, skipped: "room inactive" });
  }

  const { data: messages } = await getSupabase()
    .from("messages").select("user_id, body").eq("room_id", room.id)
    .order("created_at", { ascending: false }).limit(8);

  if (!messages?.length) {
    await seedWithTwoBots(room, botIds);
  } else {
    await continueConvo(room, messages, botIds);
  }

  return NextResponse.json({ ok: true });
}

async function seedWithTwoBots(room: any, botIds: string[]) {
  const bot1 = randomBot();
  const bot2 = randomBot(bot1?.id);
  if (!bot1 || !bot2) return;

  await getSupabase().from("room_members").upsert(
    [{ room_id: room.id, user_id: bot1.id, role: "member" },
     { room_id: room.id, user_id: bot2.id, role: "member" }],
    { onConflict: "room_id,user_id" }
  );

  const r1 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: [{ role: "system", content: `${bot1.voice}\n\nYou just entered an anonymous peer support room called "${room.title}". Write one short opening message about something real you're carrying. No names, no greetings.` }],
  });
  const body1 = r1.choices[0]?.message?.content?.trim();
  if (!body1) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot1.id, body: body1, message_type: "user", moderation_status: "safe" });

  await new Promise((r) => setTimeout(r, 1500));

  const r2 = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.9,
    messages: [
      { role: "system", content: `${bot2.voice}\n\nYou're in an anonymous peer support room called "${room.title}". Respond to what was just shared. No greetings.` },
      { role: "user", content: body1 },
    ],
  });
  const body2 = r2.choices[0]?.message?.content?.trim();
  if (!body2) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot2.id, body: body2, message_type: "user", moderation_status: "safe" });
}

async function continueConvo(room: any, messages: any[], botIds: string[]) {
  const lastMsg = messages[0];
  const bot = randomBot(lastMsg?.user_id);
  if (!bot) return;

  await getSupabase().from("room_members").upsert(
    { room_id: room.id, user_id: bot.id, role: "member" },
    { onConflict: "room_id,user_id" }
  );

  const context = messages.slice(0, 5).reverse().map((m: any) => `someone: ${m.body}`).join("\n");

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", max_tokens: 70, temperature: 0.85,
    messages: [
      { role: "system", content: `${bot.voice}\n\nYou're in an anonymous peer support room called "${room.title}". Continue naturally — no greeting, no acknowledgment of anyone joining. Just respond to the conversation.` },
      { role: "user", content: `Recent:\n${context}\n\nContinue as ${bot.displayName}:` },
    ],
  });
  const body = completion.choices[0]?.message?.content?.trim();
  if (!body) return;
  await getSupabase().from("messages").insert({ room_id: room.id, user_id: bot.id, body, message_type: "user", moderation_status: "safe" });
}
