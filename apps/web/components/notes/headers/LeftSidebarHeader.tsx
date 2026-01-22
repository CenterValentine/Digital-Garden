/**
 * Left Sidebar Header (Client Component)
 *
 * Header with create actions and search toggle.
 * M6: Added search toggle button
 */

"use client";

import { useSearchStore } from "@/stores/search-store";
import { LeftSidebarHeaderActions } from "./LeftSidebarHeaderActions";

interface LeftSidebarHeaderProps {
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateFile: () => void;
  isCreateDisabled?: boolean;
}

export function LeftSidebarHeader({
  onCreateFolder,
  onCreateNote,
  onCreateFile,
  isCreateDisabled = false,
}: LeftSidebarHeaderProps) {
  const { isSearchOpen, toggleSearch } = useSearchStore();

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
      <div className="flex items-center gap-1">
        {/* Files icon button - always visible, active when files view is open */}
        <button
          onClick={() => {
            if (isSearchOpen) toggleSearch();
          }}
          className={`rounded p-1.5 transition-colors ${
            !isSearchOpen
              ? "text-gold-primary hover:bg-white/10"
              : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
          }`}
          title="Files"
          type="button"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </button>

        {/* Search icon button - always visible, active when search view is open */}
        <button
          onClick={() => {
            if (!isSearchOpen) toggleSearch();
          }}
          className={`rounded p-1.5 transition-colors ${
            isSearchOpen
              ? "text-gold-primary hover:bg-white/10"
              : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
          }`}
          title="Search (Cmd+/)"
          type="button"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>
      </div>
      <LeftSidebarHeaderActions
        onCreateFolder={onCreateFolder}
        onCreateNote={onCreateNote}
        onCreateFile={onCreateFile}
        disabled={isCreateDisabled}
      />
    </div>
  );
}
