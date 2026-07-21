"use client";

/**
 * Page-context bar for the browser side-panel chat (BROWSER-REACH B2).
 *
 * Renders INSIDE the composer (ChatInput), as its own separate element, only
 * when running in the side panel. Fully store-driven — no props — so it stays
 * decoupled from the shared composer and its CSS blast radius is contained
 * (owner direction 2026-07-21: keep this browser-only affordance explicitly
 * separated for maintenance).
 *
 * Three scope buttons capture what the user is viewing; the captured context
 * rides every chat turn until detached (see the engine's body resolver).
 */

import { useEffect } from "react";
import { usePanelPageContextStore } from "@/state/panel-page-context-store";
import {
  isPanelEmbedSurface,
  requestPageCapture,
  requestScreenshot,
  dataUrlToFile,
} from "@/lib/domain/browser-extension/panel-bridge";
import type { PageContextScope } from "@/lib/domain/browser-extension/page-context";

const SCOPES: Array<{ id: PageContextScope; label: string; hint: string }> = [
  { id: "selection", label: "Selection", hint: "Your highlighted text" },
  { id: "viewport", label: "Screen", hint: "What's visible now" },
  { id: "full", label: "Page", hint: "The whole article" },
];

export function PanelPageContextBar({
  onAddFiles,
  supportsImages = true,
}: {
  /** ChatInput's addAttachmentFiles — used to attach a captured screenshot. */
  onAddFiles?: (files: File[]) => void;
  /** Whether the active model can accept image attachments. */
  supportsImages?: boolean;
}) {
  const pageContext = usePanelPageContextStore((s) => s.pageContext);
  const attached = usePanelPageContextStore((s) => s.attached);
  const busy = usePanelPageContextStore((s) => s.busy);
  const error = usePanelPageContextStore((s) => s.error);
  const scope = usePanelPageContextStore((s) => s.scope);
  const screenshotBusy = usePanelPageContextStore((s) => s.screenshotBusy);
  const pendingScreenshot = usePanelPageContextStore((s) => s.pendingScreenshot);
  const setBusy = usePanelPageContextStore((s) => s.setBusy);
  const setError = usePanelPageContextStore((s) => s.setError);
  const setScope = usePanelPageContextStore((s) => s.setScope);
  const setScreenshotBusy = usePanelPageContextStore((s) => s.setScreenshotBusy);
  const setPendingScreenshot = usePanelPageContextStore(
    (s) => s.setPendingScreenshot
  );
  const clear = usePanelPageContextStore((s) => s.clear);

  // A newly-captured screenshot → File → composer attachment, then clear it.
  useEffect(() => {
    if (!pendingScreenshot) return;
    const file = dataUrlToFile(
      pendingScreenshot,
      `screenshot-${Date.now()}.jpg`
    );
    if (file) onAddFiles?.([file]);
    setPendingScreenshot(null);
  }, [pendingScreenshot, onAddFiles, setPendingScreenshot]);

  // Only exists in the side panel; a no-op elsewhere keeps ChatInput generic.
  if (!isPanelEmbedSurface()) return null;

  function capture(next: PageContextScope) {
    setScope(next);
    setBusy(true);
    setError(null);
    requestPageCapture(next);
  }

  function captureScreenshot() {
    setScreenshotBusy(true);
    setError(null);
    requestScreenshot();
  }

  const charCount = pageContext?.content?.length ?? 0;
  const kb = charCount > 0 ? Math.max(1, Math.round(charCount / 1000)) : 0;

  return (
    <div className="flex flex-col gap-1 border-b border-black/10 dark:border-white/10 px-2.5 py-1.5 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">Add page:</span>
        {SCOPES.map((s) => {
          const active = attached && pageContext?.scope === s.id;
          return (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              disabled={busy}
              aria-pressed={active}
              onClick={() => capture(s.id)}
              className={
                "rounded-md border px-2 py-0.5 text-[11px] transition-colors " +
                (active
                  ? "border-gold-primary bg-gold-primary text-black"
                  : "border-black/10 dark:border-white/15 text-gray-600 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/5")
              }
            >
              {busy && scope === s.id ? "…" : s.label}
            </button>
          );
        })}
        {onAddFiles && supportsImages && (
          <button
            type="button"
            onClick={captureScreenshot}
            disabled={screenshotBusy}
            title="Attach a screenshot of the visible page"
            className="rounded-md border border-black/10 dark:border-white/15 px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-300 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/5"
          >
            {screenshotBusy ? "…" : "📷 Shot"}
          </button>
        )}
        {attached && (
          <button
            type="button"
            onClick={clear}
            title="Stop sending this page to the chat"
            className="ml-auto text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm leading-none"
          >
            ✕
          </button>
        )}
      </div>

      {error ? (
        <div className="text-red-600 dark:text-red-400">{error}</div>
      ) : attached && pageContext ? (
        <div
          className="truncate text-gray-500 dark:text-gray-400"
          title={pageContext.title ?? pageContext.url}
        >
          Attached · {pageContext.scope}
          {pageContext.quality === "readable" ? " · article" : ""} · ~{kb}k chars
          {pageContext.title ? ` · ${pageContext.title}` : ""}
        </div>
      ) : null}
    </div>
  );
}
