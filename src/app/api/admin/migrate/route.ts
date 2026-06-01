import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (request.headers.get("x-admin-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use Supabase pg_meta API (internal, available with service role)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace("https://", "https://");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      query: "alter table users_profile add column if not exists is_bot boolean default false;",
    }),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json({ status: res.status, data });
}
