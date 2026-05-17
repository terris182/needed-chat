"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

interface Recommendation {
  room_id: string;
  title: string;
  slug: string;
  score: number;
  reason: string;
  action: "auto_route" | "suggest";
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center"><p className="text-sm text-text-tertiary">Loading…</p></div>}>
      <RecommendationsContent />
    </Suspense>
  );
}

function RecommendationsContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "crisis" | "no_match">("idle");
  const [crisisResources, setCrisisResources] = useState<Array<{ name: string; contact: string }>>([]);
  const supabase = createClient();

  // This page can be reached from /today after submitting the brand question
  // The actual classification + matching happens via API calls

  async function handleJoinRoom(roomSlug: string, roomId: string) {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Create membership
    await supabase.from("room_members").upsert({
      room_id: roomId,
      user_id: user.id,
      role: "member",
    });

    // Track activation event
    await supabase.from("activation_events").insert({
      user_id: user.id,
      event: "joined_room",
      metadata: { room_id: roomId },
    });

    window.location.href = `/rooms/${roomSlug}`;
  }

  if (status === "crisis") {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-6">
          <h1 className="text-xl font-semibold text-text-primary">
            We want to make sure you&apos;re okay.
          </h1>
          <p className="text-sm text-text-secondary">
            What you shared sounds like it might be really heavy right now.
            Here are some people who are ready to listen:
          </p>
          <div className="space-y-3">
            {crisisResources.map((r) => (
              <Card key={r.name}>
                <p className="font-medium text-sm">{r.name}</p>
                <p className="text-sm text-accent">{r.contact}</p>
              </Card>
            ))}
          </div>
          <Button variant="secondary" onClick={() => (window.location.href = "/today")}>
            Back to Today
          </Button>
        </div>
      </main>
    );
  }

  if (status === "no_match") {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-6">
          <h1 className="text-xl font-semibold text-text-primary">
            We&apos;re looking for your room.
          </h1>
          <p className="text-sm text-text-secondary">
            We don&apos;t have a perfect match yet, but we&apos;re keeping an eye out.
            We&apos;ll invite you when we find others thinking about similar things.
          </p>
          <Button onClick={() => (window.location.href = "/today")}>
            Back to Today
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-lg font-semibold text-text-primary mb-1">Rooms for you</h1>
      <p className="text-sm text-text-secondary mb-6">
        Based on what&apos;s on your mind, here are conversations that fit.
      </p>

      <div className="space-y-3">
        {recommendations.map((rec) => (
          <Card key={rec.room_id}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-sm text-text-primary">{rec.title}</h3>
              {rec.action === "auto_route" && (
                <Badge variant="accent">Strong match</Badge>
              )}
            </div>
            <p className="text-xs text-text-secondary mb-3">{rec.reason}</p>
            <Button
              size="sm"
              onClick={() => handleJoinRoom(rec.slug, rec.room_id)}
              loading={loading}
            >
              Join room
            </Button>
          </Card>
        ))}
      </div>

      {recommendations.length === 0 && status === "idle" && (
        <p className="text-sm text-text-tertiary text-center mt-8">
          Answer today&apos;s question to get matched with rooms.
        </p>
      )}
    </main>
  );
}
