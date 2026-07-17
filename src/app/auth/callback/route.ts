import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  // Only allow same-site relative paths to prevent open redirects.
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/today";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // New users (no profile yet) go through onboarding; returning users
      // skip straight to where they were headed.
      const userId = data.session?.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from("users_profile")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        if (!profile) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=could_not_verify`);
}
