/**
 * Main Panel Content-View Header
 *
 * Navigation and management toolbar for the active content view.
 * Spans the full content-view width and will house multiple control components.
 *
 * Current Features:
 * - Back/forward navigation buttons (left-aligned)
 * - Hold-down back button (250ms) shows history dropdown
 * - Persistent navigation history (max 100 items, no duplicates)
 * - Click history item to navigate directly
 *
 * Planned Features:
 * - Content search bar (for multi-note views)
 * - Metadata editor for non-note content (tags, categories)
 * - Content-view management tools (split view, focus mode, etc.)
 *
 * Note: This header is specific to the content-view. For multi-note views
 * within the main panel, each view will have its own instance of this header.
 */

"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import { useNavigationHistoryStore } from "@/state/navigation-history-store";
import { NavigationHistoryDropdown } from "./NavigationHistoryDropdown";

const HOLD_THRESHOLD_MS = 250; // 250ms for comfortable hold detection

// Memoized button component to prevent re-renders
const NavigationButtons = memo(({
  canGoBack,
  canGoForward,
  onBackMouseDown,
  onBackMouseUp,
  onBackMouseLeave,
  onForwardClick,
  backButtonRef
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onBackMouseDown: () => void;
  onBackMouseUp: () => void;
  onBackMouseLeave: () => void;
  onForwardClick: () => void;
  backButtonRef: React.RefObject<HTMLButtonElement | null>;
}) => (
  <div className="flex items-center gap-0.5 border-b border-white/10 px-2 py-1">
    <button
      ref={backButtonRef}
      onMouseDown={onBackMouseDown}
      onMouseUp={onBackMouseUp}
      onMouseLeave={onBackMouseLeave}
      disabled={!canGoBack}
      className="rounded p-1 hover:bg-white/10 active:bg-white/5 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
      title="Go back • Hold for history"
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
    <button
      onClick={onForwardClick}
      disabled={!canGoForward}
      className="rounded p-1 hover:bg-white/10 active:bg-white/5 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
      title="Go forward"
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  </div>
));

NavigationButtons.displayName = "NavigationButtons";

export function MainPanelNavigation() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);

  // Subscribe to store state for reactive button states
  const history = useNavigationHistoryStore((state) => state.history);
  const currentIndex = useNavigationHistoryStore((state) => state.currentIndex);
  const addToHistory = useNavigationHistoryStore((state) => state.addToHistory);
  const historyGoBack = useNavigationHistoryStore((state) => state.goBack);
  const historyGoForward = useNavigationHistoryStore((state) => state.goForward);
  const getBackHistory = useNavigationHistoryStore((state) => state.getBackHistory);

  // Dropdown state
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });

  // Hold detection state
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);

  // Use ref instead of state to prevent double-triggering the effect
  const isNavigatingRef = useRef(false);

  // Track content ID changes and add to history
  useEffect(() => {
    // Don't update history if we're actively navigating (back/forward)
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }

    // Add to history when content changes
    addToHistory(selectedContentId);
  }, [selectedContentId, addToHistory]);

  // Derived state (computed from store)
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < history.length - 1;

  // Navigation handlers
  const goBack = useCallback(() => {
    const contentId = historyGoBack();
    if (contentId !== null) {
      isNavigatingRef.current = true;
      setSelectedContentId(contentId);
    }
  }, [historyGoBack, setSelectedContentId]);

  const goForward = useCallback(() => {
    const contentId = historyGoForward();
    if (contentId !== null) {
      isNavigatingRef.current = true;
      setSelectedContentId(contentId);
    }
  }, [historyGoForward, setSelectedContentId]);

  // Navigate to specific history item
  const navigateToHistoryItem = useCallback(
    (contentId: string | null) => {
      isNavigatingRef.current = true;
      setSelectedContentId(contentId);
      // This will add to history via the useEffect above
    },
    [setSelectedContentId]
  );

  // Hold-down detection for back button
  const handleBackMouseDown = useCallback(() => {
    if (!canGoBack) return;

    isHoldingRef.current = true;

    // Store position for dropdown
    const rect = backButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setDropdownPosition({
        x: rect.left,
        y: rect.bottom + 4, // 4px below button
      });
    }

    // Start hold timer
    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        // Show dropdown on hold
        setShowDropdown(true);
      }
    }, HOLD_THRESHOLD_MS);
  }, [canGoBack]);

  const handleBackMouseUp = useCallback(() => {
    if (!canGoBack) return;

    // Clear hold timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    // If not showing dropdown (regular click), navigate back
    if (!showDropdown && isHoldingRef.current) {
      goBack();
    }

    isHoldingRef.current = false;
  }, [canGoBack, showDropdown, goBack]);

  const handleBackMouseLeave = useCallback(() => {
    // Clear hold timer if user moves mouse away
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    isHoldingRef.current = false;
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <NavigationButtons
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBackMouseDown={handleBackMouseDown}
        onBackMouseUp={handleBackMouseUp}
        onBackMouseLeave={handleBackMouseLeave}
        onForwardClick={goForward}
        backButtonRef={backButtonRef}
      />

      {/* History Dropdown */}
      <NavigationHistoryDropdown
        isOpen={showDropdown}
        triggerPosition={dropdownPosition}
        historyItems={getBackHistory()}
        onSelectItem={navigateToHistoryItem}
        onClose={() => setShowDropdown(false)}
      />
    </>
  );
}
