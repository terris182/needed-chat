import { NextResponse } from "next/server";
import { z } from "zod";
import { embed, openai, withCircuitBreaker } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  private_text: z.string().min(1),
  classification: z.object({
    category: z.string(),
    intensity: z.string(),
    intent: z.string(),
    tags: z.array(z.string()),
    risk_level: z.string(),
    safe_to_match: z.boolean(),
  }),
});

// Cosine similarity thresholds (BUILD_PLAN §15)
const AUTO_ROUTE_THRESHOLD = 0.65;
const SUGGEST_THRESHOLD = 0.50;
const MIN_SEED_USERS = 5; // minimum fit users to seed a new room

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { private_text, classification } = inputSchema.parse(body);

    // Crisis path — don't match, show resources
    if (classification.risk_level === "high" || !classification.safe_to_match) {
      // Set safety blackout
      await supabase
        .from("users_profile")
        .update({ safety_blackout_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", user.id);

      // Log crisis event
      await supabase.from("crisis_events").insert({
        user_id: user.id,
        source: "needed_prompt",
        risk_signal: private_text.substring(0, 200),
      });

      return NextResponse.json({
        action: "crisis",
        message: "We want to make sure you're okay.",
        resources: getCrisisResources(),
      });
    }

    // Generate embedding for user's text
    const userEmbedding = await embed(private_text);

    // Store the needed prompt
    const { data: prompt } = await supabase
      .from("needed_prompts")
      .insert({
        user_id: user.id,
        private_text,
        ai_category: classification.category,
        ai_intensity: classification.intensity,
        ai_intent: classification.intent,
        ai_tags: classification.tags,
        ai_risk_level: classification.risk_level,
        ai_safe_to_match: classification.safe_to_match,
        embedding: userEmbedding,
      })
      .select("id")
      .single();

    // Find matching rooms using pgvector cosine similarity
    const { data: matches } = await supabase.rpc("match_rooms", {
      query_embedding: userEmbedding,
      match_threshold: SUGGEST_THRESHOLD,
      match_count: 5,
    });

    const recommendations: Array<{
      room_id: string;
      title: string;
      slug: string;
      score: number;
      reason: string;
      action: "auto_route" | "suggest";
    }> = [];

    if (matches?.length) {
      for (const match of matches) {
        // Check room capacity
        const { data: engagement } = await supabase
          .from("room_engagement")
          .select("active_count, invite_quota")
          .eq("room_id", match.id)
          .single();

        const hasCapacity = !engagement || engagement.active_count < engagement.invite_quota;

        if (hasCapacity) {
          // Generate a human reason for the match
          const reason = await generateMatchReason(match.title, classification.tags);

          recommendations.push({
            room_id: match.id,
            title: match.title,
            slug: match.slug,
            score: match.similarity,
            reason,
            action: match.similarity >= AUTO_ROUTE_THRESHOLD ? "auto_route" : "suggest",
          });
        }
      }

      // Store recommendations for audit
      if (prompt?.id) {
        await supabase.from("room_recommendations").insert(
          recommendations.map((r) => ({
            user_id: user.id,
            needed_prompt_id: prompt.id,
            room_id: r.room_id,
            reason: r.reason,
            score: r.score,
          }))
        );
      }
    }

    // If no matches above suggest threshold, consider seeding a new room
    if (recommendations.length === 0) {
      return NextResponse.json({
        action: "no_match",
        message: "We don't have a room that fits yet, but we're looking.",
        prompt_id: prompt?.id,
      });
    }

    return NextResponse.json({
      action: "matched",
      recommendations,
      prompt_id: prompt?.id,
    });
  } catch (error) {
    console.error("match-or-create-room error:", error);
    return NextResponse.json({ error: "Matching failed" }, { status: 500 });
  }
}

async function generateMatchReason(roomTitle: string, tags: string[]): Promise<string> {
  try {
    const result = await withCircuitBreaker(async () => {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content: "Write a brief, warm one-sentence reason why this room matches the user's interests. Max 15 words. Don't start with 'This room' or 'Because'. Be specific to the room topic.",
          },
          {
            role: "user",
            content: `Room: "${roomTitle}". User tags: ${tags.join(", ")}`,
          },
        ],
      });
      return completion.choices[0].message.content || "Looks like a good fit for what's on your mind.";
    });
    return result;
  } catch {
    return "Looks like a good fit for what's on your mind.";
  }
}

function getCrisisResources() {
  return [
    { country: "US", name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988" },
    { country: "US", name: "Crisis Text Line", contact: "Text HOME to 741741" },
    { country: "UK", name: "Samaritans", contact: "Call 116 123" },
    { country: "AU", name: "Lifeline Australia", contact: "Call 13 11 14" },
    { country: "NZ", name: "Lifeline New Zealand", contact: "Call 0800 543 354" },
    { country: "INT", name: "Befrienders Worldwide", contact: "befrienders.org" },
  ];
}
