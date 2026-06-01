import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getArticle,
  getAllSlugs,
  articleUrl,
  SITE_URL,
  SITE_NAME,
} from "@/lib/blog";
import ArticleBody from "@/components/blog/ArticleBody";
import SoftCTA from "@/components/blog/SoftCTA";
import CrisisResources from "@/components/blog/CrisisResources";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  const url = articleUrl(slug);
  return {
    title: `${article.title} — needed.chat`,
    description: article.description,
    keywords: article.keywords,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: SITE_NAME,
      title: article.title,
      description: article.description,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl(slug) },
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/blog"
        className="text-sm text-ink-muted underline underline-offset-2"
      >
        ← All articles
      </Link>
      <p className="mt-6 text-xs uppercase tracking-wide text-ink-muted">
        {article.category} · {article.readingMinutes} min read
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink leading-snug">
        {article.title}
      </h1>
      <p className="mt-3 text-base text-ink-soft leading-relaxed">
        {article.description}
      </p>

      <article>
        <ArticleBody body={article.body} />
      </article>

      <SoftCTA />
      <CrisisResources />
    </main>
  );
}
