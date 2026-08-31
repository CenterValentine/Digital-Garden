"use client";

/**
 * One grid column header: type glyph, name, and — only when the column has
 * one — a description affordance.
 *
 * The `ⓘ` appears exclusively on columns that carry a description (plan D9).
 * Rendering it always would train people to ignore it, which defeats the
 * point of having descriptions at all.
 */

import { Info } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { DataColumn, DataColumnType } from "@/lib/domain/data";

/** Compact type marks. Mono glyphs read at 11px where an icon would not. */
export const TYPE_GLYPH: Partial<Record<DataColumnType, string>> = {
  text: "Aa",
  longText: "¶",
  number: "#",
  checkbox: "☑",
  date: "▤",
  select: "◉",
  multiSelect: "◎",
  status: "◈",
  url: "↗",
  email: "@",
  phone: "☎",
  person: "☺",
  relation: "⇄",
  contentLink: "⇢",
  file: "▢",
  formula: "ƒ",
  rollup: "Σ",
  lookup: "⌕",
};

export const DEFAULT_COLUMN_WIDTH = 180;

interface DataColumnHeaderProps {
  column: DataColumn;
  width?: number;
  editable?: boolean;
  menuOpen?: boolean;
  onToggleMenu?: (columnId: string) => void;
  /** True while THIS column is being dragged — dims it in place. */
  isDragSource?: boolean;
  /** Which edge shows the insertion line while another column hovers here. */
  dropIndicator?: "left" | "right" | null;
  onColumnDragStart?: (e: React.DragEvent, columnId: string) => void;
  onColumnDragOver?: (e: React.DragEvent, columnId: string) => void;
  onColumnDrop?: (e: React.DragEvent, columnId: string) => void;
  onColumnDragEnd?: () => void;
  /** Present = a resize grip renders on the right edge. */
  onResizeStart?: (e: React.PointerEvent, columnId: string) => void;
  /** Rendered by the parent so the popover is not clipped by this cell. */
  children?: React.ReactNode;
}

export function DataColumnHeader({
  column,
  width = DEFAULT_COLUMN_WIDTH,
  editable = false,
  menuOpen = false,
  onToggleMenu,
  isDragSource = false,
  dropIndicator = null,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onColumnDragEnd,
  onResizeStart,
  children,
}: DataColumnHeaderProps) {
  const glyph = column.config?.isBacklink
    ? "⇠"
    : (TYPE_GLYPH[column.type] ?? "·");

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center gap-2 border-r border-border/60 px-3 py-2",
        "text-xs font-medium text-muted-foreground",
        editable && "cursor-pointer hover:bg-muted/60",
        menuOpen && "bg-muted/60",
        isDragSource && "opacity-40"
      )}
      style={{ width }}
      onClick={editable ? () => onToggleMenu?.(column.id) : undefined}
      // Native HTML5 drag: a completed drag suppresses the click, so the
      // menu toggle above stays safe without a movement threshold.
      draggable={editable && !!onColumnDragStart}
      onDragStart={
        onColumnDragStart ? (e) => onColumnDragStart(e, column.id) : undefined
      }
      onDragOver={
        onColumnDragOver ? (e) => onColumnDragOver(e, column.id) : undefined
      }
      onDrop={onColumnDrop ? (e) => onColumnDrop(e, column.id) : undefined}
      onDragEnd={onColumnDragEnd}
    >
      {dropIndicator && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 w-0.5 bg-primary",
            dropIndicator === "left" ? "left-0" : "right-0"
          )}
        />
      )}
      <span
        aria-hidden="true"
        className="font-mono text-[10px] leading-none opacity-60"
      >
        {glyph}
      </span>
      <span className="truncate text-foreground/80" title={column.name}>
        {column.name}
      </span>
      {/* Only on columns that HAVE a description — showing it always would
          train people to ignore it, defeating the point (plan D9). */}
      {column.description && (
        <span
          className="ml-auto shrink-0 text-primary/70"
          title={column.description}
          aria-label={`${column.name}: ${column.description}`}
        >
          <Info className="h-3 w-3" />
        </span>
      )}
      {column.isPrimary && <span className="sr-only">(primary column)</span>}
      {children}
      {/* Resize grip. The header cell is itself `draggable` for reorder, so
          the grip is ALSO draggable with a cancelled dragstart — a draggable
          child claims drag initiation before the parent can, and cancelling
          it leaves only the pointer-based resize. stopPropagation on click
          keeps the menu toggle from firing when a resize ends in place. */}
      {onResizeStart && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${column.name} column`}
          draggable
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizeStart(e, column.id);
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute inset-y-0 -right-[3px] z-10 w-1.5 cursor-col-resize",
            "hover:bg-primary/50 active:bg-primary"
          )}
        />
      )}
    </div>
  );
}
