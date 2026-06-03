// Server-side enforcement of bot message quality
// Prompts are suggestions — this is the actual filter
//
// CRITICAL: Never truncate mid-thought. If a message is too long or
// looks cut off, REJECT it entirely (return null). The bot will just
// skip and try again next cycle. A missing message > a broken one.

const BANNED_PHRASES = [
  "hit different", "no lie", "for real this",
  "this is so real", "keep that energy", "keep doing that",
  "serotonin", "life-changing", "surprisingly rewarding",
  "peak self-care", "emotional detox", "gateway plants",
  "instant success", "pure magic", "top tier",
  "vibe shift", "energy shift",
  // AI-polished phrasing that reads as generated
  "something magical about", "there's something about",
  "party in my mouth", "chef's kiss", "hits just right",
  "resonates with", "speaks volumes", "sends chills",
  "warms my heart", "fills my soul", "fuels my soul",
  "brings me joy", "sparks joy", "core memory",
  "main character", "whole vibe", "living rent free",
  "can we talk about", "can we appreciate",
  "ngl", "lowkey", "highkey", "periodt", "bestie",
  "it's giving", "understood the assignment",
];

const MAX_WORDS = 25;

export function cleanBotOutput(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let body = raw.trim();

  // Take only the first line (no multi-line responses)
  body = body.split("\n")[0].trim();

  // Remove leading em-dashes, quotes
  body = body.replace(/^[—–\-]+\s*/, "");
  body = body.replace(/^["'](.*?)["']$/, "$1");

  if (!body) return null;

  // Detect truncated responses
  const truncationSignals = [
    /\b(and|but|or|the|a|an|to|of|in|for|with|that|is|are|was|were|be|been|have|has|had|do|does|did|will|would|could|should|can|may|might|shall)\s*$/i,
    /,\s*$/,
    /—\s*$/,
    /\.\.\s*$/,
  ];

  const looksComplete = body.match(/[.!?…"')})\]]$/) ||
    body.split(/\s+/).length <= 10;

  if (!looksComplete) {
    const lastSentence = body.match(/^.*[.!?…]/);
    if (lastSentence && lastSentence[0].split(/\s+/).length >= 3) {
      body = lastSentence[0];
    } else {
      const isTruncated = truncationSignals.some((re) => re.test(body));
      if (isTruncated) return null;
    }
  }

  // Word count check — reject if too long, don't truncate
  const words = body.split(/\s+/);
  if (words.length > MAX_WORDS) {
    const shortened = words.slice(0, MAX_WORDS).join(" ");
    const sentenceMatch = shortened.match(/^.*[.!?…]/);
    if (sentenceMatch && sentenceMatch[0].split(/\s+/).length >= 3) {
      body = sentenceMatch[0];
    } else {
      return null;
    }
  }

  // Check for banned phrases
  const lower = body.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      const regex = new RegExp(phrase, "gi");
      body = body.replace(regex, "").replace(/\s{2,}/g, " ").trim();
      body = body.replace(/^[,.\s—–-]+/, "").trim();
    }
  }

  // Strip exclamation marks
  body = body.replace(/!/g, ".");
  body = body.replace(/\.{2,}/g, ".").replace(/\.\s*\./g, ".");

  // Strip AI-prose openers
  body = body.replace(/^(I've been feeling|I've been thinking|I often think|I remember the day|I once sat|I keep thinking)\s/i, "");
  // Strip trailing "you know?" / "right?" when tacked on
  body = body.replace(/,?\s*(you know\??|right\??)\s*$/i, "");

  // Final cleanup
  body = body.replace(/\s{2,}/g, " ").trim();

  // Reject if too short after cleanup
  if (!body || body.split(/\s+/).length < 2) return null;

  // Final truncation check
  const finalTruncated = truncationSignals.some((re) => re.test(body));
  if (finalTruncated && body.split(/\s+/).length > 10) return null;

  return body;
}
