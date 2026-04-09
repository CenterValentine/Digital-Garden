/**
 * Main Panel Content-View Header
 *
 * Shared workspace navigation for the currently focused pane.
 */

"use client";

import { createElement, useEffect, useState, useCallback, useRef, memo } from "react";
import type { ComponentType, RefObject } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Grid2x2,
  Rows2,
  Square,
} from "lucide-react";
import {
  getPaneActiveContentId,
  useContentStore,
  type WorkspaceLayoutMode,
  type WorkspacePaneId,
} from "@/state/content-store";
import {
  EMPTY_PANE_HISTORY,
  useNavigationHistoryStore,
} from "@/state/navigation-history-store";
import { NavigationHistoryDropdown } from "./NavigationHistoryDropdown";
import {
  useExtensionShellNavigationControls,
  useExtensionShellNavigationTrailingControls,
} from "@/lib/extensions/client-registry";

const HOLD_THRESHOLD_MS = 250;

const LAYOUT_OPTIONS: Array<{
  mode: WorkspaceLayoutMode;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { mode: "single", label: "Single Pane", icon: Square },
  { mode: "dual-vertical", label: "Vertical Split", icon: Columns2 },
  { mode: "dual-horizontal", label: "Horizontal Split", icon: Rows2 },
  { mode: "quad", label: "Quad Split", icon: Grid2x2 },
];

interface NavigationButtonsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onBackMouseDown: () => void;
  onBackMouseUp: () => void;
  onBackMouseLeave: () => void;
  onForwardClick: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}

const NavigationButtons = memo(function NavigationButtons({
  canGoBack,
  canGoForward,
  onBackMouseDown,
  onBackMouseUp,
  onBackMouseLeave,
  onForwardClick,
  backButtonRef,
}: NavigationButtonsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        ref={backButtonRef}
        onMouseDown={onBackMouseDown}
        onMouseUp={onBackMouseUp}
        onMouseLeave={onBackMouseLeave}
        disabled={!canGoBack}
        className="rounded p-1 hover:bg-white/10 active:bg-white/5 focus:outline-none disabled:cursor-not-allowed disabled:opacity-30"
        title="Go back • Hold for history"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={onForwardClick}
        disabled={!canGoForward}
        className="rounded p-1 hover:bg-white/10 active:bg-white/5 focus:outline-none disabled:cursor-not-allowed disabled:opacity-30"
        title="Go forward"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
});

interface MainPanelNavigationProps {
  paneId: WorkspacePaneId;
}

NavigationButtons.displayName = "NavigationButtons";

export function MainPanelNavigation({ paneId }: MainPanelNavigationProps) {
  const layoutMode = useContentStore((state) => state.layoutMode);
  const paneContentId = useContentStore((state) => getPaneActiveContentId(state, paneId));
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const setLayoutMode = useContentStore((state) => state.setLayoutMode);
  const shellNavigationControls = useExtensionShellNavigationControls();
  const shellNavigationTrailingControls = useExtensionShellNavigationTrailingControls();

  const paneHistory = useNavigationHistoryStore((state) =>
    state.byPaneId[paneId] ?? EMPTY_PANE_HISTORY
  );
  const addToHistory = useNavigationHistoryStore((state) => state.addToHistory);
  const historyGoBack = useNavigationHistoryStore((state) => state.goBack);
  const historyGoForward = useNavigationHistoryStore((state) => state.goForward);
  const getBackHistory = useNavigationHistoryStore((state) => state.getBackHistory);

  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);

  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const layoutButtonRef = useRef<HTMLButtonElement>(null);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }

    addToHistory(paneContentId, paneId);
  }, [paneContentId, paneId, addToHistory]);

  useEffect(() => {
    if (!isLayoutMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isClickInsideMenu = layoutMenuRef.current?.contains(target);
      const isClickInsideButton = layoutButtonRef.current?.contains(target);

      if (!isClickInsideMenu && !isClickInsideButton) {
        setIsLayoutMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isLayoutMenuOpen]);

  const canGoBack = paneHistory.currentIndex > 0;
  const canGoForward = paneHistory.currentIndex < paneHistory.history.length - 1;

  const goBack = useCallback(() => {
    const contentId = historyGoBack(paneId);
    if (contentId !== null) {
      isNavigatingRef.current = true;
      setSelectedContentId(contentId, { paneId });
    }
  }, [historyGoBack, paneId, setSelectedContentId]);

  const goForward = useCallback(() => {
    const contentId = historyGoForward(paneId);
    if (contentId !== null) {
      isNavigatingRef.current = true;
      setSelectedContentId(contentId, { paneId });
    }
  }, [historyGoForward, paneId, setSelectedContentId]);

  const navigateToHistoryItem = useCallback(
    (contentId: string | null) => {
      if (!contentId) return;
      isNavigatingRef.current = true;
      setSelectedContentId(contentId, { paneId });
    },
    [paneId, setSelectedContentId]
  );

  const handleBackMouseDown = useCallback(() => {
    if (!canGoBack) return;

    isHoldingRef.current = true;

    const rect = backButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setDropdownPosition({
        x: rect.left,
        y: rect.bottom + 4,
      });
    }

    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        setShowDropdown(true);
      }
    }, HOLD_THRESHOLD_MS);
  }, [canGoBack]);

  const handleBackMouseUp = useCallback(() => {
    if (!canGoBack) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (!showDropdown && isHoldingRef.current) {
      goBack();
    }

    isHoldingRef.current = false;
  }, [canGoBack, goBack, showDropdown]);

  const handleBackMouseLeave = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    isHoldingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const currentLayout =
    LAYOUT_OPTIONS.find((option) => option.mode === layoutMode) ?? LAYOUT_OPTIONS[0];
  const CurrentLayoutIcon = currentLayout.icon;

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-2 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <NavigationButtons
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onBackMouseDown={handleBackMouseDown}
            onBackMouseUp={handleBackMouseUp}
            onBackMouseLeave={handleBackMouseLeave}
            onForwardClick={goForward}
            backButtonRef={backButtonRef}
          />
          {shellNavigationControls.map((Control) =>
            createElement(Control, {
              key: Control.displayName ?? Control.name,
              paneId,
            })
          )}
          <div className="relative">
            <button
              ref={layoutButtonRef}
              type="button"
              onClick={() => setIsLayoutMenuOpen((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
              title="Choose workspace layout"
            >
              <CurrentLayoutIcon className="h-3.5 w-3.5" />
              <span>{currentLayout.label}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  isLayoutMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isLayoutMenuOpen && (
              <div
                ref={layoutMenuRef}
                className="absolute left-0 top-full z-40 mt-2 min-w-48 rounded-md border border-white/10 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:bg-gray-900/95"
              >
                {LAYOUT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isActive = option.mode === layoutMode;

                  return (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => {
                        setLayoutMode(option.mode);
                        setIsLayoutMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-gold-primary/10 text-gold-primary"
                          : "text-gray-700 hover:bg-black/5 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/5 dark:hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {shellNavigationTrailingControls.map((Control) =>
            createElement(Control, {
              key: Control.displayName ?? Control.name,
              paneId,
            })
          )}
        </div>
      </div>

      <NavigationHistoryDropdown
        isOpen={showDropdown}
        triggerPosition={dropdownPosition}
        historyItems={getBackHistory(paneId)}
        onSelectItem={navigateToHistoryItem}
        onClose={() => setShowDropdown(false)}
      />
    </>
  );
}
