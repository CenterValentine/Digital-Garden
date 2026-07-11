"use client";

import { Files, Search, Plus, PanelRight } from "lucide-react";
import { useMobileUiStore } from "@/state/mobile-ui-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { useLeftPanelCollapseStore } from "@/state/left-panel-collapse-store";
import { useSearchStore } from "@/state/search-store";

/**
 * MobileBottomNav — the phone content-IDE tab bar.
 *
 * Four thumb-reachable tabs. Files/Search open the left drawer on the matching
 * view (reusing the real left-panel + search stores); Panel toggles the right
 * drawer (outline / backlinks / AI). "New" currently routes into the Files
 * drawer, where the tree's create affordance lives — a direct create action is
 * a fast follow (the tree's create flow does optimistic nodes + navigation we
 * don't want to duplicate here).
 *
 * `env(safe-area-inset-bottom)` padding keeps the tabs above the iOS home
 * indicator. Each tab is >= 56px tall to satisfy touch-target guidance.
 */
export function MobileBottomNav() {
  const openDrawer = useMobileUiStore((s) => s.openDrawer);
  const setOpenDrawer = useMobileUiStore((s) => s.setOpenDrawer);
  const toggleDrawer = useMobileUiStore((s) => s.toggleDrawer);
  const setActiveView = useLeftPanelViewStore((s) => s.setActiveView);
  const setMode = useLeftPanelCollapseStore((s) => s.setMode);
  const openSearch = useSearchStore((s) => s.openSearch);

  const openFilesDrawer = () => {
    setMode("full"); // ensure the sidebar shows full content, not the collapsed icon bar
    setActiveView("files");
    setOpenDrawer("left");
  };

  const openSearchDrawer = () => {
    setMode("full");
    setActiveView("search");
    openSearch();
    setOpenDrawer("left");
  };

  const tabs = [
    { key: "files", label: "Files", Icon: Files, onClick: openFilesDrawer, active: openDrawer === "left" },
    { key: "search", label: "Search", Icon: Search, onClick: openSearchDrawer, active: false },
    { key: "new", label: "New", Icon: Plus, onClick: openFilesDrawer, active: false },
    { key: "panel", label: "Panel", Icon: PanelRight, onClick: () => toggleDrawer("right"), active: openDrawer === "right" },
  ] as const;

  return (
    <nav
      aria-label="Content navigation"
      className="z-30 flex shrink-0 items-stretch border-t border-white/10 bg-[var(--background)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map(({ key, label, Icon, onClick, active }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
            active
              ? "text-gold-primary"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
