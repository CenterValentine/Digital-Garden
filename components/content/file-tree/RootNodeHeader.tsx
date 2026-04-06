/**
 * Root Node Header
 *
 * Displays workspace/root information above the file tree.
 * Shows a compact visual indicator for the root level.
 * Phase 2: File tree enhancements
 */

"use client";

import { Home } from "lucide-react";

interface RootNodeHeaderProps {
  workspaceName?: string;
  totalFiles?: number;
  onClick?: () => void;
  isSelected?: boolean;
}

export function RootNodeHeader({
  workspaceName = "root",
  totalFiles,
  onClick,
  isSelected = false,
}: RootNodeHeaderProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      className={`flex items-center justify-between border-b border-white/10 px-3 py-1 transition-colors ${
        onClick ? "cursor-pointer" : ""
      } ${
        isSelected
          ? "bg-white/10 text-gold-primary"
          : onClick
          ? "hover:bg-white/5"
          : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Root/Home icon */}
        <Home className={`h-4 w-4 ${isSelected ? "text-gold-primary" : "text-gray-600"}`} />
        {/* Workspace name */}
        <span className={`text-sm font-medium ${isSelected ? "text-gold-primary" : "text-gray-900"}`}>
          {workspaceName}
        </span>
      </div>

      {/* File count badge (if provided) */}
      {totalFiles !== undefined && (
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400">
          {totalFiles} {totalFiles === 1 ? "file" : "files"}
        </span>
      )}
    </div>
  );
}
