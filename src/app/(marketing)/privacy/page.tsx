import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How needed.chat collects, uses, and protects your information — written in plain language.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold text-ink tracking-tight">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: July 16, 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-soft">
        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            The short version
          </h2>
          <p>
            You sign in with an email; nobody in a room ever sees it. In rooms
            you are only an anonymous username. We don&apos;t sell your data,
            and we don&apos;t use what you write to target advertising.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            What we collect
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Email address</strong> — used to send you sign-in links
              and digest emails (on by default; email us to turn them off).
              Never shown to other users.
            </li>
            <li>
              <strong>Your answers</strong> to &quot;what have you needed to
              talk about?&quot; — never shown to other members. They are
              stored and processed automatically (including by AI) to match
              you to rooms and to detect crisis situations.
            </li>
            <li>
              <strong>Room messages and journal entries</strong> — stored so
              the product works.
            </li>
            <li>
              <strong>Usage events</strong> (like completing onboarding or
              joining a room) and standard, privacy-respecting web analytics.
            </li>
            <li>
              <strong>Payment details</strong> if you subscribe — handled by
              Stripe. We never see your card number.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            How we use it
          </h2>
          <p>
            To match you into rooms, run conversations, send you the emails you
            asked for, keep rooms safe (moderation), and improve the product.
            Your private answers and messages are processed by AI models —
            including third-party AI providers — to do the matching and power
            AI features. Some rooms may include AI participants in the
            conversation.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">Ads</h2>
          <p>
            The free plan may show sponsored placements in rooms whose topics
            are rated appropriate for advertising. Placements are based on the
            room&apos;s topic — not on the content of your answers or
            messages — and we don&apos;t sell your personal information to
            advertisers.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            Who we share it with
          </h2>
          <p>
            Only the service providers we need to run needed.chat: Supabase
            (database and authentication), Vercel (hosting and analytics),
            OpenAI (AI matching and features), Stripe (payments), and Resend
            (email delivery). Each receives only what it needs to do its job.
            We may also disclose information if the law requires it or to
            prevent serious harm.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            Anonymity, honestly stated
          </h2>
          <p>
            Anonymity here means other members can&apos;t see who you are. It
            doesn&apos;t mean zero data exists: we (and the providers above)
            store your email and content as described so the service can
            function. Staff access to content is limited to what moderation
            and support require.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            Retention and deletion
          </h2>
          <p>
            We keep your data while your account is active. To delete your
            account and its data, email{" "}
            <a
              href="mailto:terriskenlin@gmail.com"
              className="underline underline-offset-2"
            >
              terriskenlin@gmail.com
            </a>{" "}
            from your sign-in address and we&apos;ll remove it from our active
            systems within 30 days. Copies may persist for a limited time in
            backups and with our service providers on their own deletion
            schedules, and we keep records we&apos;re legally required to keep
            (like payment records).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">Cookies</h2>
          <p>
            We use cookies only to keep you signed in (Supabase authentication).
            Vercel Analytics collects aggregate page-view data; it does not use
            advertising cookies. We don&apos;t run third-party ad trackers.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">Children</h2>
          <p>
            needed.chat is for adults 18 and older. We don&apos;t knowingly
            collect information from anyone under 18; if we learn we have, we
            delete it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">Changes</h2>
          <p>
            If we change this policy in a meaningful way, we&apos;ll post the
            update here and change the date at the top.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">Contact</h2>
          <p>
            Privacy questions:{" "}
            <a
              href="mailto:terriskenlin@gmail.com"
              className="underline underline-offset-2"
            >
              terriskenlin@gmail.com
            </a>
            . See also our{" "}
            <Link href="/terms" className="underline underline-offset-2">
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
