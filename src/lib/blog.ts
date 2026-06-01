// Blog / SEO content layer for needed.chat
// Data-driven so scheduled content batches can add articles by dropping a file
// in src/content/articles/ and registering it in the index.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://needed.chat";

export const SITE_NAME = "needed.chat";

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "quote"; text: string };

export type Article = {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  category: string;
  publishedAt: string; // ISO date
  updatedAt: string; // ISO date
  readingMinutes: number;
  body: Block[];
};

import { articles as rawArticles } from "@/content/articles";

export function getAllArticles(): Article[] {
  return [...rawArticles].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getArticle(slug: string): Article | undefined {
  return rawArticles.find((a) => a.slug === slug);
}

export function getAllSlugs(): string[] {
  return rawArticles.map((a) => a.slug);
}

export function articleUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}`;
}
