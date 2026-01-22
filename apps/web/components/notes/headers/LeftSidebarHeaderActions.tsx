/**
 * Left Sidebar Header Actions (Client Component)
 *
 * Interactive buttons for creating folders and notes inline.
 */

"use client";

import { useState } from "react";
import { Plus, FolderPlus, FileText, Upload } from "lucide-react";

interface LeftSidebarHeaderActionsProps {
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateFile: () => void;
  disabled?: boolean;
}

export function LeftSidebarHeaderActions({
  onCreateFolder,
  onCreateNote,
  onCreateFile,
  disabled = false,
}: LeftSidebarHeaderActionsProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleCreateFolder = () => {
    setShowMenu(false);
    onCreateFolder();
  };

  const handleCreateNote = () => {
    setShowMenu(false);
    onCreateNote();
  };

  const handleCreateFile = () => {
    setShowMenu(false);
    onCreateFile();
  };

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setShowMenu(!showMenu)}
        disabled={disabled}
        className="rounded p-1 transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        title={disabled ? "Cannot create when multiple items are selected" : "New file or folder"}
      >
        <Plus className="h-4 w-4" />
      </button>

      {showMenu && !disabled && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-md border border-white/10 bg-[#1a1a1a] shadow-lg">
            <button
              onClick={handleCreateFolder}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors first:rounded-t-md"
            >
              <FolderPlus className="h-4 w-4" />
              <span>New Folder</span>
            </button>
            <button
              onClick={handleCreateNote}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors border-t border-white/5"
            >
              <FileText className="h-4 w-4" />
              <span>New Note</span>
            </button>
            <button
              onClick={handleCreateFile}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors border-t border-white/5 last:rounded-b-md"
            >
              <Upload className="h-4 w-4" />
              <span>New File</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
