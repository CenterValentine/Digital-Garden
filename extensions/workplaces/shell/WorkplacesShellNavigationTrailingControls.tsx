"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleX } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import {
  useContentStore,
  getVisiblePaneIds,
  getPaneLabel,
  type WorkspacePaneId,
} from "@/state/content-store";

/**
 * Clear-tabs control.
 *
 * Click        → clear every tab in the workplace (the common case).
 * Hold (250ms) → menu of targets: each visible pane individually, or all panes.
 *
 * The hold-for-options gesture mirrors the back button's hold-for-history in
 * MainPanelNavigation, so the whole navigation bar shares one interaction
 * grammar: tap does the obvious thing, hold reveals the choices.
 */

const HOLD_THRESHOLD_MS = 250;

export function WorkplacesShellNavigationTrailingControls() {
  const clearAllWorkspaceTabs = useContentStore(
    (state) => state.clearAllWorkspaceTabs
  );
  const closeContentTab = useContentStore((state) => state.closeContentTab);
  const workspaceTabCount = useContentStore(
    (state) => Object.keys(state.tabs).length
  );
  const layoutMode = useContentStore((state) => state.layoutMode);
  const panes = useContentStore((state) => state.panes);
  const persistActiveWorkspace = useWorkspaceStore(
    (state) => state.persistActiveWorkspace
  );

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const visiblePaneIds = getVisiblePaneIds(layoutMode);
  const isMultiPane = visiblePaneIds.length > 1;

  const persist = useCallback(
    (message: string) => {
      void persistActiveWorkspace()
        .then(() => toast.success(message))
        .catch((error) => {
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
    },
    [persistActiveWorkspace]
  );

  const clearAll = useCallback(() => {
    if (workspaceTabCount === 0) return;
    clearAllWorkspaceTabs();
    persist("Cleared all workplace tabs");
  }, [clearAllWorkspaceTabs, persist, workspaceTabCount]);

  const clearPane = useCallback(
    (paneId: WorkspacePaneId) => {
      const tabIds = panes[paneId]?.tabIds ?? [];
      if (tabIds.length === 0) return;
      // Snapshot first: closeContentTab mutates the pane's tabIds as it goes.
      [...tabIds].forEach((tabId) => closeContentTab(tabId));
      persist(`Cleared ${getPaneLabel(layoutMode, paneId).toLowerCase()}`);
    },
    [closeContentTab, layoutMode, panes, persist]
  );

  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isMenuOpen]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  const handleMouseDown = () => {
    if (workspaceTabCount === 0) return;
    isHoldingRef.current = true;
    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) setIsMenuOpen(true);
    }, HOLD_THRESHOLD_MS);
  };

  const handleMouseUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    // A short press that didn't open the menu is the plain "clear all" action.
    if (!isMenuOpen && isHoldingRef.current) clearAll();
    isHoldingRef.current = false;
  };

  const handleMouseLeave = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    isHoldingRef.current = false;
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        disabled={workspaceTabCount === 0}
        className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-red-400"
        title={
          isMultiPane
            ? "Clear all tabs — hold to choose a pane"
            : "Clear all tabs — hold for options"
        }
      >
        <CircleX className="h-3.5 w-3.5" />
      </button>

      {isMenuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 mt-2 min-w-52 rounded-md border border-white/10 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:bg-gray-900/95"
        >
          <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            Clear tabs
          </div>

          {isMultiPane &&
            visiblePaneIds.map((paneId) => {
              const count = panes[paneId]?.tabIds.length ?? 0;
              return (
                <button
                  key={paneId}
                  type="button"
                  disabled={count === 0}
                  onClick={() => {
                    clearPane(paneId);
                    setIsMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded px-2.5 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-black/5 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/5 dark:hover:text-white"
                >
                  <span>{getPaneLabel(layoutMode, paneId)}</span>
                  <span className="text-xs text-gray-400">{count}</span>
                </button>
              );
            })}

          <button
            type="button"
            onClick={() => {
              clearAll();
              setIsMenuOpen(false);
            }}
            className="flex w-full items-center justify-between gap-3 rounded px-2.5 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-gray-200 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <span>{isMultiPane ? "All panes" : "All tabs"}</span>
            <span className="text-xs text-gray-400">{workspaceTabCount}</span>
          </button>
        </div>
      )}
    </div>
  );
}
