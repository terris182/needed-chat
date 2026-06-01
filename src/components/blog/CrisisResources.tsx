export default function CrisisResources() {
  return (
    <section
      aria-label="Crisis support resources"
      className="mt-12 rounded-2xl border border-line bg-surface px-6 py-6"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        If you need help right now
      </h2>
      <p className="mt-3 text-sm text-ink-soft leading-relaxed">
        needed.chat is peer support, not a crisis or medical service. If you are
        in danger or thinking about harming yourself, please reach out to trained
        help:
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-ink-soft leading-relaxed">
        <li>
          <strong className="text-ink">988</strong> — Suicide &amp; Crisis
          Lifeline (US): call or text 988, any time.
        </li>
        <li>
          <strong className="text-ink">Crisis Text Line</strong>: text
          <strong className="text-ink"> HOME</strong> to <strong className="text-ink">741741</strong> (US).
        </li>
        <li>
          Outside the US:{" "}
          <a
            href="https://findahelpline.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-ink underline underline-offset-2"
          >
            findahelpline.com
          </a>{" "}
          lists free, confidential lines by country.
        </li>
        <li>
          If someone&apos;s life is in immediate danger, call your local
          emergency number (911 in the US).
        </li>
      </ul>
    </section>
  );
}
