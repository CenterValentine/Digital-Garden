"use client";

/**
 * Right-click menu for a database column — on its header or on any of its
 * cells (owner, 2026-10-09):
 *
 *   Insert column left / right → the same add-column form as the header
 *     row's "+" (AddColumnPanel), opened on the clicked column, landing beside it.
 *   Hide column / Hide N columns → in THIS VIEW only (columnPrefs.hidden);
 *     "Show N hidden columns" and the header row's "N hidden" undo it.
 *   Delete column / Delete N columns → soft delete (values are kept), with
 *     Undo in the grid's banner. N = the selected columns when the click
 *     lands inside a column selection; otherwise just the clicked column.
 *
 * Portaled at the pointer and placed by `calculateMenuPosition` (CLAUDE.md
 * "Menu Positioning"); dismissed by clicking away, Escape, or scrolling.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftToLine, ArrowRightToLine, Eye, EyeOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { calculateMenuPosition, type CalculatedPosition } from "@/lib/core/menu-positioning";

export interface ColumnContextMenuState {
  columnId: string;
  x: number;
  y: number;
}

interface DataColumnContextMenuProps {
  menu: ColumnContextMenuState;
  /** How many columns Delete acts on (≥1). */
  deleteCount: number;
  /** Delete is unavailable (e.g. a locked system column is in the set). */
  deleteBlockedReason?: string | null;
  onInsert: (side: "left" | "right") => void;
  onDelete: () => void;
  /** Hide acts on the same set as Delete — in THIS VIEW only. */
  onHide: () => void;
  /** Why Hide is unavailable (e.g. it would hide every column). */
  hideBlockedReason?: string | null;
  /** Columns this view hides — "Show N hidden columns" brings them back. */
  hiddenCount: number;
  onShowHidden: () => void;
  /** The view hiding applies to, named in the menu so the scope is plain. */
  viewName?: string;
  onClose: () => void;
}

const itemClass =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export function DataColumnContextMenu({
  menu,
  deleteCount,
  deleteBlockedReason,
  onInsert,
  onDelete,
  onHide,
  hideBlockedReason,
  hiddenCount,
  onShowHidden,
  viewName,
  onClose,
}: DataColumnContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CalculatedPosition | null>(null);

  // Two-phase: render hidden, measure, then place (flip/shift at edges).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(
      calculateMenuPosition({
        triggerPosition: { x: menu.x, y: menu.y },
        menuDimensions: { width: r.width, height: r.height },
      })
    );
  }, [menu.x, menu.y]);

  // Registered once per mount with onClose read through a ref — re-subscribing
  // per render loses presses that re-render mid-dispatch (see PanelPortal).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const close = () => onCloseRef.current();
    // A scroll already in flight when the menu opened (trackpad momentum, the
    // browser bringing the clicked column into view) is not the user leaving.
    const openedAt = performance.now();
    const onScroll = () => {
      if (performance.now() - openedAt > 250) close();
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Column actions"
      className={cn(
        "fixed z-[130] min-w-[11rem] rounded-lg border border-border bg-popover p-1 text-foreground shadow-lg"
      )}
      style={pos ? { left: pos.x, top: pos.y } : { left: 0, top: 0, visibility: "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" role="menuitem" className={itemClass} onClick={() => onInsert("left")}>
        <ArrowLeftToLine className="h-3.5 w-3.5 text-muted-foreground" />
        Insert column left
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={() => onInsert("right")}>
        <ArrowRightToLine className="h-3.5 w-3.5 text-muted-foreground" />
        Insert column right
      </button>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        disabled={Boolean(hideBlockedReason)}
        title={hideBlockedReason ?? `Only in ${viewName ? `the “${viewName}” view` : "this view"} — other views keep showing it`}
        onClick={onHide}
      >
        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        {deleteCount > 1 ? `Hide ${deleteCount} columns` : "Hide column"}
        <span className="ml-auto pl-3 text-[10px] text-muted-foreground">this view</span>
      </button>
      {hiddenCount > 0 && (
        <button type="button" role="menuitem" className={itemClass} onClick={onShowHidden}>
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          {hiddenCount === 1 ? "Show 1 hidden column" : `Show ${hiddenCount} hidden columns`}
        </button>
      )}
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        role="menuitem"
        className={cn(itemClass, "text-red-600 dark:text-red-400")}
        disabled={Boolean(deleteBlockedReason)}
        title={deleteBlockedReason ?? "Values are kept — undo from the notice"}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {deleteCount > 1 ? `Delete ${deleteCount} columns` : "Delete column"}
      </button>
    </div>,
    document.body
  );
}
