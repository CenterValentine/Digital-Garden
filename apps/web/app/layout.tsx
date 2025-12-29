import type { Metadata } from "next";
import React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Head from "./layout/head";
import NavBar from "@/components/client/nav/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <body className="min-h-screen w-full relative">
        <NavBar />
        <main className="pt-20">{children}</main>
      </body>
    </html>
  );
}
