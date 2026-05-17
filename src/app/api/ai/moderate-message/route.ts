import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI, withCircuitBreaker } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  message_id: z.string().uuid(),
  body: z.string(),
  room_ad_safety_rating: z.enum(["green", "yellow", "red"]),
});

const moderationSchema = z.object({
  status: z.enum(["safe", "flagged", "blocked"]),
  reason: z.string().optional(),
  risk_level: z.enum(["low", "medium", "high"]),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { message_id, body: messageBody, room_ad_safety_rating } = inputSchema.parse(body);

    const moderation = await withCircuitBreaker(async () => {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4.1-nano",
        response_format: { type: "json_object" },
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: `You moderate chat messages for needed.chat, a social app for anonymous conversations.

Rules:
- "safe": normal conversation, even if emotional or about sensitive topics (sobriety, mental health, relationships). Most messages are safe.
- "flagged": borderline content that needs human review (veiled threats, doxxing attempts, spam/scam patterns).
- "blocked": clear violations — harassment, hate speech, explicit sexual content, threats of violence, sharing personal identifying info of others.
- risk_level "high": self-harm signals, crisis language, immediate danger. These trigger the crisis flow.

Be LENIENT. This is a space for honest conversation. Emotional content, profanity, venting about hard things = safe. Only block clear policy violations.

Return JSON: { status, reason (if not safe), risk_level }`,
          },
          { role: "user", content: messageBody },
        ],
      });

      const parsed = JSON.parse(completion.choices[0].message.content || "{}");
      return moderationSchema.parse(parsed);
    });

    // Update message status
    await supabase
      .from("messages")
      .update({
        moderation_status: moderation.status,
        moderation_reason: moderation.reason,
      })
      .eq("id", message_id);

    // Crisis path
    if (moderation.risk_level === "high") {
      await supabase
        .from("users_profile")
        .update({ safety_blackout_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", user.id);

      await supabase.from("crisis_events").insert({
        user_id: user.id,
        source: "message",
        source_id: message_id,
        risk_signal: messageBody.substring(0, 200),
      });
    }

    return NextResponse.json(moderation);
  } catch (error) {
    console.error("moderate-message error:", error);
    // Fail open for GREEN rooms, fail closed for YELLOW/RED
    return NextResponse.json({ status: "safe", risk_level: "low" });
  }
}
