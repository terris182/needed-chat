import Link from "next/link";
import type { Metadata } from "next";
import { getAllArticles, SITE_URL, SITE_NAME } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Articles — needed.chat",
  description:
    "Gentle, practical writing on loneliness, grief, anxiety, and the hard-to-say things — from needed.chat, a free anonymous space to talk.",
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/blog`,
    siteName: SITE_NAME,
    title: "Articles — needed.chat",
    description:
      "Gentle, practical writing on loneliness, grief, anxiety, and the hard-to-say things.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Articles — needed.chat",
    description:
      "Gentle, practical writing on loneliness, grief, anxiety, and the hard-to-say things.",
  },
};

export default function BlogIndexPage() {
  const articles = getAllArticles();
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Things worth talking about
      </h1>
      <p className="mt-3 text-base text-ink-soft leading-relaxed">
        Short, honest reads for the moments that are hard to put into words. No
        advice that pretends to fix you — just company and a few things that
        help.
      </p>
      <ul className="mt-10 space-y-8">
        {articles.map((a) => (
          <li key={a.slug} className="border-b border-line pb-8 last:border-0">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {a.category} · {a.readingMinutes} min read
            </p>
            <h2 className="mt-2 text-lg font-medium text-ink">
              <Link
                href={`/blog/${a.slug}`}
                className="hover:text-accent-ink transition"
              >
                {a.title}
              </Link>
            </h2>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">
              {a.description}
            </p>
            <Link
              href={`/blog/${a.slug}`}
              className="mt-3 inline-block text-sm text-accent-ink underline underline-offset-2"
            >
              Read
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
