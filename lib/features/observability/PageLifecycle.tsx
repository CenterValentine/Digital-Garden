"use client";

import { useEffect } from "react";
import { clientLogger } from "@/lib/core/logger/client";

// Emits the three lifecycle markers the FRONTEND-LOG-CHARTER declared but
// no surface had wired up:
//
//   page:hydrated   — first render after JS bundle execution
//   page:interactive — main thread settles (requestIdleCallback)
//   page:visibility_changed — tab moves between foreground / background
//
// All emits are scalar-only attrs. Route is passed by the caller so the same
// component works inside any layout / page (content, settings, share, …).
//
// Mount this once per route. Re-mounts on soft-nav are intentional — each
// route transition is a new logical "page" per the charter.

export type PageLifecycleProps = {
  /** Logical route name, e.g. "/content" or "/settings/storage". */
  route: string;
};

export function PageLifecycle({ route }: PageLifecycleProps) {
  useEffect(() => {
    // performance.now() is relative to performance.timeOrigin (navigation
    // start), so on first mount it IS the ms-since-navigation we want.
    const hydratedAtMs = Math.round(performance.now());
    clientLogger.info({
      layer: "page",
      event: "page:hydrated",
      summary: `${route} hydrated`,
      duration_ms: hydratedAtMs,
      attrs: { route },
    });

    let didEmitInteractive = false;
    const emitInteractive = () => {
      if (didEmitInteractive) return;
      didEmitInteractive = true;
      const interactiveAtMs = Math.round(performance.now());
      clientLogger.info({
        layer: "page",
        event: "page:interactive",
        summary: `${route} interactive`,
        duration_ms: interactiveAtMs,
        attrs: { route, time_to_interactive_ms: interactiveAtMs },
      });
    };

    // requestIdleCallback fires when the main thread is idle — a decent
    // proxy for "the user can actually do something." Fallback to setTimeout
    // for Safari, which still doesn't ship rIC.
    type IdleHandle = number;
    let idleHandle: IdleHandle | null = null;
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      idleHandle = ric(emitInteractive, { timeout: 2000 });
    } else {
      idleHandle = window.setTimeout(emitInteractive, 200) as unknown as number;
    }

    const onVisibility = () => {
      clientLogger.debug({
        layer: "page",
        event: "page:visibility_changed",
        summary: `${route} ${document.visibilityState}`,
        attrs: { route, state: document.visibilityState },
      });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      const cancel = (
        window as unknown as { cancelIdleCallback?: (handle: number) => void }
      ).cancelIdleCallback;
      if (idleHandle !== null) {
        if (typeof cancel === "function") cancel(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [route]);

  return null;
}
