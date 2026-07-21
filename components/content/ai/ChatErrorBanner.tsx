/**
 * ChatErrorBanner — renders a parsed chat error with a contextual CTA.
 *
 * Used by both `ChatPanel` (sidebar) and `ChatViewer` (full-page). The
 * useChat hook surfaces the server's JSON response body in
 * `error.message` verbatim, so we parse it here and:
 *   - show a human-readable label (no raw JSON in the UI)
 *   - add a "Settings → AI" CTA when the cause is BYOK setup
 *   - allow user to dismiss the error with a close button
 */

"use client";

import Link from "next/link";
import { AlertCircle, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import {
  parseChatError,
  describeChatError,
  shouldOfferSettingsCta,
} from "@/lib/domain/ai/chat-errors";

interface ChatErrorBannerProps {
  message: string | undefined;
}

export function ChatErrorBanner({ message }: ChatErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!message || dismissed) return null;
  const parsed = parseChatError(message);
  const showSettingsCta = shouldOfferSettingsCta(parsed);

  return (
    <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="text-red-800 dark:text-red-200">{describeChatError(parsed)}</div>
        {showSettingsCta && (
          <Link
            href="/settings/ai"
            className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-800 dark:text-red-200 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Open AI Settings
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 transition-colors p-0.5"
        aria-label="Dismiss error"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
