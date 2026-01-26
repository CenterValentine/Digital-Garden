/**
 * Left Sidebar Header Actions (Client Component)
 *
 * Interactive buttons for creating folders and notes inline.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, FolderPlus, FileText, Upload, FileSpreadsheet, FileType } from "lucide-react";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";

interface LeftSidebarHeaderActionsProps {
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateFile: () => void;
  onCreateDocument?: () => void;
  onCreateSpreadsheet?: () => void;
  disabled?: boolean;
}

export function LeftSidebarHeaderActions({
  onCreateFolder,
  onCreateNote,
  onCreateFile,
  onCreateDocument,
  onCreateSpreadsheet,
  disabled = false,
}: LeftSidebarHeaderActionsProps) {
  const [showMenu, setShowMenu] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);

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

  const handleCreateDocument = () => {
    setShowMenu(false);
    onCreateDocument?.();
  };

  const handleCreateSpreadsheet = () => {
    setShowMenu(false);
    onCreateSpreadsheet?.();
  };

  // Set mounted state for portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate menu position when menu opens
  useEffect(() => {
    if (!showMenu || !buttonRef.current || !menuRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();

    const calculatedPosition = calculateMenuPosition({
      triggerPosition: {
        x: buttonRect.right, // Align to right edge of button
        y: buttonRect.bottom + 4, // Position below button with 4px gap
      },
      menuDimensions: {
        width: menuRect.width,
        height: menuRect.height,
      },
      viewportPadding: 8,
      preferredPlacementX: "left", // Prefer left alignment (so right edge aligns with button)
      preferredPlacementY: "bottom", // Prefer below button
    });

    setMenuPosition(calculatedPosition);
  }, [showMenu]);

  // Reset position when menu closes
  useEffect(() => {
    if (!showMenu) {
      setMenuPosition(null);
    }
  }, [showMenu]);

  // Initial render without positioning (to measure dimensions)
  const menuStyle = !menuPosition
    ? {
        left: 0,
        top: 0,
        visibility: "hidden" as const,
      }
    : {
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
        maxHeight: `${menuPosition.maxHeight}px`,
      };

  const menuContent = showMenu && !disabled && (
    <>
      {/* Backdrop - higher z-index to cover all panels */}
      <div
        className="fixed inset-0 z-[100]"
        onClick={() => setShowMenu(false)}
      />

      {/* Menu - even higher z-index to appear above backdrop */}
      <div
        ref={menuRef}
        className="fixed z-[110] min-w-[180px] rounded-md border border-white/10 bg-[#1a1a1a] shadow-lg overflow-y-auto"
        style={menuStyle}
      >
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
        {onCreateDocument && (
          <button
            onClick={handleCreateDocument}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors border-t border-white/5"
          >
            <FileType className="h-4 w-4" />
            <span>New Document</span>
          </button>
        )}
        {onCreateSpreadsheet && (
          <button
            onClick={handleCreateSpreadsheet}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors border-t border-white/5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>New Spreadsheet</span>
          </button>
        )}
        <button
          onClick={handleCreateFile}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors border-t border-white/5 last:rounded-b-md"
        >
          <Upload className="h-4 w-4" />
          <span>New File</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => !disabled && setShowMenu(!showMenu)}
        disabled={disabled}
        className="rounded p-1 transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        title={disabled ? "Cannot create when multiple items are selected" : "New file or folder"}
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Render menu in portal to avoid clipping */}
      {mounted && menuContent && createPortal(menuContent, document.body)}
    </>
  );
}
