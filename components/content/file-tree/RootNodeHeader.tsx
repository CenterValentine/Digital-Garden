"use client";

import { Eye, Home } from "lucide-react";

interface RootNodeHeaderProps {
  workspaceName?: string;
  totalFiles?: number;
  onClick?: () => void;
  isSelected?: boolean;
  isView?: boolean;
  viewRootTitle?: string | null;
}

export function RootNodeHeader({
  workspaceName = "root",
  totalFiles,
  onClick,
  isSelected = false,
  isView = false,
  viewRootTitle,
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
      <div className="flex items-center gap-2 min-w-0">
        {isView ? (
          <Eye className={`h-4 w-4 shrink-0 ${isSelected ? "text-gold-primary" : "text-gold-primary/60"}`} />
        ) : (
          <Home className={`h-4 w-4 shrink-0 ${isSelected ? "text-gold-primary" : "text-gray-600"}`} />
        )}
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-medium truncate ${isSelected ? "text-gold-primary" : "text-gray-900 dark:text-white"}`}>
            {isView && viewRootTitle ? viewRootTitle : workspaceName}
          </span>
        </div>
      </div>

      {totalFiles !== undefined && (
        <span className="ml-2 shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400">
          {totalFiles} {totalFiles === 1 ? "file" : "files"}
        </span>
      )}
    </div>
  );
}
