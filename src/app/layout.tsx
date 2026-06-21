import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://needed.chat"),
  title: {
    default: "needed.chat — anonymous rooms for whatever you needed to talk about",
    template: "%s · needed.chat",
  },
  description:
    "Answer one question and get matched into a small, anonymous room of people going through the same thing. No profiles, no followers — just the conversation you needed. Free.",
  applicationName: "needed.chat",
  keywords: [
    "anonymous chat",
    "someone to talk to",
    "anonymous support rooms",
    "talk about loneliness",
    "late night thoughts",
    "free anonymous chat",
    "peer support",
  ],
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "needed.chat",
    title: "needed.chat — you're not alone, and you don't have to perform",
    description:
      "Anonymous rooms that match you with a few people going through the same thing. No profiles. No followers. Free.",
    url: "https://needed.chat",
    locale: "en_US",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "needed.chat" }],
  },
  twitter: {
    card: "summary",
    title: "needed.chat — you're not alone, and you don't have to perform",
    description:
      "Anonymous rooms that match you with a few people going through the same thing. No profiles. No followers. Free.",
    images: ["/icons/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "needed.chat",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#FAFAF8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="font-sans antialiased min-h-dvh bg-bg">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
