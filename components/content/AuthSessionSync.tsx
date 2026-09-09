"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { collaborationRuntimeManager } from "@/lib/domain/collaboration/runtime";
import {
  publishSignedOut,
  subscribeAuthSessionEvents,
} from "@/lib/infrastructure/auth/client-session-events";
import { clientLogger } from "@/lib/core/logger/client";

// 60 s, and only while the tab is visible.
//
// This poll drives *proactive* UI sign-out only. Authorization itself happens
// server-side on every real API call, so a revoked session can never actually
// do anything — a slower poll just means a stale UI for longer, and only in a
// tab nobody is looking at.
//
// The cost matters because this component mounts app-wide: its interval
// multiplies by every open tab, and each call validates the session against
// Postgres. At 10 s ungated it was the single largest source of idle database
// load in the app, which on metered infrastructure is billed twice — once for
// the function that serves it and once for the database that never gets to
// sleep. See docs/notes-feature/infrastructure/PLATFORM-PORTABILITY.md.
//
// Paired with an immediate re-check on tab-visible, so someone returning to a
// backgrounded tab never waits a full minute to learn they were signed out.
const AUTH_STATUS_INTERVAL_MS = 60_000;
const SIGNED_OUT_MESSAGE = "You were signed out. Sign in again to continue editing.";
// Require this many consecutive 401s before triggering sign-out.
// Three in a row is authoritative: at a 60 s cadence every check is far past
// NEGATIVE_TTL_MS (10 s), so each one re-queries the DB fresh and a transient
// Neon hiccup clears long before the threshold is reached.
const CONSECUTIVE_FAILURES_REQUIRED = 3;

function getCurrentRedirectPath(pathname: string | null, searchParams: URLSearchParams) {
  const path = pathname || "/content";
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function AuthSessionSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledSignedOutRef = useRef(false);

  useEffect(() => {
    const handleSignedOut = () => {
      if (handledSignedOutRef.current) return;
      handledSignedOutRef.current = true;

      collaborationRuntimeManager.markAllUnauthorized(SIGNED_OUT_MESSAGE);
      toast.warning("Signed out", {
        description: "Sign in again to continue editing.",
      });

      const redirect = getCurrentRedirectPath(pathname, searchParams);
      router.replace(`/sign-in?redirect=${encodeURIComponent(redirect)}`);
      router.refresh();
    };

    const unsubscribe = subscribeAuthSessionEvents(handleSignedOut);
    let isCancelled = false;
    let consecutiveFailures = 0;

    // When the tab becomes visible again after a sleep/suspend, the frozen
    // interval timer fires immediately on wake. Any cached null from the moment
    // the computer slept carries forward into the first post-wake poll, making
    // a transient DB reconnection error look like two consecutive 401s.
    // Resetting here ensures the post-wake count always starts at 0.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (consecutiveFailures > 0) {
        clientLogger.info({
          layer: "ui",
          event: "session_check:counter_reset_on_wake",
          summary: `Resetting ${consecutiveFailures} consecutive failure(s) after tab visibility restored`,
        });
        consecutiveFailures = 0;
      }
      // The interval does not run while hidden, so the session state may be up
      // to AUTH_STATUS_INTERVAL_MS stale on return. Check immediately rather
      // than making the user wait out the remainder of the cycle.
      void verifySession();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const verifySession = async () => {
      // Guard at entry: if sign-out has already been triggered (isCancelled),
      // do not fire another fetch — the interval will be cleared by the cleanup,
      // but there may be in-flight calls already past the top-of-function guard.
      if (isCancelled) return;

      try {
        const response = await fetch("/api/auth/session?required=true", {
          credentials: "include",
          cache: "no-store",
        });

        if (isCancelled) return;

        if (response.status === 401) {
          consecutiveFailures += 1;
          clientLogger.warn({
            layer: "ui",
            event: "session_check:401",
            summary: `Session check returned 401 (consecutive: ${consecutiveFailures} / ${CONSECUTIVE_FAILURES_REQUIRED})`,
            attrs: { consecutive: consecutiveFailures, required: CONSECUTIVE_FAILURES_REQUIRED },
          });

          if (consecutiveFailures >= CONSECUTIVE_FAILURES_REQUIRED) {
            // Stop all future polls immediately — prevents the "consecutive: 3/2, 4/2"
            // log noise and duplicate publishSignedOut calls seen when the interval
            // keeps firing during the router.replace transition.
            isCancelled = true;
            window.clearInterval(interval);
            clientLogger.warn({
              layer: "ui",
              event: "session_check:signing_out",
              summary: "Signing out after consecutive 401 failures",
            });
            publishSignedOut("session-missing");
            handleSignedOut();
          }
        } else {
          if (consecutiveFailures > 0) {
            clientLogger.info({
              layer: "ui",
              event: "session_check:restored",
              summary: `Session restored after ${consecutiveFailures} transient failure(s)`,
            });
          }
          consecutiveFailures = 0;
        }
      } catch {
        // Network failures are not sign-out. Offline editing policy is handled separately.
      }
    };

    // Gate inside the callback rather than tearing the timer down and rebuilding
    // it on every visibility flip — same pattern as
    // extensions/workplaces/state/workspace-sync.ts, which is the reference
    // implementation for polling discipline in this codebase.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void verifySession();
      }
    }, AUTH_STATUS_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, router, searchParams]);

  return null;
}
