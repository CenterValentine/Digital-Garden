"use client";

/**
 * Client island for the mobile landing: the bridge-driven external-link button
 * and the shell/web status note. Kept separate so the landing page itself can
 * stay a server component (it fetches recent notes from Prisma).
 */

import { useSyncExternalStore } from "react";

import { isNativeShell, openExternalUrl } from "@/lib/mobile-bridge/client";
import styles from "./mobile.module.css";

// window.ReactNativeWebView only exists on the client and never changes after
// load. useSyncExternalStore renders the server snapshot (false) first, then
// swaps to the client value — no hydration mismatch, no setState-in-effect.
const emptySubscribe = () => () => {};

// Swap to your real marketing/site URL; demonstrates the external-link bridge.
const PROJECT_SITE = "https://davidvalentine.org";

export function MobileLandingActions() {
  const inShell = useSyncExternalStore(
    emptySubscribe,
    () => isNativeShell(),
    () => false,
  );

  return (
    <>
      <button
        type="button"
        className={styles.externalButton}
        onClick={() => openExternalUrl(PROJECT_SITE)}
      >
        Open project website ↗
      </button>

      <p className={styles.note}>
        {inShell
          ? "Links open inside the app; external links open in an in-app browser."
          : "Open this page inside the Digital Garden mobile app for the native shell."}
      </p>
    </>
  );
}
