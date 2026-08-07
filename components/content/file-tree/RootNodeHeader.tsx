"use client";

import { Eye, Home, RefreshCw } from "lucide-react";

interface RootNodeHeaderProps {
  workspaceName?: string;
  totalFiles?: number;
  onClick?: () => void;
  isSelected?: boolean;
  isView?: boolean;
  viewRootTitle?: string | null;
  /**
   * Refresh the file tree (re-fetch). When provided, the file-count chip becomes
   * a hover target that reveals a semi-transparent refresh button — the count is
   * the resting state, refresh is hidden behind it.
   */
  onRefresh?: () => void;
}

export function RootNodeHeader({
  workspaceName = "root",
  totalFiles,
  onClick,
  isSelected = false,
  isView = false,
  viewRootTitle,
  onRefresh,
}: RootNodeHeaderProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      className={`flex items-center justify-between border-b border-black/10 dark:border-white/10 px-3 py-1 transition-colors ${
        onClick ? "cursor-pointer" : ""
      } ${
        isSelected
          ? "bg-black/[0.05] dark:bg-white/10 text-gold-primary"
          : onClick
          ? "hover:bg-black/[0.04] dark:hover:bg-white/5"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isView ? (
          <Eye className={`h-4 w-4 shrink-0 ${isSelected ? "text-gold-primary" : "text-gold-primary/60"}`} />
        ) : (
          <Home className={`h-4 w-4 shrink-0 ${isSelected ? "text-gold-primary" : "text-gray-600 dark:text-gray-400"}`} />
        )}
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-medium truncate ${isSelected ? "text-gold-primary" : "text-gray-900 dark:text-white"}`}>
            {isView && viewRootTitle ? viewRootTitle : workspaceName}
          </span>
        </div>
      </div>

      {totalFiles !== undefined &&
        (onRefresh ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            title="Refresh file tree"
            aria-label="Refresh file tree"
            className="group/refresh relative ml-2 shrink-0 cursor-pointer rounded-full bg-black/[0.04] dark:bg-white/5 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-black/[0.07] dark:hover:bg-white/10 transition-colors"
          >
            {/* Resting state: the file count. Fades out on hover. */}
            <span className="transition-opacity duration-150 group-hover/refresh:opacity-0">
              {totalFiles} {totalFiles === 1 ? "file" : "files"}
            </span>
            {/* Hidden behind the count: a semi-transparent refresh, revealed on
                hover (tuned for light + dark). */}
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover/refresh:opacity-100">
              <RefreshCw className="h-3.5 w-3.5 text-gray-600/70 dark:text-gray-200/70" />
            </span>
          </button>
        ) : (
          <span className="ml-2 shrink-0 rounded-full bg-black/[0.04] dark:bg-white/5 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
            {totalFiles} {totalFiles === 1 ? "file" : "files"}
          </span>
        ))}
    </div>
  );
}
