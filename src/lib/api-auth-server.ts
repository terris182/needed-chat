import { createClient } from "@/lib/supabase/server";
import { resolveCaller, type Caller } from "@/lib/api-auth";

// Resolves who is calling an AI route: the cookie session user, or the cron
// bearer when allowed. Returns null when neither is present (respond 401).
export async function getCaller(request: Request, allowCron = true): Promise<Caller | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return resolveCaller(
    user?.id,
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
    allowCron
  );
}
