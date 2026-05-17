import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm mx-auto space-y-8">
        {/* Logo / wordmark */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">needed.chat</h1>
          <p className="text-text-secondary text-sm mt-1">
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
