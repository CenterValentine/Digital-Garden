"use client";

/**
 * Row peek — the side panel that makes a wide table usable (plan Phase 2,
 * preview Surface 02).
 *
 * Every column renders as a labelled field. This is deliberately where
 * select / status / date / multiSelect get their first REAL editors — the
 * grid shows them as pills, the peek edits them — and where column
 * descriptions (plan D9) finally render as inline help under the field
 * they describe, which is most of the argument for descriptions existing.
 *
 * No `ContentNode`, no promotion: peek works for every row from day one.
 * The promoted/un-promoted difference stays "does it have a page", not two
 * different screens (plan D12).
 *
 * Fields are UNCONTROLLED (defaultValue + commit on blur), remounted per
 * row via the parent's key. No draft state to sync — the same
 * poll-clobbers-typing hazard the grid cells dodge, dodged the same way.
 */

import { useEffect } from "react";
import { ChevronDown, ChevronUp, NotebookPen, X } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  cellToText,
  type ContentRef,
  type DataColumn,
  type DataRow,
} from "@/lib/domain/data";
import { DataRowFields } from "./DataRowFields";

interface DataRowPeekProps {
  /** The table's contentId — relation link writes go through its API. */
  tableId: string;
  row: DataRow;
  columns: DataColumn[];
  editable: boolean;
  index: number;
  total: number;
  /** Auto-open this column's link picker on mount (the grid's relation +). */
  focusColumnId?: string | null;
  /** Bumped per grid-"+" click so auto-open re-fires on an open peek. */
  focusToken?: number;
  /** Owner-only: create a select/status option from a row editor. */
  onCreateOption?: (
    column: DataColumn,
    label: string
  ) => Promise<{ id: string; label: string } | null>;
  /** Open a linked ContentNode in a workspace tab. */
  onOpenContent: (ref: ContentRef) => void;
  /** Promote this row to a page and open it (plan Phase 5). */
  onOpenAsPage: (rowId: string) => void;
  onCommitCell: (rowId: string, columnKey: string, value: unknown) => void;
  /** Link/unlink happened — the parent reloads so hydration refreshes. */
  onRefresh: () => void;
  onNavigate: (dir: 1 | -1) => void;
  /** "overlay" (default) floats over the grid; "inline" fills a split pane. */
  variant?: "overlay" | "inline";
  onClose: () => void;
}

export function DataRowPeek({
  tableId,
  row,
  columns,
  editable,
  index,
  total,
  focusColumnId,
  focusToken,
  onCreateOption,
  onOpenContent,
  onOpenAsPage,
  onCommitCell,
  onRefresh,
  onNavigate,
  variant = "overlay",
  onClose,
}: DataRowPeekProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (e.key === "Escape" && !typing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const primary = columns.find((c) => c.isPrimary) ?? columns[0] ?? null;
  const rawTitle = primary ? cellToText(primary, row.data[primary.key]) : "";
  const title = rawTitle || "Untitled";

  return (
    <aside
      className={cn(
        "flex flex-col bg-background",
        variant === "overlay"
          ? "absolute inset-y-0 right-0 z-20 w-80 border-l border-border shadow-xl"
          : "h-full min-h-0 w-full"
      )}
      aria-label={`Row: ${title}`}
    >
      <header className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Row {index + 1} of {total}
        </span>
        {/* The note affordance lives HERE, not in a paragraph at the bottom
            of the field stack — it was the peek's most buried feature
            (owner, 2026-08-31). Long copy demoted to the tooltip. */}
        {(row.contentId || editable) && (
          <button
            type="button"
            onClick={() => onOpenAsPage(row.id)}
            title={
              row.contentId
                ? "Open this row's note"
                : "A note gives this row a body, tags, and backlinks — it stays a row of this database either way"
            }
            className="ml-1.5 flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <NotebookPen className="h-3 w-3" />
            {row.contentId ? "Open note" : "Add note"}
          </button>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => onNavigate(-1)}
            title="Previous row"
            className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={index >= total - 1}
            onClick={() => onNavigate(1)}
            title="Next row"
            className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* The heading IS the primary column's value — "Untitled" is its
          empty state, not data (owner asked where it came from,
          2026-08-26). Italic + muted + a tooltip make that legible. */}
      <h3
        className={cn(
          "truncate px-3 pb-1 pt-3 text-base font-semibold",
          !rawTitle && "italic text-muted-foreground"
        )}
        title={
          rawTitle ||
          `Untitled — this row is named by its ${primary?.name ?? "primary"} column`
        }
      >
        {title}
      </h3>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <DataRowFields
          tableId={tableId}
          row={row}
          columns={columns}
          editable={editable}
          focusColumnId={focusColumnId}
          focusToken={focusToken}
          onCreateOption={onCreateOption}
          onOpenContent={onOpenContent}
          onCommitCell={onCommitCell}
          onRefresh={onRefresh}
        />

        {/* The note affordance moved to the header (Add note / Open note) —
            the dashed explainer box it replaced was paragraph-shaped UI for
            a button-shaped feature. */}
      </div>
    </aside>
  );
}
