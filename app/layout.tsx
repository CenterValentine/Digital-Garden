import type { Metadata, Viewport } from "next";
import React from "react";
import { headers } from "next/headers";
import localFont from "next/font/local";
import {
  Source_Serif_4,
  Inter,
  Roboto,
  Newsreader,
  JetBrains_Mono,
  Caveat,
} from "next/font/google";
import "./globals.css";

import Head from "./layout/head";
import NavBar from "@/components/client/nav/NavBar";
import { Toaster } from "@/components/client/ui/sonner";
import { SettingsInitializer } from "@/components/settings/SettingsInitializer";
import { ThemeProvider, THEME_SCRIPT } from "@/lib/features/theme";

const geistSans = localFont({
  src: "../public/fonts/liberation-sans-regular.ttf",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "../public/fonts/cascadia-code-regular.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

// Per-provider chat fonts approximating each brand's typography. Exposed
// as CSS variables consumed by the AI provider themes
// (`lib/design/system/ai-providers.ts`): Claude → a refined serif,
// ChatGPT → a neutral grotesque (Inter ≈ Söhne), Gemini → Google's Roboto.
const claudeSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-claude",
  display: "swap",
});
const gptSans = Inter({
  subsets: ["latin"],
  variable: "--font-gpt",
  display: "swap",
});
const geminiSans = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-gemini",
  display: "swap",
});

// Personal site (davidvalentine.org) typography. Consumed by the
// `.personal-home` token scope in globals.css and the (personal) page routes:
// Newsreader → serif display + body, JetBrains Mono → labels/kickers,
// Caveat → hand-written margin annotations.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Digital Garden",
    template: "%s · Digital Garden",
  },
  description:
    "A personal knowledge space for notes, ideas, and connected thinking.",
  applicationName: "Digital Garden",
  keywords: ["notes", "knowledge management", "second brain", "digital garden"],
  authors: [{ name: "David Valentine" }],
  openGraph: {
    type: "website",
    siteName: "Digital Garden",
    title: "Digital Garden",
    description:
      "A personal knowledge space for notes, ideas, and connected thinking.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Digital Garden",
    description:
      "A personal knowledge space for notes, ideas, and connected thinking.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [
      {
        rel: "icon",
        url: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        rel: "icon",
        url: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request nonce from the proxy. Inert until the M-2 CSP rollout
  // adds `script-src 'nonce-{value}' 'strict-dynamic'` to the response
  // headers — at which point this attribute is what keeps the theme
  // script executing under strict CSP. Browsers ignore the attribute
  // when no referencing CSP is present, so this is safe to land now.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Pre-hydration theme application. Runs synchronously during HTML
          parse so .dark is on <html> before first paint — no FOUC.
          The script writes data-theme and data-theme-pref attributes that
          the SSR HTML doesn't have, so suppressHydrationWarning on <html>
          tells React the diff on this element is expected. Same escape
          hatch next-themes uses for this exact case.
          See lib/features/theme/script.ts.
        */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Head />
      </head>
      <body className={`min-h-screen w-full relative ${geistSans.variable} ${geistMono.variable} ${claudeSerif.variable} ${gptSans.variable} ${geminiSans.variable} ${newsreader.variable} ${jetbrainsMono.variable} ${caveat.variable}`}>
        {/* Initialize user settings on mount */}
        <SettingsInitializer />
        {/* Keep <html class="dark"> in sync as preference or OS scheme changes */}
        <ThemeProvider>
          {/* Note: /notes route has its own NotesNavBar */}
          {/* The navbar is hidden via CSS when notes layout renders */}
          <div className="notes-route-hides-default-nav">
            <NavBar />
          </div>
          <main className="pt-20 notes-route-no-padding">{children}</main>
          {/* Toast notifications - positioned in top-right corner */}
          {/* Notes route has navbar at 56px, so toasts appear below it via CSS */}
          <Toaster
            position="top-right"
            expand={false}
            richColors
            visibleToasts={3}
            duration={5000}
            closeButton
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
