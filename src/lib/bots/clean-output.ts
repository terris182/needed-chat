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
  "tbh", "idk", "imo", "smh", "iykyk",
];

const MAX_WORDS = 25;

export function cleanBotOutput(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let body = raw.trim();

  // Take only the first line (no multi-line responses)
  body = body.split("\n")[0].trim();

  // Strip any leading speaker handle the model echoed from the context format
  // (e.g. "warm-harbor-14: actual message" or doubled "bright-dawn-22: bright-dawn-22: ...").
  // Bot handles are slug-style: word(-word)+-digits. Strip one or more such prefixes.
  let prevHandle: string;
  do {
    prevHandle = body;
    body = body.replace(/^[a-z0-9]{3,}(?:-[a-z0-9]+)*:\s*/i, "").trim();
  } while (body !== prevHandle && body.length > 0);

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

  // Check for banned phrases — WORD-BOUNDARY matched so we never corrupt words
  // that merely contain a banned token as a substring (e.g. "ngl" inside "single").
  for (const phrase of BANNED_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    if (regex.test(body)) {
      body = body.replace(regex, "").replace(/\s{2,}/g, " ").trim();
      body = body.replace(/^[,.\s—–-]+/, "").trim();
    }
  }

  // Strip exclamation marks
  body = body.replace(/!/g, ".");
  body = body.replace(/\.{2,}/g, ".").replace(/\.\s*\./g, ".");

  // Strip AI-prose openers
  body = body.replace(/^(I've been feeling|I've been thinking|I often think|I remember the day|I once sat|I keep thinking)\s/i, "");
  // Strip trailing "you know?" / "right?" / "huh?" when tacked on (handles repeated ?)
  body = body.replace(/,?\s*(you know\?*|right\?*|huh\?*)\s*$/i, "");

  // Strip hedge/filler openers that read as low-effort or borrowed-opinion
  body = body.replace(/^(idk,?\s*(i\s+(see it differently|mean|guess|think))?|tbh,?|i mean,?|i guess,?|fair,? but( also)?,?|ok,? but( also)?,?|wait,? but also,?|honestly,?|like,?)\s+/i, "");
  // Strip empty-agreement openers ("so true, ...", "exactly ...") — keep the substance after
  body = body.replace(/^(so true|so real|exactly|facts|big mood|same),?\s+/i, "");
  body = body.replace(/\s{2,}/g, " ").trim();

  // Reject pure-filler / empty-agreement whole messages (zero-like comments)
  const fillerOnly = /^(so true|exactly|facts|real|this|right\??|same|valid|mood|word|fr+|ikr|yep|yeah exactly|that tracks|big mood|no thoughts|preach)\.?$/i;
  if (fillerOnly.test(body.trim())) return null;

  // Tidy stray spaces before punctuation and dangling trailing punctuation/commas
  body = body.replace(/\s+([.,!?])/g, "$1");
  body = body.replace(/[\s,]+$/g, "").trim();
  body = body.replace(/\s{2,}/g, " ").trim();

  // Reject if too short after cleanup
  if (!body || body.split(/\s+/).length < 2) return null;

  // Reject if ends with a dangling apostrophe/quote (truncated mid-word)
  if (/[''`]$/.test(body)) return null;

  // Reject an unbalanced double-quote — an opened quote that never closed = truncated
  if (((body.match(/["“”]/g) || []).length % 2) === 1) return null;

  // Final truncation check
  const finalTruncated = truncationSignals.some((re) => re.test(body));
  if (finalTruncated && body.split(/\s+/).length > 10) return null;

  // Reject a dangling lead-in that never resolved: "...and it.", "...but i", "...so the."
  // (truncationSignals miss these because a trailing period makes them look complete.)
  if (/\b(and|but|or|so|because|plus|also|then)\s+(i|it|the|a|an|we|they|you|he|she|to|of|that|this|my|your)\.?$/i.test(body)) {
    return null;
  }

  return body;
}
