import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms of service for needed.chat — a free, anonymous space for peer support.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold text-ink tracking-tight">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: July 16, 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-soft">
        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            What needed.chat is (and isn&apos;t)
          </h2>
          <p>
            needed.chat matches you into small, anonymous chat rooms with people
            thinking about the same things you are. It is a peer-support and
            conversation space. It is <strong>not</strong> therapy, medical
            care, or professional mental-health treatment, and it is not a
            crisis service. If you are in crisis, call or text{" "}
            <strong>988</strong> (US) or visit{" "}
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
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            Who can use it
          </h2>
          <p>
            You must be 18 or older. By creating an account you confirm that
            you are.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            Your account
          </h2>
          <p>
            You sign in with an email address and appear to others only as an
            anonymous username. You&apos;re responsible for what happens under
            your account. Don&apos;t share access to it, and don&apos;t create
            accounts to evade a suspension.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            House rules
          </h2>
          <p>Rooms only work if they feel safe. You agree not to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              harass, threaten, shame, or deliberately hurt other people in a
              room;
            </li>
            <li>
              try to identify other members, share anyone&apos;s personal
              information, or share screenshots of room conversations;
            </li>
            <li>
              use the service to advertise, spam, scam, or solicit;
            </li>
            <li>
              post content that is illegal, that sexualizes minors, or that
              encourages self-harm or violence;
            </li>
            <li>
              scrape the service or interfere with how it runs.
            </li>
          </ul>
          <p className="mt-2">
            We can remove content, close rooms, or suspend accounts that break
            these rules — quietly and without notice if needed to keep a room
            safe.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            AI in the product
          </h2>
          <p>
            needed.chat uses AI to read what you tell us you need to talk
            about, match you to rooms, and generate things like icebreakers and
            summaries. Some rooms may also include AI participants that take
            part in the conversation. AI-generated content can be wrong —
            don&apos;t treat anything in a room as professional advice.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            Subscriptions
          </h2>
          <p>
            The core service is free. Paid plans (Plus and Host) are billed
            monthly through Stripe and renew automatically until you cancel.
            You can cancel anytime; your plan stays active until the end of the
            billing period already paid for. Prices may change — we&apos;ll
            tell you before a change affects you.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            Your content
          </h2>
          <p>
            What you write is yours. You give us the limited license we need to
            operate the service — to store, display, and process your messages
            so rooms work. We don&apos;t claim ownership and we don&apos;t use
            your private answers or messages for advertising.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">
            Disclaimers
          </h2>
          <p>
            The service is provided &quot;as is.&quot; People in rooms are
            peers, not professionals, and we don&apos;t vet, endorse, or verify
            what anyone says. To the fullest extent allowed by law, we
            aren&apos;t liable for indirect or consequential damages arising
            from your use of the service, and our total liability is limited to
            the amount you paid us in the twelve months before a claim.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">Changes</h2>
          <p>
            We may update these terms. If a change is significant, we&apos;ll
            post it here and update the date at the top. Continuing to use
            needed.chat after a change means you accept it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink mb-2">Contact</h2>
          <p>
            Questions about these terms:{" "}
            <a
              href="mailto:support@rise.la"
              className="underline underline-offset-2"
            >
              support@rise.la
            </a>
            . See also our{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
