"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-text-primary">
          Something went wrong on our end.
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          That&apos;s on us, not you. Give it a moment and try again.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-md bg-accent text-white font-medium py-2.5 px-6 text-sm hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface text-text-primary font-medium py-2.5 px-6 text-sm hover:bg-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
