import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// In-memory cache for topic context (persists per serverless cold start)
const topicCache = new Map<string, { context: string; fetchedAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Get factual context about a room topic so bots don't hallucinate.
 * Uses OpenAI to generate grounded facts, cached per room.
 */
export async function getTopicContext(
  roomTitle: string,
  dailyPrompt?: string | null,
  supabase?: any,
  roomId?: string
): Promise<string> {
  const cacheKey = `${roomTitle}::${dailyPrompt || ""}`;
  const cached = topicCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.context;
  }

  // Check if room has cached topic_context in Supabase
  if (supabase && roomId) {
    const { data: room } = await supabase
      .from("rooms")
      .select("topic_context")
      .eq("id", roomId)
      .single();
    if (room?.topic_context) {
      topicCache.set(cacheKey, { context: room.topic_context, fetchedAt: Date.now() });
      return room.topic_context;
    }
  }

  // Generate factual context via OpenAI
  const prompt = dailyPrompt
    ? `Room: "${roomTitle}". Icebreaker question: "${dailyPrompt}".`
    : `Room: "${roomTitle}".`;

  try {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      temperature: 0.3,
      messages: [{
        role: "system",
        content: `You research chat room topics. Given a room title and optional question, provide 4-6 bullet points of REAL, FACTUAL context that someone chatting about this topic would know. Include: recent events, key facts, common opinions, cultural references. Be specific — real names, dates, details. If the topic is a TV show, include plot points. If it's a cultural moment, include what happened. If it's emotional/personal, include common experiences people have.

RULES:
- Only facts you're confident about
- No speculation or made-up details
- Keep each bullet to 1 sentence
- Format as simple bullet list`,
      }, {
        role: "user",
        content: prompt,
      }],
    });

    const context = res.choices[0]?.message?.content?.trim() || "";

    if (context) {
      topicCache.set(cacheKey, { context, fetchedAt: Date.now() });

      // Persist to Supabase for future cold starts
      if (supabase && roomId) {
        await supabase
          .from("rooms")
          .update({ topic_context: context })
          .eq("id", roomId)
          .catch(() => {}); // non-critical
      }
    }

    return context;
  } catch {
    return "";
  }
}
