/**
 * SaveConflictBanner — surfaced when an autosave is refused because the
 * document changed elsewhere since it was loaded (409 PRECONDITION_FAILED).
 *
 * Block-and-warn: autosave is paused and the user's edits are preserved
 * (in-memory + localStorage). The user explicitly resolves via:
 *   • Keep mine   — overwrite the newer server copy with my edits
 *   • Take theirs — discard my edits and load the latest
 *   • Open theirs — read-only preview of the latest, to compare before deciding
 *
 * Only the plain/REST save path reaches here; collaboration docs reconcile via
 * Hocuspocus CRDT merge. See MainPanelContent + save-conflict-store.
 */

"use client";

import { AlertTriangle, X } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { MarkdownEditor } from "../editor/MarkdownEditor";

interface SaveConflictBannerProps {
  /** Whether a conflict is active for the current document. */
  active: boolean;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  onOpenTheirs: () => void;
  /** When set, render the read-only "their version" preview modal. */
  theirsPreview: { title: string; content: JSONContent } | null;
  onCloseTheirs: () => void;
}

export function SaveConflictBanner({
  active,
  onKeepMine,
  onTakeTheirs,
  onOpenTheirs,
  theirsPreview,
  onCloseTheirs,
}: SaveConflictBannerProps) {
  if (!active && !theirsPreview) return null;

  return (
    <>
      {active && (
        <div
          role="alert"
          className="mx-4 my-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">This note changed elsewhere</p>
              <p className="text-amber-800/80 dark:text-amber-200/70">
                Someone (or another device) updated it after you opened this
                tab. Your edits are safe and unsaved — choose how to resolve.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onOpenTheirs}
              className="rounded-lg border border-amber-400/60 px-3 py-1.5 font-medium transition-colors hover:bg-amber-100 dark:border-amber-400/30 dark:hover:bg-amber-500/15"
            >
              Open theirs
            </button>
            <button
              type="button"
              onClick={onTakeTheirs}
              className="rounded-lg border border-amber-400/60 px-3 py-1.5 font-medium transition-colors hover:bg-amber-100 dark:border-amber-400/30 dark:hover:bg-amber-500/15"
            >
              Take theirs
            </button>
            <button
              type="button"
              onClick={onKeepMine}
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}

      {theirsPreview && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Their version (read-only)"
          onClick={onCloseTheirs}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 py-3 dark:border-white/10">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Their version · read-only
                </p>
                <p className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  {theirsPreview.title}
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseTheirs}
                className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800 dark:hover:bg-white/10 dark:hover:text-neutral-100"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <MarkdownEditor content={theirsPreview.content} editable={false} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
