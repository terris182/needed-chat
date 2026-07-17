import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to landing (except public routes).
  // Public: landing, auth flows, and all marketing/SEO surfaces (blog + sitemap/robots).
  const pathname = request.nextUrl.pathname;
  const publicPaths = ["/", "/auth", "/auth/callback", "/auth/confirm"];
  const isPublic =
    publicPaths.some((p) => pathname === p) ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/");

  if (!user && !isPublic) {
    // Send them to sign-in (not the landing page) and preserve where they
    // were headed so the magic-link flow can drop them back there.
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
