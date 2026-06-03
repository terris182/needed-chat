// Server-side enforcement of bot message quality
// Prompts are suggestions — this is the actual filter
//
// CRITICAL: Never truncate mid-thought. If a message is too long or
// looks cut off, REJECT it entirely (return null). The bot will just
// skip and try again next cycle. A missing message > a broken one.

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

  if (!body) return null;

  // Detect truncated responses — if it looks cut off, reject entirely
  // Signs of truncation: ends mid-word, ends with a dangling connector,
  // or ends without any natural stopping point
  const truncationSignals = [
    /[a-z]$/,                           // ends mid-lowercase-word (no punctuation)
    /\b(and|but|or|the|a|an|to|of|in|for|with|that|is|are|was|were|be|been|have|has|had|do|does|did|will|would|could|should|can|may|might|shall)\s*$/i,
    /,\s*$/,                            // ends with comma
    /—\s*$/,                            // ends with em-dash
    /\.\.\s*$/,                         // ends with incomplete ellipsis
  ];

  // Check for truncation BEFORE any other processing
  const looksComplete = body.match(/[.!?…"')}\]]$/) ||  // ends with punctuation
    body.split(/\s+/).length <= 8;                        // short enough to be intentionally fragment-style

  if (!looksComplete) {
    // Try to salvage by cutting to last complete sentence
    const lastSentence = body.match(/^.*[.!?…]/);
    if (lastSentence && lastSentence[0].split(/\s+/).length >= 3) {
      body = lastSentence[0];
    } else {
      // Check if it LOOKS like a natural fragment (internet-speak doesn't always end with punctuation)
      const isTruncated = truncationSignals.some((re) => re.test(body));
      if (isTruncated) return null; // reject — don't post a cut-off message
    }
  }

  // Word count check — reject if too long, don't truncate
  const words = body.split(/\s+/);
  if (words.length > MAX_WORDS) {
    // Try to find a complete sentence within the limit
    const shortened = words.slice(0, MAX_WORDS).join(" ");
    const sentenceMatch = shortened.match(/^.*[.!?…]/);
    if (sentenceMatch && sentenceMatch[0].split(/\s+/).length >= 3) {
      body = sentenceMatch[0];
    } else {
      return null; // reject — too long with no natural break
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

  // Final cleanup
  body = body.replace(/\s{2,}/g, " ").trim();

  // Reject if too short after cleanup
  if (!body || body.split(/\s+/).length < 2) return null;

  // Final truncation check — one more pass
  const finalTruncated = truncationSignals.some((re) => re.test(body));
  if (finalTruncated && body.split(/\s+/).length > 8) return null;

  return body;
}
