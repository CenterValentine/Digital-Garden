"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/client/ui/dialog";
import { Checkbox } from "@/components/client/ui/checkbox";
import { Label } from "@/components/client/ui/label";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";

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

function WorkspaceConflictDialogBody({
  conflict,
  cancelOpenConflict,
  borrowPendingContent,
  sharePendingContent,
  switchToConflictWorkspace,
}: {
  conflict: NonNullable<ReturnType<typeof useWorkspaceStore.getState>["conflict"]>;
  cancelOpenConflict: ReturnType<typeof useWorkspaceStore.getState>["cancelOpenConflict"];
  borrowPendingContent: ReturnType<typeof useWorkspaceStore.getState>["borrowPendingContent"];
  sharePendingContent: ReturnType<typeof useWorkspaceStore.getState>["sharePendingContent"];
  switchToConflictWorkspace: ReturnType<typeof useWorkspaceStore.getState>["switchToConflictWorkspace"];
}) {
  const [borrowPreset, setBorrowPreset] = useState<BorrowPreset>("3h");
  const [borrowUntil, setBorrowUntil] = useState(() => borrowUntilForPreset("3h"));
  const [useFolderScope, setUseFolderScope] = useState(false);

  const folderScopeLabel = useMemo(() => {
    if (!conflict.folderScopeContentTitle) return null;
    return `Also apply this to ${conflict.folderScopeContentTitle} and all descendants`;
  }, [conflict]);

  const isViewScope = conflict.conflictType === "viewScope";

  const description = useMemo(() => {
    if (isViewScope) {
      return `${conflict.contentTitle} is outside the scope of this view (rooted at "${conflict.claimContentTitle}"). You can borrow it temporarily or share it permanently to open it here.`;
    }
    const scopeText = conflict.scope === "recursive" ? "a folder claim" : "a tab claim";
    return `${conflict.contentTitle} is already claimed by ${conflict.workspaceName} through ${scopeText}. Overlapping files across workspaces can lead to duplicate work; consider opening the workspace that owns it or sharing intentionally.`;
  }, [conflict, isViewScope]);

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
      <DialogContent className="max-w-2xl border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
        <DialogHeader>
          <DialogTitle>{isViewScope ? "Outside view scope" : "Workspace overlap detected"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {folderScopeLabel ? (
            <div className="rounded-md border border-black/10 bg-black/[0.02] px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="workspace-conflict-folder-scope"
                  checked={useFolderScope}
                  onCheckedChange={(checked) => setUseFolderScope(checked === true)}
                  className="mt-0.5 border-gold-primary/35 data-[state=checked]:bg-gold-primary data-[state=checked]:text-white"
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="workspace-conflict-folder-scope"
                    className="cursor-pointer text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {folderScopeLabel}
                  </Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Use this when you want one decision here to cover future files in the same area.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

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

        <div className={`grid gap-2 ${isViewScope ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
          <button
            type="button"
            onClick={() => cancelOpenConflict()}
            className="whitespace-nowrap rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          {!isViewScope && (
            <button
              type="button"
              onClick={() => void switchToConflictWorkspace()}
              className="whitespace-nowrap rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Open workspace
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              void borrowPendingContent(toIso(borrowUntil), { useFolderScope })
            }
            className="whitespace-nowrap rounded-md border border-gold-primary/30 bg-gold-primary/10 px-3 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/15"
          >
            Borrow
          </button>
          <button
            type="button"
            onClick={() => void sharePendingContent({ useFolderScope })}
            className="whitespace-nowrap rounded-md border border-gold-primary/30 bg-gold-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-primary/90"
          >
            Always share
          </button>
        </div>
      </DialogContent>
  );
}

export function WorkspaceConflictDialog() {
  const conflict = useWorkspaceStore((state) => state.conflict);
  const cancelOpenConflict = useWorkspaceStore((state) => state.cancelOpenConflict);
  const borrowPendingContent = useWorkspaceStore((state) => state.borrowPendingContent);
  const sharePendingContent = useWorkspaceStore((state) => state.sharePendingContent);
  const switchToConflictWorkspace = useWorkspaceStore(
    (state) => state.switchToConflictWorkspace
  );
  const conflictKey = conflict
    ? `${conflict.workspaceId}:${conflict.contentId}:${conflict.folderScopeContentId ?? ""}`
    : "none";

  return (
    <Dialog open={Boolean(conflict)} onOpenChange={(open) => (!open ? cancelOpenConflict() : null)}>
      {conflict ? (
        <WorkspaceConflictDialogBody
          key={conflictKey}
          conflict={conflict}
          cancelOpenConflict={cancelOpenConflict}
          borrowPendingContent={borrowPendingContent}
          sharePendingContent={sharePendingContent}
          switchToConflictWorkspace={switchToConflictWorkspace}
        />
      ) : null}
    </Dialog>
  );
}
