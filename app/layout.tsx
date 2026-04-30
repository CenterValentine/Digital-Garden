import type { Metadata, Viewport } from "next";
import React from "react";
import localFont from "next/font/local";
import "./globals.css";

import Head from "./layout/head";
import NavBar from "@/components/client/nav/NavBar";
import { Toaster } from "@/components/client/ui/sonner";
import { SettingsInitializer } from "@/components/settings/SettingsInitializer";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Head></Head>
      <body className={`min-h-screen w-full relative ${geistSans.variable} ${geistMono.variable}`}>
        {/* Initialize user settings on mount */}
        <SettingsInitializer />
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
      </body>
    </html>
  );
}
