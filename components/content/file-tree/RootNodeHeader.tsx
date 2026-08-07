"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Eye, Home, RefreshCw } from "lucide-react";

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
  /** True while the view filter is transiently bypassed (whole tree shown). */
  viewBypassed?: boolean;
  /**
   * Toggle the transient view-filter bypass. When provided on a view-workspace,
   * the view affordance (icon + title) becomes a dropdown: pick the view (filter)
   * or "root" (whole tree). Ephemeral — the caller resets it per workspace.
   */
  onToggleViewBypass?: (bypass: boolean) => void;
}

export function RootNodeHeader({
  workspaceName = "root",
  totalFiles,
  onClick,
  isSelected = false,
  isView = false,
  viewRootTitle,
  onRefresh,
  viewBypassed = false,
  onToggleViewBypass,
}: RootNodeHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside-click / Escape. The menu is portaled, so check both nodes.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        menuRef.current?.contains(t) ||
        triggerRef.current?.contains(t)
      )
        return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // The view affordance is a bypass dropdown only on a view-workspace with a
  // toggle wired in.
  const viewDropdown = isView && !!onToggleViewBypass;

  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ left: r.left, top: r.bottom + 4 });
    setMenuOpen((o) => !o);
  };

  const selectBypass = (bypass: boolean) => {
    onToggleViewBypass?.(bypass);
    setMenuOpen(false);
  };

  const titleText = isView && viewRootTitle ? viewRootTitle : workspaceName;

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
      {viewDropdown ? (
        // View-workspace: dropdown trigger to bypass the filter.
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openMenu();
          }}
          title={viewBypassed ? "Showing all — click to re-apply the view" : "Filtered view — click to show all"}
          className="group/view -ml-1 flex min-w-0 items-center gap-2 rounded px-1 py-0.5 hover:bg-black/[0.05] dark:hover:bg-white/10"
        >
          {viewBypassed ? (
            <Home className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
          ) : (
            <Eye className="h-4 w-4 shrink-0 text-gold-primary" />
          )}
          <span className={`truncate text-sm font-medium ${isSelected ? "text-gold-primary" : "text-gray-900 dark:text-white"}`}>
            {viewBypassed ? "root" : titleText}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-gray-500 opacity-70" />
        </button>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          {isView ? (
            <Eye className={`h-4 w-4 shrink-0 ${isSelected ? "text-gold-primary" : "text-gold-primary/60"}`} />
          ) : (
            <Home className={`h-4 w-4 shrink-0 ${isSelected ? "text-gold-primary" : "text-gray-600 dark:text-gray-400"}`} />
          )}
          <div className="flex flex-col min-w-0">
            <span className={`text-sm font-medium truncate ${isSelected ? "text-gold-primary" : "text-gray-900 dark:text-white"}`}>
              {titleText}
            </span>
          </div>
        </div>
      )}

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

      {/* View-filter dropdown — portaled + fixed so the overflow:hidden tree
          container can't clip it. */}
      {viewDropdown &&
        menuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", left: menuPos.left, top: menuPos.top, zIndex: 200 }}
            className="min-w-[200px] overflow-hidden rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900 py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => selectBypass(false)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-black/[0.05] dark:hover:bg-white/10"
            >
              <Eye className="h-4 w-4 shrink-0 text-gold-primary" />
              <span className="truncate">{viewRootTitle ?? "View"}</span>
              {!viewBypassed && <Check className="ml-auto h-4 w-4 shrink-0 text-gold-primary" />}
            </button>
            <button
              type="button"
              onClick={() => selectBypass(true)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-black/[0.05] dark:hover:bg-white/10"
            >
              <Home className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
              <span className="truncate">root — show all files</span>
              {viewBypassed && <Check className="ml-auto h-4 w-4 shrink-0 text-gold-primary" />}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
