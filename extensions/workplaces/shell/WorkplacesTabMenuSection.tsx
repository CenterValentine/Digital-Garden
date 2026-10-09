"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import type { ExtensionShellTabMenuSectionProps } from "@/lib/extensions/types";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import {
  copyTreeItems,
  ensureAltTracker,
} from "@/lib/features/content/tree-clipboard";
import { useTabMoveTargets } from "./use-tab-move-targets";
import { WorkplaceTargetFlyout, type WorkplaceTarget } from "./WorkplaceTargetFlyout";

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10";

/**
 * How long the pointer rests on "Move tab to" / "Duplicate tab to" before its
 * destinations open beside the menu (owner ask, 2026-10-08: the menu itself
 * should not open as a wall of workplaces). A click opens it at once.
 */
export const TAB_MENU_FLYOUT_DELAY_MS = 500;

type FlyoutKind = "move" | "duplicate";

export function WorkplacesTabMenuSection({
  tab,
  closeMenu,
}: ExtensionShellTabMenuSectionProps) {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const moveTabToWorkspace = useWorkspaceStore(
    (state) => state.moveTabToWorkspace
  );
  const sendContentToWorkspace = useWorkspaceStore(
    (state) => state.sendContentToWorkspace
  );
  const ensureWorkbench = useWorkspaceStore((state) => state.ensureWorkbench);

  // Alt at Copy-click = strictly the URL — the tracker must be live while
  // the menu is open, before any click lands.
  useEffect(() => {
    ensureAltTracker();
  }, []);

  // The menu section only mounts while the menu is open, so fetching is
  // always on.
  const { groups } = useTabMoveTargets(true);

  const [flyout, setFlyout] = useState<{ kind: FlyoutKind; anchor: HTMLElement } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => clearTimer, []);

  const armFlyout = (kind: FlyoutKind, anchor: HTMLElement) => {
    clearTimer();
    if (flyout?.kind === kind) return;
    timerRef.current = setTimeout(() => setFlyout({ kind, anchor }), TAB_MENU_FLYOUT_DELAY_MS);
  };
  // Resting on any other row closes an open flyout, as menus do.
  const leaveFlyoutRows = () => {
    clearTimer();
    setFlyout(null);
  };

  const resolveTarget = async (target: WorkplaceTarget) =>
    target.kind === "workspace"
      ? target.workspaceId
      : (target.bench.workbenchId ??
        (await ensureWorkbench(target.parentWorkspaceId, target.bench.folderId)).id);

  const pick = async (kind: FlyoutKind, target: WorkplaceTarget) => {
    closeMenu();
    try {
      const workspaceId = await resolveTarget(target);
      if (kind === "move") {
        // A transfer: the tab leaves this workplace.
        await moveTabToWorkspace(workspaceId, {
          id: tab.id,
          contentId: tab.contentId,
          title: tab.title,
        });
      } else {
        // A copy: the target gains the tab, this workplace keeps it.
        await sendContentToWorkspace(workspaceId, [
          { id: tab.contentId, title: tab.title || "Untitled", contentType: tab.contentType ?? null },
        ]);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : kind === "move"
            ? "Failed to move tab"
            : "Failed to duplicate tab"
      );
    }
  };

  const flyoutRow = (kind: FlyoutKind, label: string) => (
    <button
      type="button"
      className={`${ROW_CLASS} ${flyout?.kind === kind ? "bg-black/5 dark:bg-white/10" : ""}`}
      aria-haspopup="menu"
      aria-expanded={flyout?.kind === kind}
      onPointerEnter={(event) => armFlyout(kind, event.currentTarget)}
      onPointerLeave={clearTimer}
      onClick={(event) => {
        clearTimer();
        setFlyout({ kind, anchor: event.currentTarget });
      }}
    >
      <span className="flex-1 truncate">{label}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  );

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1" onPointerEnter={leaveFlyoutRows}>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
          {tab.title || "Untitled"}
        </span>
        <button
          type="button"
          title="Copy link"
          aria-label="Copy link"
          className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-gray-100"
          onClick={() => {
            closeMenu();
            // Same dual-flavor payload as the file tree (owner spec
            // 2026-08-10): URL as text, wiki-link html for note paste,
            // @-mention on chat paste — and tree paste rides along for free.
            void copyTreeItems(
              [
                {
                  id: tab.contentId,
                  title: tab.title || "Untitled",
                  contentType: tab.contentType ?? "note",
                },
              ],
              "copy",
            );
          }}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="my-1 h-px bg-black/10 dark:bg-white/10" />
      {flyoutRow("move", "Move tab to")}
      {flyoutRow("duplicate", "Duplicate tab to")}
      {flyout ? (
        <WorkplaceTargetFlyout
          key={flyout.kind}
          anchor={flyout.anchor}
          label={flyout.kind === "move" ? "Move tab to" : "Duplicate tab to"}
          groups={groups}
          activeWorkspaceId={activeWorkspaceId}
          onPointerEnter={clearTimer}
          onPick={(target) => void pick(flyout.kind, target)}
        />
      ) : null}
    </>
  );
}
