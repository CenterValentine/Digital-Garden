import type { Metadata } from "next";
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
  title: "Create Next App",
  description:
    "Generatehttps://www.youtube.com/watch?v=-g1yKRo5XtYd by create next app",
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
