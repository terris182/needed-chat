import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

// Vercel Cron: runs daily at 8pm PT (users set their own digest_time, this is the dispatch window)
// vercel.json: { "crons": [{ "path": "/api/cron/daily-digest", "schedule": "0 4 * * *" }] }
// 4 UTC = 8pm PT (winter) / 9pm PT (summer) — close enough for v1
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get users with digest enabled who have active room memberships
    const { data: users } = await supabase
      .from("users_profile")
      .select("id, username")
      .eq("digest_email_enabled", true)
      .eq("account_status", "active")
      .is("safety_blackout_until", null); // respect blackout

    if (!users?.length) {
      return NextResponse.json({ ok: true, emails_sent: 0 });
    }

    // Get user emails from auth.users
    let emailsSent = 0;

    for (const user of users) {
      // Get the user's email from Supabase auth
      const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
      if (!authUser?.user?.email) continue;

      // Get their rooms with recent activity
      const { data: memberships } = await supabase
        .from("room_members")
        .select("room_id, rooms(title, slug, message_count_24h, daily_prompt, ad_safety_rating)")
        .eq("user_id", user.id)
        .eq("engagement_status", "active");

      if (!memberships?.length) continue;

      const activeRooms = memberships.filter(
        (m) => (m.rooms as any)?.message_count_24h > 0
      );

      if (!activeRooms.length) continue; // don't send empty digests

      // Get pending invitations
      const { data: invites } = await supabase
        .from("room_invites")
        .select("rooms(title)")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .limit(3);

      // Build email HTML
      const roomsHtml = activeRooms
        .map((m) => {
          const room = m.rooms as any;
          const tierColor = room.ad_safety_rating === "red" ? "#A04A4A" : room.ad_safety_rating === "yellow" ? "#B89045" : "#6B8B5A";
          return `
            <div style="margin-bottom:16px;padding:16px;background:#fff;border:1px solid #E5E5E3;border-radius:12px;">
              <div style="font-weight:600;font-size:15px;color:#1A1A1A;">${room.title}</div>
              <div style="font-size:13px;color:#6B6B6B;margin-top:4px;">${room.message_count_24h} messages today</div>
              ${room.daily_prompt ? `<div style="font-size:13px;color:#6B6B6B;font-style:italic;margin-top:8px;">"${room.daily_prompt}"</div>` : ""}
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/rooms/${room.slug}" style="display:inline-block;margin-top:12px;color:#C66B3D;font-size:13px;font-weight:500;text-decoration:none;">Open needed.chat →</a>
            </div>
          `;
        })
        .join("");

      const invitesHtml = invites?.length
        ? `
          <div style="margin-top:24px;">
            <div style="font-size:14px;font-weight:600;color:#1A1A1A;margin-bottom:8px;">Invitations waiting</div>
            ${invites.map((i) => `<div style="font-size:13px;color:#6B6B6B;">• ${(i.rooms as any)?.title}</div>`).join("")}
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/today" style="display:inline-block;margin-top:8px;color:#C66B3D;font-size:13px;font-weight:500;text-decoration:none;">View invitations →</a>
          </div>
        `
        : "";

      const html = `
        <div style="max-width:420px;margin:0 auto;font-family:Inter,system-ui,sans-serif;background:#FAFAF8;padding:32px 20px;">
          <div style="font-size:20px;font-weight:700;color:#1A1A1A;margin-bottom:4px;">Your rooms today</div>
          <div style="font-size:13px;color:#9B9B9B;margin-bottom:24px;">What's been happening in your conversations</div>
          ${roomsHtml}
          ${invitesHtml}
          <div style="margin-top:32px;padding-top:16px;border-top:1px solid #E5E5E3;font-size:11px;color:#9B9B9B;text-align:center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings" style="color:#9B9B9B;">Unsubscribe from this digest</a>
            · <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings" style="color:#9B9B9B;">Pause matchmaking</a>
          </div>
        </div>
      `;

      try {
        await getResend().emails.send({
          from: "needed.chat <digest@needed.chat>",
          to: authUser.user.email,
          subject: `Your rooms — ${activeRooms.length} active conversation${activeRooms.length > 1 ? "s" : ""}`,
          html,
        });
        emailsSent++;
      } catch (emailError) {
        console.error(`Failed to send digest to ${user.id}:`, emailError);
      }
    }

    return NextResponse.json({ ok: true, emails_sent: emailsSent });
  } catch (error) {
    console.error("daily-digest error:", error);
    return NextResponse.json({ error: "Digest failed" }, { status: 500 });
  }
}
