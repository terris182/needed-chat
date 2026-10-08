import { timingSafeEqual } from "node:crypto";

export type Caller =
  | { kind: "user"; userId: string }
  | { kind: "cron" };

function bearerMatches(authHeader: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authHeader);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Pure decision: a signed-in session user wins, otherwise a valid cron bearer
// is accepted (only when allowCron). Anything else is unauthenticated (null).
export function resolveCaller(
  sessionUserId: string | null | undefined,
  authHeader: string | null | undefined,
  cronSecret: string | undefined,
  allowCron = true
): Caller | null {
  if (sessionUserId) return { kind: "user", userId: sessionUserId };
  if (allowCron && bearerMatches(authHeader, cronSecret)) return { kind: "cron" };
  return null;
}
