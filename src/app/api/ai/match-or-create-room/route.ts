import { NextResponse } from "next/server";
import { z } from "zod";
import { embed, getOpenAI, withCircuitBreaker } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

let _service: any = null;
function getService() {
  if (!_service) _service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return _service;
}

const inputSchema = z.object({
  private_text: z.string().min(1),
  icebreaker_question: z.string().optional(),
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
    const { private_text, classification, icebreaker_question } = inputSchema.parse(body);

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

    // If no matches, create a room on the fly and seed it with bots
    if (recommendations.length === 0) {
      const newRoom = await createRoomForUser(classification, userEmbedding, user.id, prompt?.id, icebreaker_question);
      if (newRoom) {
        // Present new rooms identically to matched rooms — no hint it was just created
        const reason = await generateMatchReason(newRoom.title, classification.tags);
        return NextResponse.json({
          action: "matched",
          recommendations: [{
            room_id: newRoom.id,
            title: newRoom.title,
            slug: newRoom.slug,
            score: 0.88,
            reason,
            action: "auto_route" as const,
          }],
          prompt_id: prompt?.id,
        });
      }
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

async function createRoomForUser(
  classification: any,
  embedding: any,
  userId: string,
  promptId: string | undefined,
  icebreakerQuestion?: string
): Promise<{ id: string; title: string; slug: string } | null> {
  try {
    const db = getService();

    // Generate a room title from category/tags
    const titleCompletion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 20,
      messages: [{
        role: "system",
        content: "Create a short, warm, anonymous chat room name (4-6 words max) for people sharing this feeling. No quotes. E.g. 'Hard Week', 'Feeling Stuck Right Now', 'Late Night Thoughts'.",
      }, {
        role: "user",
        content: `Category: ${classification.category}. Tags: ${classification.tags?.join(", ")}`,
      }],
    });
    const title = titleCompletion.choices[0]?.message?.content?.trim() || classification.category || "A Space to Talk";
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Create the room with a small base count so it doesn't look empty
    const baseMemberCount = Math.floor(Math.random() * 4) + 3; // 3-6
    const { data: room } = await db.from("rooms").insert({
      title,
      slug: `${slug}-${Date.now().toString(36)}`,
      status: "active",
      origin: "user",
      embedding,
      invite_quota: 12,
      base_member_count: baseMemberCount,
      active_member_count: baseMemberCount,
    }).select("id, title, slug").single();

    if (!room) return null;

    // Add the user as member
    await db.from("room_members").upsert(
      { room_id: room.id, user_id: userId, role: "member" },
      { onConflict: "room_id,user_id" }
    );

    // Trigger bot engagement immediately (pass icebreaker so bots can reference it)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://needed.chat";
    fetch(`${appUrl}/api/webhooks/room-join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-supabase-webhook-secret": (process.env.ROOM_JOIN_WEBHOOK_SECRET || "").trim(),
      },
      body: JSON.stringify({
        record: { room_id: room.id, user_id: userId },
        ...(icebreakerQuestion && { icebreaker_question: icebreakerQuestion }),
      }),
    }).catch(() => {}); // fire-and-forget

    return room;
  } catch (e) {
    console.error("createRoomForUser error:", e);
    return null;
  }
}

async function generateMatchReason(roomTitle: string, tags: string[]): Promise<string> {
  try {
    const result = await withCircuitBreaker(async () => {
      const completion = await getOpenAI().chat.completions.create({
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
