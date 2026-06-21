import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-text-primary">This page wandered off.</h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          We couldn&apos;t find what you were looking for — but there&apos;s still a room for you.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-accent text-white font-medium py-2.5 px-6 text-sm hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
