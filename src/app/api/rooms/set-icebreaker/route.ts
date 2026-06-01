import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

let _service: any = null;
function getService() {
  if (!_service) _service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return _service;
}

// Set icebreaker as daily_prompt on a room (authenticated users only)
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { room_id, icebreaker } = await request.json();
  if (!room_id || !icebreaker) {
    return NextResponse.json({ error: "Missing room_id or icebreaker" }, { status: 400 });
  }

  // Use service role to bypass RLS
  await getService().from("rooms").update({
    daily_prompt: icebreaker,
    daily_prompt_updated_at: new Date().toISOString(),
  }).eq("id", room_id);

  return NextResponse.json({ ok: true });
}
