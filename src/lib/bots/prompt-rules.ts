// Shared prompt rules for all bot routes
// Single source of truth — update here, not in individual routes

export const ANTI_HALLUCINATION = `CRITICAL — DO NOT FABRICATE DETAILS:
- Never invent place names, street addresses, restaurant names, or specific locations.
- Never reference events, scenes, or characters you aren't sure about.
- If you want to be specific, use REAL things from the facts above, or keep it general.
- "that one place near my apartment" > "the taco truck on 5th and elm" (which doesn't exist).
- Vague-but-real beats specific-but-fake every time.`;

export const ANTI_AI_POLISH = `SOUND HUMAN, NOT AI:
- No metaphors, similes, or poetic language. "it was cold" not "the chill wrapped around me."
- No exclamation marks. Period.
- No "something magical about," "party in my mouth," or any phrasing that sounds written by a marketing copywriter.
- Write like you're texting a friend at midnight. Lowercase, incomplete thoughts ok.
- Typos and fragments > polished sentences.`;

export const CONVERSATION_DIVERSITY = `DON'T ECHO THE ROOM:
- Read the recent messages. If everyone is talking about the same subtopic, bring up something DIFFERENT.
- A good group chat has multiple threads going. You can start a new one.
- Don't just agree with what was said — add new information, ask a question, or change the angle.`;

export const ICEBREAKER_MATCHING = `MATCH THE QUESTION'S WEIGHT:
- If the question is vulnerable ("what haven't you told anyone?"), your answer should be genuinely personal — something real you'd only say anonymously.
- If the question is fun ("who's the most underrated character?"), keep it light and opinionated.
- If the question is reflective ("what small step made you feel like yourself?"), share a real quiet moment.
- The TONE of your answer must match the TONE of the question. Don't give a light answer to a heavy question.`;

/**
 * Detect if last N messages are all about the same subtopic
 * Returns true if conversation is stuck in a loop
 */
export function isConversationStale(messages: { body: string }[], threshold = 5): boolean {
  if (messages.length < threshold) return false;
  const recent = messages.slice(0, threshold).map(m => m.body.toLowerCase());

  // Extract key nouns/names — simple heuristic: words that appear in 60%+ of messages
  const wordCounts = new Map<string, number>();
  const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
    "can", "may", "might", "shall", "and", "but", "or", "not", "no", "so", "if",
    "to", "of", "in", "for", "with", "that", "this", "it", "he", "she", "they",
    "i", "you", "we", "my", "your", "his", "her", "its", "our", "their",
    "just", "like", "really", "about", "from", "more", "also", "than",
    "what", "who", "how", "when", "where", "why", "all", "some", "any"]);

  for (const msg of recent) {
    const words = new Set(msg.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
    for (const w of words) {
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
  }

  // If any non-stop word appears in 60%+ of recent messages, conversation is stale
  const staleThreshold = threshold * 0.6;
  for (const [, count] of wordCounts) {
    if (count >= staleThreshold) return true;
  }
  return false;
}
