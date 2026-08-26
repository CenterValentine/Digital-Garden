"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Eye, Hammer, Home, RefreshCw } from "lucide-react";

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
  /**
   * Scope choices for the filter dropdown, most-specific first. On a plain
   * view-workspace this is [view, root]; on a workbench it is
   * [workbench, parent view, root] — the "more acute layer" keeps escape
   * hatches to both broader scopes. When provided (length > 1) the affordance
   * becomes a dropdown; the selection is ephemeral and the caller resets it
   * per workspace change.
   */
  scopeOptions?: RootScopeOption[];
  /** Key of the currently applied scope option. */
  activeScopeKey?: string;
  onSelectScope?: (key: string) => void;
}

export interface RootScopeOption {
  key: string;
  label: string;
  kind: "workbench" | "view" | "root";
}

export function RootNodeHeader({
  workspaceName = "root",
  totalFiles,
  onClick,
  isSelected = false,
  isView = false,
  viewRootTitle,
  onRefresh,
  scopeOptions,
  activeScopeKey,
  onSelectScope,
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

  // The view affordance is a scope dropdown only when the caller wired in
  // more than one scope to choose between.
  const viewDropdown =
    !!scopeOptions && scopeOptions.length > 1 && !!onSelectScope;
  const activeScope =
    scopeOptions?.find((option) => option.key === activeScopeKey) ??
    scopeOptions?.[0] ??
    null;
  const scopeIcon = (kind: RootScopeOption["kind"], className: string) =>
    kind === "root" ? (
      <Home className={className} />
    ) : kind === "workbench" ? (
      <Hammer className={className} />
    ) : (
      <Eye className={className} />
    );

  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ left: r.left, top: r.bottom + 4 });
    setMenuOpen((o) => !o);
  };

  const selectScope = (key: string) => {
    onSelectScope?.(key);
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
          title="Choose what the file tree shows"
          className="group/view -ml-1 flex min-w-0 items-center gap-2 rounded px-1 py-0.5 hover:bg-black/[0.05] dark:hover:bg-white/10"
        >
          {activeScope ? (
            scopeIcon(
              activeScope.kind,
              `h-4 w-4 shrink-0 ${activeScope.kind === "root" ? "text-gray-600 dark:text-gray-400" : "text-gold-primary"}`,
            )
          ) : (
            <Eye className="h-4 w-4 shrink-0 text-gold-primary" />
          )}
          <span className={`truncate text-sm font-medium ${isSelected ? "text-gold-primary" : "text-gray-900 dark:text-white"}`}>
            {activeScope?.kind === "root" ? "root" : (activeScope?.label ?? titleText)}
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
            {(scopeOptions ?? []).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => selectScope(option.key)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-black/[0.05] dark:hover:bg-white/10"
              >
                {scopeIcon(
                  option.kind,
                  `h-4 w-4 shrink-0 ${option.kind === "root" ? "text-gray-600 dark:text-gray-400" : "text-gold-primary"}`,
                )}
                <span className="truncate">{option.label}</span>
                {activeScope?.key === option.key && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-gold-primary" />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
