import { NextResponse } from "next/server";
import { z } from "zod";
import { openai, withCircuitBreaker } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  category: z.string().optional(),
});

const metadataSchema = z.object({
  suggested_slug: z.string(),
  description: z.string(),
  category: z.string(),
  intensity: z.enum(["light", "medium", "deep"]),
  ad_safety_rating: z.enum(["green", "yellow", "red"]),
  tags: z.array(z.string()).min(3).max(7),
  entry_prompt: z.string(),
  daily_prompt: z.string(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const input = inputSchema.parse(body);

    const metadata = await withCircuitBreaker(async () => {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        response_format: { type: "json_object" },
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `Generate metadata for a new chat room on needed.chat. Return JSON:
- suggested_slug: URL-safe lowercase slug
- description: 1-2 sentence description (warm, inviting)
- category: pop_culture, work, relationships, creativity, habit_change, loneliness, fandom, advice, or other
- intensity: light (fun/casual), medium (personal), deep (heavy emotional)
- ad_safety_rating: green (safe for ads), yellow (sensitive — ads at door only), red (no ads — crisis/deep emotional)
- tags: 3-7 keyword tags for matching
- entry_prompt: the question new members answer to join (warm, specific)
- daily_prompt: first daily conversation starter

Default to "yellow" for ad_safety_rating. Only use "green" for clearly fun/pop-culture topics. Use "red" for mental health, crisis, grief, addiction topics.`,
          },
          {
            role: "user",
            content: `Title: "${input.title}"${input.description ? `\nDescription: "${input.description}"` : ""}${input.category ? `\nCategory hint: ${input.category}` : ""}`,
          },
        ],
      });

      const parsed = JSON.parse(completion.choices[0].message.content || "{}");
      return metadataSchema.parse(parsed);
    });

    return NextResponse.json(metadata);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.errors }, { status: 400 });
    }
    console.error("generate-room-metadata error:", error);
    return NextResponse.json({ error: "Metadata generation failed" }, { status: 500 });
  }
}
