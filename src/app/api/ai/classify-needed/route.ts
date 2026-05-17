import { NextResponse } from "next/server";
import { z } from "zod";
import { openai, withCircuitBreaker } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  private_text: z.string().min(1).max(2000),
});

const classificationSchema = z.object({
  category: z.enum([
    "pop_culture", "work", "relationships", "creativity",
    "habit_change", "loneliness", "fandom", "advice", "other",
  ]),
  intensity: z.enum(["light", "medium", "deep"]),
  intent: z.enum([
    "vent", "discuss", "advice", "support",
    "fandom", "debate", "accountability", "recommendation",
  ]),
  tags: z.array(z.string()).min(3).max(7),
  risk_level: z.enum(["low", "medium", "high"]),
  safe_to_match: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { private_text } = inputSchema.parse(body);

    const classification = await withCircuitBreaker(async () => {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        response_format: { type: "json_object" },
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `You classify user messages for a social chat app called needed.chat. Users answer "What have you needed to talk about?" and you categorize their response.

Return JSON with exactly these fields:
- category: one of pop_culture, work, relationships, creativity, habit_change, loneliness, fandom, advice, other
- intensity: light (casual/fun), medium (personal but not crisis), deep (heavy emotional content)
- intent: vent, discuss, advice, support, fandom, debate, accountability, recommendation
- tags: 3-7 short keyword tags for matching
- risk_level: low, medium, high (high = self-harm, crisis, immediate danger signals)
- safe_to_match: false ONLY if risk_level is high OR content is threatening/harassing

Be generous with safe_to_match — most content is safe. Only flag high risk for genuine crisis signals.`,
          },
          { role: "user", content: private_text },
        ],
      });

      const parsed = JSON.parse(completion.choices[0].message.content || "{}");
      return classificationSchema.parse(parsed);
    });

    return NextResponse.json(classification);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.errors }, { status: 400 });
    }
    console.error("classify-needed error:", error);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}
