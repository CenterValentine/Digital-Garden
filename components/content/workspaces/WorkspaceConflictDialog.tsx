"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/client/ui/dialog";
import { useWorkspaceStore } from "@/state/workspace-store";

type BorrowPreset = "1h" | "3h" | "eod" | "custom";

function toDatetimeLocalValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function borrowUntilForPreset(preset: BorrowPreset) {
  const date = new Date();

  if (preset === "1h") {
    date.setHours(date.getHours() + 1);
    return toDatetimeLocalValue(date);
  }

  if (preset === "3h") {
    date.setHours(date.getHours() + 3);
    return toDatetimeLocalValue(date);
  }

  if (preset === "eod") {
    const endOfWorkday = new Date();
    endOfWorkday.setHours(17, 0, 0, 0);
    if (endOfWorkday <= date) {
      endOfWorkday.setHours(23, 59, 0, 0);
    }
    return toDatetimeLocalValue(endOfWorkday);
  }

  date.setHours(date.getHours() + 24);
  return toDatetimeLocalValue(date);
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

export function WorkspaceConflictDialog() {
  const conflict = useWorkspaceStore((state) => state.conflict);
  const cancelOpenConflict = useWorkspaceStore((state) => state.cancelOpenConflict);
  const borrowPendingContent = useWorkspaceStore((state) => state.borrowPendingContent);
  const sharePendingContent = useWorkspaceStore((state) => state.sharePendingContent);
  const switchToConflictWorkspace = useWorkspaceStore(
    (state) => state.switchToConflictWorkspace
  );
  const [borrowPreset, setBorrowPreset] = useState<BorrowPreset>("3h");
  const [borrowUntil, setBorrowUntil] = useState(() => borrowUntilForPreset("3h"));

  const description = useMemo(() => {
    if (!conflict) return "";
    const scopeText = conflict.scope === "recursive" ? "a folder claim" : "a tab claim";
    return `${conflict.contentTitle} is already claimed by ${conflict.workspaceName} through ${scopeText}. Overlapping files across workspaces can lead to duplicate work; consider opening the workspace that owns it or sharing intentionally.`;
  }, [conflict]);

  const selectPreset = (preset: BorrowPreset) => {
    setBorrowPreset(preset);
    if (preset !== "custom") {
      setBorrowUntil(borrowUntilForPreset(preset));
    }
  };

  const presetButtonClass = (preset: BorrowPreset) =>
    `rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
      borrowPreset === preset
        ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
        : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
    }`;

  return (
    <Dialog open={Boolean(conflict)} onOpenChange={(open) => (!open ? cancelOpenConflict() : null)}>
      <DialogContent className="max-w-2xl border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
        <DialogHeader>
          <DialogTitle>Workspace overlap detected</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="mb-2 text-sm font-medium">Borrow for</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => selectPreset("1h")}
                className={presetButtonClass("1h")}
              >
                1 hour
              </button>
              <button
                type="button"
                onClick={() => selectPreset("3h")}
                className={presetButtonClass("3h")}
              >
                3 hours
              </button>
              <button
                type="button"
                onClick={() => selectPreset("eod")}
                className={presetButtonClass("eod")}
              >
                EOD
              </button>
              <button
                type="button"
                onClick={() => selectPreset("custom")}
                className={presetButtonClass("custom")}
              >
                Custom
              </button>
            </div>
          </div>

          {borrowPreset === "custom" ? (
            <label className="block text-sm font-medium">
              Custom borrow until
              <input
                type="datetime-local"
                value={borrowUntil}
                onChange={(event) => setBorrowUntil(event.target.value)}
                className="mt-1 w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gold-primary dark:border-white/10 dark:bg-white/5"
              />
            </label>
          ) : null}

          <p className="rounded-md border border-gold-primary/20 bg-gold-primary/10 px-3 py-2 text-xs text-gold-primary">
            Borrowed tabs are temporary. When the borrow window expires, the tab releases from this workspace automatically.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => cancelOpenConflict()}
            className="whitespace-nowrap rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void switchToConflictWorkspace()}
            className="whitespace-nowrap rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            Open workspace
          </button>
          <button
            type="button"
            onClick={() => void borrowPendingContent(toIso(borrowUntil))}
            className="whitespace-nowrap rounded-md border border-gold-primary/30 bg-gold-primary/10 px-3 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/15"
          >
            Borrow
          </button>
          <button
            type="button"
            onClick={() => void sharePendingContent()}
            className="whitespace-nowrap rounded-md border border-gold-primary/30 bg-gold-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-primary/90"
          >
            Always share
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
