"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleX, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import {
  useContentStore,
  getVisiblePaneIds,
  getPaneLabel,
  markLocalOpenIntents,
  type WorkspacePaneId,
  type WorkspaceStateSnapshot,
} from "@/state/content-store";
import { collectPaneAttachedTabs } from "@/state/workspace-tab-filter-store";
import { useNavigationHistoryStore } from "@/state/navigation-history-store";
import {
  buildActivationTimes,
  resolveLastTouchedAt,
  useTabActivityStore,
} from "@/state/tab-activity-store";
import { useAnchoredMenu } from "@/lib/core/use-anchored-menu";
import {
  buildIdleTargets,
  buildOthersTarget,
  buildTypeTargets,
} from "./clear-tabs-targets";

/**
 * Clear-tabs control.
 *
 * Tap          → clear every tab in the workplace (the common case).
 * Hold (250ms) → the options menu. Right-click opens it too, since a hold is
 *                undiscoverable on a pointer device and unreachable by anyone
 *                who can't hold a button down.
 *
 * The hold-for-options gesture mirrors the back button's hold-for-history in
 * MainPanelNavigation, so the whole navigation bar shares one interaction
 * grammar: tap does the obvious thing, hold reveals the choices.
 *
 * MENU SHAPE — full-width rows for targets you pick by name (a pane, the
 * others, everything), and chip rows for the dimensions that would otherwise
 * need a submenu each. A chip row keeps a whole dimension on one line, and
 * `clear-tabs-targets` drops the chips that wouldn't decide anything, so the
 * menu stays about as tall as the old one while offering much more.
 *
 * Every action is undoable for UNDO_WINDOW_MS through the toast, which is what
 * makes a tap-to-clear-everything default defensible.
 *
 * Tabs are always read through `collectPaneAttachedTabs`: the content store's
 * `tabs` record accumulates entries across workspace switches, so counting it
 * directly would offer to close another workspace's content.
 */

const HOLD_THRESHOLD_MS = 250;
const UNDO_WINDOW_MS = 10_000;
const MENU_WIDTH = 268;
const MENU_MAX_HEIGHT = 420;

function pluralizeTabs(count: number): string {
  return count === 1 ? "1 tab" : `${count} tabs`;
}

function RowButton({
  label,
  count,
  description,
  destructive,
  onSelect,
}: {
  label: string;
  count: number;
  description: string;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      title={description}
      aria-label={description}
      className={`flex w-full items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left text-sm transition-colors ${
        destructive
          ? "text-gray-700 hover:bg-red-500/10 hover:text-red-600 dark:text-gray-200 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          : "text-gray-700 hover:bg-black/5 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/5 dark:hover:text-white"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-gray-400">{count}</span>
    </button>
  );
}

function ChipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={`Clear tabs by ${label.toLowerCase()}`}
      className="flex items-start gap-2 px-2.5 py-1"
    >
      <span className="mt-1 w-8 shrink-0 text-[10px] uppercase tracking-[0.14em] text-gray-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function ClearChip({
  label,
  icon: Icon,
  count,
  description,
  onSelect,
}: {
  label: string;
  icon?: LucideIcon;
  count: number;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      title={description}
      aria-label={description}
      className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/[0.02] px-1.5 py-0.5 text-xs text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-red-500/10 dark:hover:text-red-400"
    >
      {Icon ? (
        <Icon className="h-3 w-3" aria-hidden="true" />
      ) : (
        <span>{label}</span>
      )}
      <span className="text-[10px] tabular-nums opacity-55">{count}</span>
    </button>
  );
}

export function WorkplacesShellNavigationTrailingControls() {
  const clearAllWorkspaceTabs = useContentStore(
    (state) => state.clearAllWorkspaceTabs
  );
  const closeContentTab = useContentStore((state) => state.closeContentTab);
  const restoreWorkspace = useContentStore((state) => state.restoreWorkspace);
  const layoutMode = useContentStore((state) => state.layoutMode);
  const panes = useContentStore((state) => state.panes);
  const tabsById = useContentStore((state) => state.tabs);
  const activePaneId = useContentStore((state) => state.activePaneId);
  const persistActiveWorkspace = useWorkspaceStore(
    (state) => state.persistActiveWorkspace
  );
  const historyByPaneId = useNavigationHistoryStore((state) => state.byPaneId);
  const firstSeenAt = useTabActivityStore((state) => state.firstSeenAt);
  const noteSeen = useTabActivityStore((state) => state.noteSeen);

  const { open, openMenu, close, triggerRef, menuRef, menuStyle } =
    useAnchoredMenu({ width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT });

  // Sampled when the menu opens: Date.now() during render is impure, and the
  // buckets only need to be right at the moment they're offered.
  const [menuOpenedAt, setMenuOpenedAt] = useState<number | null>(null);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPressingRef = useRef(false);
  const openedByHoldRef = useRef(false);

  const tabs = useMemo(
    () => collectPaneAttachedTabs(panes, tabsById),
    [panes, tabsById]
  );
  const tabCount = tabs.length;
  const visiblePaneIds = getVisiblePaneIds(layoutMode);
  const isMultiPane = visiblePaneIds.length > 1;

  // A tab restored with a workspace and never clicked has no navigation
  // entry; stamping it on arrival starts its idle clock there.
  useEffect(() => {
    if (tabs.length === 0) return;
    noteSeen(tabs.map((tab) => tab.contentId));
  }, [tabs, noteSeen]);

  const idleTargets = useMemo(() => {
    if (!open || menuOpenedAt === null) return [];
    const activationAt = buildActivationTimes(historyByPaneId);
    return buildIdleTargets(
      tabs,
      (contentId) => resolveLastTouchedAt(contentId, firstSeenAt, activationAt),
      menuOpenedAt
    );
  }, [open, menuOpenedAt, tabs, historyByPaneId, firstSeenAt]);

  const typeTargets = useMemo(
    () => (open ? buildTypeTargets(tabs) : []),
    [open, tabs]
  );

  const othersTarget = useMemo(
    () =>
      open
        ? buildOthersTarget(tabs, panes[activePaneId]?.activeTabId ?? null)
        : null,
    [open, tabs, panes, activePaneId]
  );

  const persistQuietly = useCallback(() => {
    void persistActiveWorkspace().catch((error) => {
      console.error(
        "[WorkplacesShellNavigationTrailingControls] Failed to persist cleared workplace:",
        error
      );
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to persist cleared workplace tabs"
      );
    });
  }, [persistActiveWorkspace]);

  const undoClear = useCallback(
    (
      before: WorkspaceStateSnapshot,
      tabMeta: Record<string, { title?: string | null; contentType?: string | null }>
    ) => {
      const current = useContentStore.getState().getWorkspaceStateSnapshot();
      const paneIds = new Set<WorkspacePaneId>([
        ...(Object.keys(before.paneTabContentIds) as WorkspacePaneId[]),
        ...(Object.keys(current.paneTabContentIds) as WorkspacePaneId[]),
      ]);

      const paneTabContentIds: Partial<Record<WorkspacePaneId, string[]>> = {};
      const restored: string[] = [];
      for (const paneId of paneIds) {
        const wasOpen = before.paneTabContentIds[paneId]?.contentIds ?? [];
        const nowOpen = current.paneTabContentIds[paneId]?.contentIds ?? [];
        // Anything opened during the undo window survives: undo puts back what
        // the clear removed, it doesn't rewind the workspace.
        const merged = [...wasOpen];
        for (const contentId of nowOpen) {
          if (!merged.includes(contentId)) merged.push(contentId);
        }
        paneTabContentIds[paneId] = merged;
        for (const contentId of wasOpen) {
          if (!nowOpen.includes(contentId)) restored.push(contentId);
        }
      }
      if (restored.length === 0) return;

      // The clear recorded close-intents, and a peer may already have written a
      // snapshot without these tabs. Without matching open-intents the next
      // reconcile would faithfully close them again.
      markLocalOpenIntents(restored);
      restoreWorkspace({
        activeContentId: before.activeContentId,
        activePaneId: before.activePaneId,
        layoutMode: before.layoutMode,
        paneTabContentIds,
        tabMeta,
      });
      persistQuietly();
      toast.success(`Restored ${pluralizeTabs(restored.length)}`);
    },
    [restoreWorkspace, persistQuietly]
  );

  /**
   * `perform` exists for the all-tabs case, which keeps using the store's
   * dedicated clear action rather than a loop over closeContentTab.
   */
  const runClear = useCallback(
    (message: string, tabIds: string[], perform?: () => void) => {
      if (tabIds.length === 0) return;
      const store = useContentStore.getState();
      const before = store.getWorkspaceStateSnapshot();
      const tabMeta: Record<
        string,
        { title?: string | null; contentType?: string | null }
      > = {};
      for (const tabId of tabIds) {
        const tab = store.tabs[tabId];
        if (tab) {
          tabMeta[tab.contentId] = {
            title: tab.title,
            contentType: tab.contentType,
          };
        }
      }

      if (perform) perform();
      // Snapshot the ids first: closeContentTab mutates pane tabIds as it goes.
      else [...tabIds].forEach((tabId) => closeContentTab(tabId));

      persistQuietly();
      toast.success(message, {
        duration: UNDO_WINDOW_MS,
        action: { label: "Undo", onClick: () => undoClear(before, tabMeta) },
      });
    },
    [closeContentTab, persistQuietly, undoClear]
  );

  const clearAll = useCallback(() => {
    runClear(
      `Cleared all tabs (${tabs.length})`,
      tabs.map((tab) => tab.id),
      clearAllWorkspaceTabs
    );
  }, [clearAllWorkspaceTabs, runClear, tabs]);

  const openClearMenu = useCallback(() => {
    setMenuOpenedAt(Date.now());
    openMenu();
  }, [openMenu]);

  const selectTarget = useCallback(
    (message: string, tabIds: string[]) => {
      close();
      runClear(message, tabIds);
    },
    [close, runClear]
  );

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // Pointer events rather than mouse events: the same handlers then cover
  // touch, where a crowded tab strip is hardest to prune by hand.
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button > 0) return;
    if (tabCount === 0) return;
    isPressingRef.current = true;
    openedByHoldRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      if (!isPressingRef.current) return;
      openedByHoldRef.current = true;
      openClearMenu();
    }, HOLD_THRESHOLD_MS);
  };

  const handlePointerUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    const wasPressing = isPressingRef.current;
    isPressingRef.current = false;
    if (!wasPressing || openedByHoldRef.current) return;
    // Pressing the trigger while the menu stands dismisses it; otherwise a
    // short press is the plain clear-all action.
    if (open) close();
    else clearAll();
  };

  const cancelPress = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    isPressingRef.current = false;
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(event) => {
          event.preventDefault();
          if (tabCount > 0) openClearMenu();
        }}
        disabled={tabCount === 0}
        aria-haspopup="menu"
        aria-expanded={open}
        className="touch-callout-none inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-red-400"
        title={`Clear all tabs (${tabCount}) — hold for options`}
      >
        <CircleX className="h-3.5 w-3.5" />
      </button>

      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={menuStyle}
              className="z-[100] overflow-auto rounded-md border border-white/10 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:bg-gray-900/95"
            >
              <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                Clear tabs
              </div>

              {isMultiPane
                ? visiblePaneIds.map((paneId) => {
                    const paneTabIds = panes[paneId]?.tabIds ?? [];
                    if (paneTabIds.length === 0) return null;
                    const label = getPaneLabel(layoutMode, paneId);
                    return (
                      <RowButton
                        key={paneId}
                        label={label}
                        count={paneTabIds.length}
                        description={`Close ${pluralizeTabs(paneTabIds.length)} in the ${label.toLowerCase()}`}
                        onSelect={() =>
                          selectTarget(
                            `Cleared ${label.toLowerCase()}`,
                            [...paneTabIds]
                          )
                        }
                      />
                    );
                  })
                : null}

              {othersTarget ? (
                <RowButton
                  label={othersTarget.label}
                  count={othersTarget.tabIds.length}
                  description={othersTarget.description}
                  onSelect={() =>
                    selectTarget(
                      `Closed ${pluralizeTabs(othersTarget.tabIds.length)}`,
                      othersTarget.tabIds
                    )
                  }
                />
              ) : null}

              <RowButton
                label={isMultiPane ? "All panes" : "All tabs"}
                count={tabCount}
                description={`Close all ${pluralizeTabs(tabCount)}`}
                destructive
                onSelect={() => {
                  close();
                  clearAll();
                }}
              />

              {idleTargets.length > 0 || typeTargets.length > 0 ? (
                <div className="my-1 h-px bg-black/5 dark:bg-white/10" />
              ) : null}

              {idleTargets.length > 0 ? (
                <ChipRow label="Idle">
                  {idleTargets.map((target) => (
                    <ClearChip
                      key={target.key}
                      label={target.label}
                      count={target.tabIds.length}
                      description={target.description}
                      onSelect={() =>
                        selectTarget(
                          `Closed ${pluralizeTabs(target.tabIds.length)} idle ${target.label}+`,
                          target.tabIds
                        )
                      }
                    />
                  ))}
                </ChipRow>
              ) : null}

              {typeTargets.length > 0 ? (
                <ChipRow label="Type">
                  {typeTargets.map((target) => (
                    <ClearChip
                      key={target.key}
                      label={target.label}
                      icon={target.icon}
                      count={target.tabIds.length}
                      description={target.description}
                      onSelect={() =>
                        selectTarget(
                          `Closed ${pluralizeTabs(target.tabIds.length)} — ${target.label}`,
                          target.tabIds
                        )
                      }
                    />
                  ))}
                </ChipRow>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
