// Server-side enforcement of bot message quality
// Prompts are suggestions — this is the actual filter

const BANNED_PHRASES = [
  "that's real", "oof", "felt like", "it felt like",
  "vibes", "vibe shift", "energy", "underrated", "top tier",
  "hit different", "no lie", "for real this", "this is so real",
  "keep that energy", "keep doing that", "need that",
  "serotonin", "life-changing", "surprisingly rewarding",
  "peak self-care", "emotional detox", "gateway plants",
  "instant success", "pure magic",
];

const MAX_WORDS = 15;

export function cleanBotOutput(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let body = raw.trim();

  // Take only the first line (no multi-line responses)
  body = body.split("\n")[0].trim();

  // Remove leading em-dashes, quotes
  body = body.replace(/^[—–\-]+\s*/, "");
  body = body.replace(/^["'](.*)["']$/, "$1");

  // Remove leading "this." or "this —" if followed by nothing substantial
  // (but keep "this. [something]" which is natural)

  if (!body) return null;

  // Truncate to MAX_WORDS — cut at last complete word
  const words = body.split(/\s+/);
  if (words.length > MAX_WORDS) {
    body = words.slice(0, MAX_WORDS).join(" ");
    // Try to end at a sentence boundary
    const lastPunc = body.match(/^.*[.!?]/);
    if (lastPunc) body = lastPunc[0];
  }

  // Strip trailing incomplete sentence fragments
  // (if the last char isn't punctuation and the message was truncated)
  if (words.length > MAX_WORDS && !body.match(/[.!?…"']$/)) {
    const lastSentence = body.match(/^.*[.!?…"']/);
    if (lastSentence) body = lastSentence[0];
  }

  // Check for banned phrases
  const lower = body.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      // Try to remove just that phrase
      const regex = new RegExp(phrase, "gi");
      body = body.replace(regex, "").replace(/\s{2,}/g, " ").trim();
      // Remove leading punctuation/connectors left behind
      body = body.replace(/^[,.\s—–-]+/, "").trim();
    }
  }

  // Final cleanup
  body = body.replace(/\s{2,}/g, " ").trim();

  // Reject if too short after cleanup
  if (!body || body.split(/\s+/).length < 2) return null;

  return body;
}
