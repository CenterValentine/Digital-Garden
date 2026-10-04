/**
 * SaveConflictBanner — surfaced when an autosave is refused because the
 * document changed elsewhere since it was loaded (409 PRECONDITION_FAILED).
 *
 * Block-and-warn: autosave is paused and the user's edits are preserved
 * (in-memory + localStorage). The user explicitly resolves via:
 *   • Compare     — open the side-by-side diff (SaveConflictDiff), where the
 *                   same two resolutions sit beside the evidence
 *   • Keep mine   — overwrite the newer server copy with my edits
 *   • Take theirs — discard my edits and load the latest
 *
 * Only the plain/REST save path reaches here; collaboration docs reconcile via
 * Hocuspocus CRDT merge. See MainPanelContent + save-conflict-store.
 */

"use client";

import { AlertTriangle } from "lucide-react";

interface SaveConflictBannerProps {
  /** Whether a conflict is active for the current document. */
  active: boolean;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  /** Open the diff. Replaces the old one-sided "their version" preview. */
  onCompare: () => void;
}

export function SaveConflictBanner({
  active,
  onKeepMine,
  onTakeTheirs,
  onCompare,
}: SaveConflictBannerProps) {
  if (!active) return null;

  return (
    <div
      role="alert"
      className="mx-4 my-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">This note changed elsewhere</p>
          <p className="text-amber-800/80 dark:text-amber-200/70">
            Someone (or another device) updated it after you opened this tab.{" "}
            <strong>Saving is paused until you choose.</strong> Your edits are
            kept on this device, but nothing reaches the server until this is
            resolved.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCompare}
          className="rounded-lg border border-amber-400/60 px-3 py-1.5 font-medium transition-colors hover:bg-amber-100 dark:border-amber-400/30 dark:hover:bg-amber-500/15"
        >
          Compare
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
  );
}
