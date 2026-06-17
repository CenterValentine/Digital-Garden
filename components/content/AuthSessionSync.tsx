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

const AUTH_STATUS_INTERVAL_MS = 10_000;
const SIGNED_OUT_MESSAGE = "You were signed out. Sign in again to continue editing.";
// Require this many consecutive 401s before triggering sign-out.
// Three in a row (30 s apart) is authoritative: with NEGATIVE_TTL_MS = 10 s,
// the third check always re-queries the DB fresh, so a Neon hiccup lasting
// <20 s will clear before we reach this threshold.
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
      if (document.visibilityState === "visible" && consecutiveFailures > 0) {
        clientLogger.info({
          layer: "ui",
          event: "session_check:counter_reset_on_wake",
          summary: `Resetting ${consecutiveFailures} consecutive failure(s) after tab visibility restored`,
        });
        consecutiveFailures = 0;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const verifySession = async () => {
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

    const interval = window.setInterval(verifySession, AUTH_STATUS_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, router, searchParams]);

  return null;
}
