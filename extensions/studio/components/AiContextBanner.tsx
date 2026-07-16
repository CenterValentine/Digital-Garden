"use client";

/**
 * Once-per-session "no model configured" banner for auto-context.
 *
 * Purely presentational — the once-per-session decision (sessionStorage
 * check + mark) happens in the fetch callback that received
 * aiContextStatus === "unconfigured", NOT here. Keeping storage reads out
 * of render and setState out of effects sidesteps the React Compiler
 * purity rules by construction; see shouldShowAiContextBannerOnce.
 */

import Link from "next/link";

const SESSION_KEY = "dg:studio-ai-context-banner-shown";

/**
 * Call from an event/fetch callback when a response reports the
 * unconfigured state. Returns true exactly once per browser session
 * (sessionStorage-scoped), marking as shown on that first call.
 */
export function shouldShowAiContextBannerOnce(): boolean {
  if (typeof window === "undefined") return false;
  if (window.sessionStorage.getItem(SESSION_KEY) === "1") return false;
  window.sessionStorage.setItem(SESSION_KEY, "1");
  return true;
}

export function AiContextUnconfiguredBanner({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          AI context can&apos;t auto-update
        </p>
        <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
          No model is set up for Context Generation. Configure one in{" "}
          <Link
            href="/settings/ai"
            className="underline underline-offset-2 hover:text-amber-600 dark:hover:text-amber-200"
          >
            AI settings → Feature Routing
          </Link>
          . Until then, context only updates when you press Generate.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-amber-600/70 transition-colors hover:text-amber-600 dark:text-amber-400/70 dark:hover:text-amber-300"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-3.5 w-3.5"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
