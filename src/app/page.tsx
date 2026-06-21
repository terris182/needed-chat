import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "needed.chat — anonymous rooms for whatever you needed to talk about",
  description:
    "Answer one question and get matched into a small, anonymous room of people going through the same thing. No profiles, no followers — just the conversation you needed. Free.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "needed.chat — you're not alone, and you don't have to perform",
    description:
      "Anonymous rooms that match you with a few people going through the same thing. No profiles. No followers. Free.",
    url: "/",
    type: "website",
  },
};

function ChatLogo({ className }: { className?: string }) {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="56" height="56" rx="14" fill="currentColor" />
      <rect x="14" y="11" width="28" height="20" rx="4" fill="white" />
      <polygon points="16,29 12,38 24,29" fill="white" />
    </svg>
  );
}

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "Say what's on your mind",
    body: "Answer one question — as little or as much as you want. It stays private.",
  },
  {
    n: "2",
    title: "Get matched",
    body: "We find a small room of people sitting with the same thing you are.",
  },
  {
    n: "3",
    title: "Talk, anonymously",
    body: "No real names. No history to perform. Just say it.",
  },
];

const HEAVY_ROOMS = [
  "Summer Loneliness",
  "Late Night Thoughts",
  "Grieving While Functioning",
  "Can't Stop Overthinking",
];

const FUN_ROOMS = ["World Cup 2026", "Swifties", "New Music Friday", "Stranger Things"];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "needed.chat",
  url: "https://needed.chat",
  applicationCategory: "SocialNetworkingApplication",
  operatingSystem: "Web",
  description:
    "Anonymous, AI-matched chat rooms. Answer what you've needed to talk about and get matched into a small room of people going through the same thing.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function LandingPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center px-6 py-14 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="w-full max-w-md mx-auto space-y-14">
        {/* Hero */}
        <section className="flex flex-col items-center gap-4 text-center">
          <ChatLogo className="text-accent" />
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">needed.chat</h1>
          <p className="text-xl font-semibold text-text-primary leading-snug">
            What have you needed to talk about?
          </p>
          <p className="text-sm text-text-secondary leading-relaxed max-w-xs">
            Anonymous rooms that match you with a few people going through the same
            thing. No profiles. No followers. Just the conversation you needed.
          </p>
          <Link
            href="/auth"
            className="mt-2 inline-flex items-center justify-center w-full rounded-md bg-accent text-white font-medium py-3 px-6 text-sm hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Find your room
          </Link>
          <p className="text-xs text-text-secondary">Free · Anonymous · No app to download</p>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-it-works">
          <h2
            id="how-it-works"
            className="text-sm font-semibold text-text-secondary text-center mb-5"
          >
            How it works
          </h2>
          <ol className="space-y-4">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-accent-light text-accent text-sm font-semibold"
                >
                  {s.n}
                </span>
                <div>
                  <p className="text-sm font-medium text-text-primary">{s.title}</p>
                  <p className="text-sm text-text-secondary leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Example rooms */}
        <section aria-labelledby="rooms">
          <h2 id="rooms" className="text-sm font-semibold text-text-secondary text-center mb-1">
            Rooms for whatever you&apos;re carrying
          </h2>
          <p className="text-xs text-text-secondary text-center mb-5">
            — or whatever you&apos;re into.
          </p>

          <p className="text-xs font-medium text-text-tertiary mb-2">When it&apos;s heavy</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {HEAVY_ROOMS.map((r) => (
              <span
                key={r}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-primary"
              >
                {r}
              </span>
            ))}
          </div>

          <p className="text-xs font-medium text-text-tertiary mb-2">When it&apos;s fun</p>
          <div className="flex flex-wrap gap-2">
            {FUN_ROOMS.map((r) => (
              <span
                key={r}
                className="rounded-full border border-green/30 bg-green-light px-3 py-1.5 text-xs text-text-primary"
              >
                {r}
              </span>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="flex flex-col items-center gap-3 text-center">
          <p className="text-base font-medium text-text-primary">
            You&apos;re not alone, and you don&apos;t have to perform.
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center justify-center w-full rounded-md bg-accent text-white font-medium py-3 px-6 text-sm hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Find your room
          </Link>
        </section>

        {/* Footer */}
        <footer className="pt-2 text-center">
          <Link
            href="/blog"
            className="text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded"
          >
            Read the blog
          </Link>
          <p className="mt-3 text-[11px] text-text-tertiary">
            needed.chat — a place to be heard
          </p>
        </footer>
      </div>
    </main>
  );
}
