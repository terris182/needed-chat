import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-base font-semibold tracking-tight text-ink">
            needed.chat
          </Link>
          <Link
            href="/today"
            className="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-surface text-sm font-medium hover:opacity-90 transition"
          >
            Start talking
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-2xl px-6 py-8 text-sm text-ink-muted">
          <p>
            needed.chat is a free, anonymous space for peer support. It is not a
            substitute for professional care.
          </p>
          <p className="mt-3">
            In crisis? Call or text <strong className="text-ink-soft">988</strong>{" "}
            (US) or visit{" "}
            <a
              href="https://findahelpline.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              findahelpline.com
            </a>
            .
          </p>
          <nav className="mt-4 flex gap-4">
            <Link href="/blog" className="underline underline-offset-2">
              Articles
            </Link>
            <Link href="/today" className="underline underline-offset-2">
              Talk now
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
