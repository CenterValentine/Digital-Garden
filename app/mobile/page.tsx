"use client";

/**
 * Mobile landing shell.
 *
 * This is the URL the React Native WebView loads by default
 * (EXPO_PUBLIC_DIGITAL_GARDEN_URL → /mobile). It is intentionally light: a
 * mobile-friendly entry point into the existing web app, NOT a second copy of
 * the product. Every link points at a real route discovered in the repo —
 * the workspace and settings — because "Notes", "AI chat", and "Flashcards"
 * are panels inside /content, not standalone pages.
 *
 * It also doubles as a live test surface for the native bridge: the
 * "Open project website" button rounds a `web:open-external-url` message
 * through the shell when running natively, and falls back to a new tab in a
 * normal browser.
 */

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { isNativeShell, openExternalUrl } from "@/lib/mobile-bridge/client";
import styles from "./mobile.module.css";

// `window.ReactNativeWebView` only exists on the client and never changes after
// load — a static external value. subscribe is a no-op; the server snapshot is
// `false`, the client snapshot reads the bridge. useSyncExternalStore renders
// the server value first then swaps on the client: no hydration mismatch and no
// setState-in-effect (which the React Compiler lint forbids).
const emptySubscribe = () => () => {};

const PRIMARY = {
  href: "/content",
  title: "Open Workspace",
  desc: "Your notes, file tree, editor, AI chat, and flashcards all live here.",
};

const SECONDARY = [
  { href: "/settings/ai", title: "AI Setup", desc: "Connect models & API keys" },
  { href: "/settings", title: "Settings", desc: "Account, storage, preferences" },
  { href: "/sign-in", title: "Sign in", desc: "If you're not logged in yet" },
];

// Swap to your real marketing/site URL; used to demo the external-link bridge.
const PROJECT_SITE = "https://davidvalentine.org";

export default function MobileHomePage() {
  const inShell = useSyncExternalStore(
    emptySubscribe,
    () => isNativeShell(), // client snapshot
    () => false // server snapshot
  );

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Digital Garden</h1>
        <p className={styles.subtitle}>
          {inShell ? "Mobile shell" : "Mobile web"}
        </p>
      </header>

      <Link href={PRIMARY.href} className={styles.primaryCard}>
        <span className={styles.cardTitle}>{PRIMARY.title}</span>
        <span className={styles.cardDesc}>{PRIMARY.desc}</span>
      </Link>

      <div className={styles.grid}>
        {SECONDARY.map((item) => (
          <Link key={item.href} href={item.href} className={styles.card}>
            <span className={styles.cardTitle}>{item.title}</span>
            <span className={styles.cardDesc}>{item.desc}</span>
          </Link>
        ))}
      </div>

      <button
        type="button"
        className={styles.externalButton}
        onClick={() => openExternalUrl(PROJECT_SITE)}
      >
        Open project website ↗
      </button>

      <p className={styles.note}>
        {inShell
          ? "Links open inside the app; external links open in your browser."
          : "Open this page inside the Digital Garden mobile app for the native shell."}
      </p>
    </main>
  );
}
