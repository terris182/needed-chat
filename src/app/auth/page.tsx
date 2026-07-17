"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

function AuthForm() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const urlError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    urlError === "could_not_verify"
      ? "That link didn't work — it may have expired. Enter your email and we'll send a fresh one."
      : ""
  );
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const next =
      nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
        ? `?next=${encodeURIComponent(nextParam)}`
        : "";
    const redirectTo = `${window.location.origin}/auth/callback${next}`;
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="text-sm text-text-secondary">
            We sent a magic link to <strong>{email}</strong>. Tap it to sign in.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Sign in to needed.chat</h1>
          <p className="text-sm text-text-secondary mt-1">
            No password needed — we&apos;ll email you a magic link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Send magic link
          </Button>
        </form>

        <p className="text-xs text-text-secondary text-center leading-relaxed">
          Your email is only used to sign you in. It&apos;s never shown to
          anyone — in rooms you&apos;re just an anonymous username.
        </p>

        <p className="text-xs text-text-tertiary text-center">
          You must be 18 or older to use needed.chat.
          <br />
          By continuing, you agree to our{" "}
          <a href="/terms" className="underline underline-offset-2">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
