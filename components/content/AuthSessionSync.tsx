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
import { registerPollingTask } from "@/lib/core/polling/scheduler";
import { installSessionInterceptor } from "@/lib/infrastructure/auth/session-interceptor";

// A slow SAFETY NET, not the detection mechanism.
//
// Detection now happens three other ways, all of them instant and all of them
// free (D15 in POLLING-DISCIPLINE-PLAN.md):
//
//   another tab signed out   -> BroadcastChannel, via subscribeAuthSessionEvents
//   the user does anything   -> the 401 interceptor installed below
//   actively collaborating   -> Hocuspocus push
//
// So this poll exists only to catch the case where a session dies and the user
// then does nothing at all — which by definition nobody is waiting on. Ten
// minutes is deliberately longer than Neon's 5-minute autosuspend window, so an
// untouched app leaves the database genuinely contiguous quiet rather than
// prodding it awake every minute.
const AUTH_STATUS_INTERVAL_MS = 10 * 60 * 1000;
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
    // Assigned below; referenced from verifySession, which only runs once the
    // scheduler ticks — long after this closure is fully initialised.
    let unregisterPoll: (() => void) | null = null;

    // Learn about revocation from requests we were already making. This is the
    // primary detection path; everything below is a fallback.
    const uninstallInterceptor = installSessionInterceptor();

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
            unregisterPoll?.();
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

    // Registered with the shared scheduler rather than owning a timer. Gating
    // (hidden and idle both pause) lives in the scheduler, so there is nothing
    // to check here.
    //
    // scope: "leader" matters more than the interval does. This component mounts
    // app-wide, so before leader election five open tabs meant five independent
    // session checks for one human. Now exactly one tab asks, and the answer
    // reaches the others over the BroadcastChannel this component already
    // subscribes to above.
    unregisterPoll = registerPollingTask({
      id: "auth-session-check",
      intervalMs: AUTH_STATUS_INTERVAL_MS,
      scope: "leader",
      run: verifySession,
    });

    return () => {
      isCancelled = true;
      unregisterPoll?.();
      uninstallInterceptor();
      unsubscribe();
    };
  }, [pathname, router, searchParams]);

  return null;
}
