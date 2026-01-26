/**
 * Left Sidebar Collapsed (Icon Bar)
 *
 * Shows when panel is in "hidden" mode.
 * Displays icon-only view with ability to expand back to full mode.
 */

"use client";

import { Folder, Search, Puzzle } from "lucide-react";
import { useSearchStore } from "@/stores/search-store";
import { useLeftPanelCollapseStore } from "@/stores/left-panel-collapse-store";
import { useLeftPanelViewStore } from "@/stores/left-panel-view-store";

export function LeftSidebarCollapsed() {
  const { isSearchOpen, toggleSearch } = useSearchStore();
  const { setMode } = useLeftPanelCollapseStore();
  const { activeView, setActiveView } = useLeftPanelViewStore();

  const handleSearchClick = () => {
    // Expand panel and open search
    setMode("full");
    setActiveView("search");
    if (!isSearchOpen) {
      toggleSearch();
    }
  };

  const handleFilesClick = () => {
    // Expand panel and show files
    setMode("full");
    setActiveView("files");
    if (isSearchOpen) {
      toggleSearch();
    }
  };

  const handleExtensionsClick = () => {
    // Expand panel and show extensions
    setMode("full");
    setActiveView("extensions");
    if (isSearchOpen) {
      toggleSearch();
    }
  };

  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-white/10 bg-black/20 py-2 gap-1">
      {/* Files icon */}
      <button
        onClick={handleFilesClick}
        className={`rounded p-2 transition-colors ${
          activeView === "files"
            ? "text-gold-primary bg-white/10"
            : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
        }`}
        title="Files"
        type="button"
      >
        <Folder className="h-5 w-5" />
      </button>

      {/* Search icon */}
      <button
        onClick={handleSearchClick}
        className={`rounded p-2 transition-colors ${
          activeView === "search"
            ? "text-gold-primary bg-white/10"
            : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
        }`}
        title="Search (Cmd+/)"
        type="button"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* Extensions placeholder */}
      <button
        onClick={handleExtensionsClick}
        className={`rounded p-2 transition-colors ${
          activeView === "extensions"
            ? "text-gold-primary bg-white/10"
            : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
        }`}
        title="Extensions (Coming Soon)"
        type="button"
      >
        <Puzzle className="h-5 w-5" />
      </button>
    </div>
  );
}
