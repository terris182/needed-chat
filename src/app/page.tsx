import Link from "next/link";

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

export default function LandingPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm mx-auto space-y-8">
        {/* Logo + wordmark */}
        <div className="flex flex-col items-center gap-3">
          <ChatLogo className="text-accent" />
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