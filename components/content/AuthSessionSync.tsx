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
// A single 401 can be a transient DB hiccup; two in a row (20 s apart) is authoritative.
const CONSECUTIVE_FAILURES_REQUIRED = 2;

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
    };
  }, [pathname, router, searchParams]);

  return null;
}
