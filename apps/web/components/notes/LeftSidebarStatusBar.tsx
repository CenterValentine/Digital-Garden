/**
 * Left Sidebar Status Bar
 *
 * Shows file tree metadata:
 * - Selection count when multiple items selected
 * - Total item count
 */

"use client";

import { CheckSquare } from "lucide-react";

interface LeftSidebarStatusBarProps {
  selectedCount: number;
  totalCount: number;
}

export function LeftSidebarStatusBar({
  selectedCount,
  totalCount,
}: LeftSidebarStatusBarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-400 border-t border-white/10">
      {/* Left: Selection count */}
      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <div className="flex items-center gap-1.5 text-primary">
            <CheckSquare className="h-3.5 w-3.5" />
            <span className="font-medium">
              {selectedCount} {selectedCount === 1 ? "item" : "items"} selected
            </span>
          </div>
        )}
      </div>

      {/* Right: Total count */}
      <div className="flex items-center gap-1">
        <span>{totalCount} total</span>
      </div>
    </div>
  );
}
