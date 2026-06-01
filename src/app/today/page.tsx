"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components/ui/tab-bar";
import { InvitationCard } from "@/components/ui/invitation-card";
import { RoomTile } from "@/components/ui/room-tile";
import { createClient } from "@/lib/supabase/client";

interface Invite {
  id: string;
  room_id: string;
  reason: string;
  fit_score: number;
  rooms: {
    title: string;
    slug: string;
    ad_safety_rating: "green" | "yellow" | "red";
    active_member_count: number;
  };
}

interface MyRoom {
  room_id: string;
  rooms: {
    title: string;
    slug: string;
    description: string;
    ad_safety_rating: "green" | "yellow" | "red";
    active_member_count: number;
    message_count_24h: number;
  };
}

export default function TodayPage() {
  const router = useRouter();
  const supabase = createClient();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [myRooms, setMyRooms] = useState<MyRoom[]>([]);
  const [icebreaker, setIcebreaker] = useState<string | null>(null);

  // Fetch icebreaker independently — no auth needed, fires immediately
  useEffect(() => {
    fetch("/api/ai/generate-icebreaker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_title: "Today", category: "general", tags: ["daily", "icebreaker"] }),
    })
      .then((res) => res.json())
      .then((data) => { if (data.question) setIcebreaker(data.question); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load pending invites
      const { data: inv } = await supabase
        .from("room_invites")
        .select("id, room_id, reason, fit_score, rooms(title, slug, ad_safety_rating, active_member_count)")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("fit_score", { ascending: false })
        .limit(5);
      if (inv) setInvites(inv as unknown as Invite[]);

      // Load my rooms
      const { data: rooms } = await supabase
        .from("room_members")
        .select("room_id, rooms(title, slug, description, ad_safety_rating, active_member_count, message_count_24h)")
        .eq("user_id", user.id)
        .eq("engagement_status", "active")
        .limit(10);
      if (rooms) setMyRooms(rooms as unknown as MyRoom[]);
    }
    load();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);

    try {
      // Step 1: Classify
      const classifyRes = await fetch("/api/ai/classify-needed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ private_text: text.trim() }),
      });
      const classification = await classifyRes.json();

      if (classification.error) {
        console.error(classification.error);
        setSubmitting(false);
        return;
      }

      // Track activation event
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("activation_events").insert({
          user_id: user.id,
          event: "answered_brand_question",
        });
      }

      // Step 2: Match or create room (pass icebreaker context for bots)
      const matchRes = await fetch("/api/ai/match-or-create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          private_text: text.trim(),
          classification,
          ...(icebreaker && { icebreaker_question: icebreaker }),
        }),
      });
      const matchResult = await matchRes.json();

      if (matchResult.action === "crisis") {
        router.push("/recommendations?status=crisis");
        return;
      }

      if (matchResult.action === "no_match") {
        router.push("/recommendations?status=no_match");
        return;
      }

      // Store results for recommendations page
      sessionStorage.setItem("recommendations", JSON.stringify(matchResult.recommendations));
      router.push("/recommendations");
    } catch (error) {
      console.error("Submit error:", error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptInvite(inviteId: string, roomSlug: string, roomId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("room_invites")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", inviteId);

    await supabase.from("room_members").upsert({
      room_id: roomId,
      user_id: user.id,
      role: "member",
    });

    router.push(`/rooms/${roomSlug}`);
  }

  async function handleDeclineInvite(inviteId: string) {
    await supabase
      .from("room_invites")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", inviteId);

    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
  }

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-sm border-b border-border-light px-4 py-3">
        <h1 className="text-lg font-semibold text-text-primary">Today</h1>
      </header>

      <main className="px-4 py-4 space-y-6 max-w-lg mx-auto">
        {/* Daily icebreaker + brand question */}
        <section>
          {icebreaker ? (
            <p className="text-xl font-semibold text-text-primary leading-snug">
              {icebreaker}
            </p>
          ) : (
            <p className="text-xl font-semibold text-text-primary leading-snug">
              What have you needed to talk about?
            </p>
          )}
          <form onSubmit={handleSubmit} className="mt-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-3 text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              rows={3}
              placeholder={icebreaker ? "Share what comes to mind..." : "I've been thinking about..."}
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className="mt-2 w-full rounded-md bg-accent text-white font-medium py-2.5 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {submitting ? "Finding your room..." : "Find my room"}
            </button>
          </form>
        </section>

        {/* Invitations */}
        {invites.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-text-secondary mb-2">Invitations</h2>
            <div className="space-y-3">
              {invites.map((inv) => (
                <InvitationCard
                  key={inv.id}
                  roomName={inv.rooms.title}
                  reason={inv.reason || "This looks like a fit for what's on your mind."}
                  safetyTier={inv.rooms.ad_safety_rating.toUpperCase() as "GREEN" | "YELLOW" | "RED"}
                  memberCount={inv.rooms.active_member_count}
                  onAccept={() => handleAcceptInvite(inv.id, inv.rooms.slug, inv.room_id)}
                  onDecline={() => handleDeclineInvite(inv.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* On This Day (Phase 2) */}
        <section>
          <h2 className="text-sm font-medium text-text-secondary mb-2">On this day</h2>
          <p className="text-xs text-text-tertiary">
            Your reflections from past conversations will appear here.
          </p>
        </section>

        {/* Active rooms */}
        <section>
          <h2 className="text-sm font-medium text-text-secondary mb-2">Your rooms</h2>
          {myRooms.length > 0 ? (
            <div className="space-y-2">
              {myRooms.map((mr) => (
                <RoomTile
                  key={mr.room_id}
                  name={mr.rooms.title}
                  description={mr.rooms.description}
                  memberCount={mr.rooms.active_member_count}
                  safetyTier={mr.rooms.ad_safety_rating.toUpperCase() as "GREEN" | "YELLOW" | "RED"}
                  hasUnread={mr.rooms.message_count_24h > 0}
                  onClick={() => router.push(`/rooms/${mr.rooms.slug}`)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">
              Answer today&apos;s question to get matched with a room.
            </p>
          )}
        </section>
      </main>

      <TabBar />
    </div>
  );
}
