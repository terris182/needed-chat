import Link from "next/link";

export default function SoftCTA() {
  return (
    <aside className="mt-12 rounded-2xl border border-line bg-accent-soft/60 px-6 py-7">
      <p className="text-base font-medium text-accent-ink">
        Sometimes it helps just to say it to someone.
      </p>
      <p className="mt-2 text-sm text-ink-soft leading-relaxed">
        needed.chat is a quiet, anonymous place to talk about whatever you have
        needed to talk about. No account needed to start, and it is free.
      </p>
      <Link
        href="/today"
        className="mt-4 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-surface text-sm font-medium hover:opacity-90 transition"
      >
        Start talking
      </Link>
    </aside>
  );
}
