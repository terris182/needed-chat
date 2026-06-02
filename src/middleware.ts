import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|api/admin|api/cron|api/webhooks|api/ai/generate-icebreaker|api/ai/bot-reply|api/ai/bot-continue|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
