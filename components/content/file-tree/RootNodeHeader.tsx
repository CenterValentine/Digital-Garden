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
}

export function RootNodeHeader({
  workspaceName = "root",
  totalFiles
}: RootNodeHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-3 py-1">
      <div className="flex items-center gap-2">
        {/* Root/Home icon */}
        <Home className="h-4 w-4 text-gray-600" />
        {/* Workspace name */}
        <span className="text-sm font-medium text-gray-900">{workspaceName}</span>
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
