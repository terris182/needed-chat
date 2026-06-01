"use client";

import { Suspense, useState, useEffect } from "react";
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
  const [icebreakerRoom, setIcebreakerRoom] = useState<Recommendation | null>(null);
  const [icebreaker, setIcebreaker] = useState<string | null>(null);
  const [icebreakerAnswer, setIcebreakerAnswer] = useState("");
  const [loadingIcebreaker, setLoadingIcebreaker] = useState(false);
  const supabase = createClient();

  // Read status from URL params and recommendations from sessionStorage on mount
  useEffect(() => {
    const urlStatus = searchParams.get("status");
    if (urlStatus === "crisis") {
      setStatus("crisis");
      setCrisisResources([
        { name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988" },
        { name: "Crisis Text Line", contact: "Text HOME to 741741" },
        { name: "Samaritans (UK)", contact: "Call 116 123" },
        { name: "Befrienders Worldwide", contact: "befrienders.org" },
      ]);
      return;
    }
    if (urlStatus === "no_match") {
      setStatus("no_match");
      return;
    }

    // Try to load recommendations from sessionStorage
    try {
      const stored = sessionStorage.getItem("recommendations");
      if (stored) {
        const parsed = JSON.parse(stored) as Recommendation[];
        if (parsed.length > 0) {
          setRecommendations(parsed);
          setStatus("done");
          sessionStorage.removeItem("recommendations");
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [searchParams]);

  async function handleSelectRoom(rec: Recommendation) {
    setLoadingIcebreaker(true);
    setIcebreakerRoom(rec);

    // Fetch icebreaker question for this room
    try {
      const res = await fetch("/api/ai/generate-icebreaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_title: rec.title, category: "general", tags: [] }),
      });
      const data = await res.json();
      if (data.question) setIcebreaker(data.question);
    } catch {
      setIcebreaker("What's been on your mind about this?");
    }
    setLoadingIcebreaker(false);
  }

  async function handleJoinWithIcebreaker() {
    if (!icebreakerRoom || !icebreaker || !icebreakerAnswer.trim()) return;
    setLoading(true);

    // Single server call: sets icebreaker, posts answer, joins, triggers bots
    await fetch("/api/rooms/join-with-icebreaker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: icebreakerRoom.room_id,
        icebreaker,
        answer: icebreakerAnswer.trim(),
      }),
    });

    window.location.href = `/rooms/${icebreakerRoom.slug}`;
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

  // Icebreaker step — after selecting a room
  if (icebreakerRoom && icebreaker) {
    return (
      <main className="min-h-dvh px-4 py-6 max-w-lg mx-auto">
        <button
          onClick={() => { setIcebreakerRoom(null); setIcebreaker(null); setIcebreakerAnswer(""); }}
          className="text-sm text-text-tertiary hover:text-text-primary mb-4"
        >
          &larr; Back to rooms
        </button>

        <Card>
          <h3 className="font-semibold text-sm text-text-primary">{icebreakerRoom.title}</h3>
          <p className="text-xs text-text-secondary mt-1 mb-4">
            Answer to enter — your response will be shared as your first message in the room.
          </p>
          <p className="text-xl font-semibold text-text-primary leading-snug mb-3">
            {icebreaker}
          </p>
          <textarea
            value={icebreakerAnswer}
            onChange={(e) => setIcebreakerAnswer(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
            rows={3}
            placeholder="Share what comes to mind..."
            maxLength={1000}
          />
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              onClick={handleJoinWithIcebreaker}
              loading={loading}
              disabled={!icebreakerAnswer.trim() || loading}
            >
              Enter room
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  // Loading icebreaker
  if (icebreakerRoom && loadingIcebreaker) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-sm text-text-tertiary">Loading...</p>
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
        {recommendations.map((rec, i) => (
          <Card key={rec.room_id}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-sm text-text-primary">{rec.title}</h3>
              <Badge variant={i === 0 ? "accent" : "green"}>
                {i === 0 ? "Strong match" : "Active now"}
              </Badge>
            </div>
            <p className="text-xs text-text-secondary mb-3">{rec.reason}</p>
            <Button
              size="sm"
              onClick={() => handleSelectRoom(rec)}
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
