"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const ADJECTIVES = [
  "quiet", "bright", "gentle", "warm", "steady", "calm", "swift", "bold",
  "clear", "kind", "deep", "soft", "wild", "true", "still", "wise",
];
const NOUNS = [
  "river", "meadow", "pine", "harbor", "ember", "ridge", "brook", "stone",
  "cloud", "spark", "bloom", "frost", "shore", "dawn", "leaf", "moon",
];

function generateUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `${adj}-${noun}-${num}`;
}

type Step = "age" | "username";

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("age");
  const [username, setUsername] = useState(generateUsername());
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function reroll() {
    setUsername(generateUsername());
  }

  async function handleComplete() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Session expired or missing — send them back to sign in instead of hanging.
        window.location.href = "/auth";
        return;
      }

      // Create profile (upsert to handle re-onboarding)
      const { error: profileError } = await supabase.from("users_profile").upsert({
        id: user.id,
        username,
      });
      if (profileError) throw profileError;

      // Track activation event (non-critical — don't block on failure)
      await supabase.from("activation_events").insert({
        user_id: user.id,
        event: "completed_onboarding",
      });

      window.location.href = "/today";
    } catch {
      setErrorMsg("Something went wrong saving your name. Please try again.");
      setLoading(false);
    }
  }

  if (step === "age") {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-6">
          <h1 className="text-xl font-semibold">Are you 18 or older?</h1>
          <p className="text-sm text-text-secondary">
            needed.chat is for adults. Some rooms discuss sensitive topics.
          </p>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => setStep("username")}>
              Yes, I&apos;m 18+
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => (window.location.href = "/")}
            >
              No
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-6">
        <h1 className="text-xl font-semibold">Your anonymous name</h1>
        <p className="text-sm text-text-secondary">
          Everyone gets a random name. No one will know who you are.
        </p>

        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-lg font-semibold text-accent">{username}</p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={reroll} className="flex-1">
            Re-roll
          </Button>
          <Button onClick={handleComplete} loading={loading} className="flex-1">
            That&apos;s me
          </Button>
        </div>

        {errorMsg && (
          <p role="alert" className="text-xs text-red-500">
            {errorMsg}
          </p>
        )}

        <button
          type="button"
          onClick={() => setStep("age")}
          className="text-xs text-text-tertiary hover:text-text-secondary"
        >
          &larr; Back
        </button>
      </div>
    </main>
  );
}
