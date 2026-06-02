import Link from "next/link";

function VennLogo({ className }: { className?: string }) {
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
      {/* Left circle */}
      <circle cx="24" cy="28" r="15" fill="white" />
      {/* Right circle */}
      <circle cx="32" cy="28" r="15" fill="white" />
      {/* Intersection — re-filled with accent */}
      <clipPath id="left-clip">
        <circle cx="24" cy="28" r="15" />
      </clipPath>
      <circle cx="32" cy="28" r="15" fill="currentColor" clipPath="url(#left-clip)" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm mx-auto space-y-8">
        {/* Logo + wordmark */}
        <div className="flex flex-col items-center gap-3">
          <VennLogo className="text-accent" />
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">needed.chat</h1>
          <p className="text-text-secondary text-sm">
            What have you needed to talk about?
          </p>
        </div>

        {/* CTA */}
        <Link
          href="/auth"
          className="inline-flex items-center justify-center w-full rounded-md bg-accent text-white font-medium py-3 px-6 text-sm hover:bg-accent-hover transition-colors"
        >
          Get started
        </Link>

        <p className="text-xs text-text-tertiary">
          Anonymous rooms. Real conversations. No profiles, no followers.
        </p>
      </div>
    </main>
  );
}