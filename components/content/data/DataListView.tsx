"use client";

/**
 * List view (plan Phase 2, O12 view modes; built 2026-08-27).
 *
 * The compact scan surface: one row per line — primary value as the title,
 * the next few columns inline as muted context. Clicking opens the row peek,
 * same as a board card. No inline editing here on purpose: a list exists to
 * find a row fast, and the peek is a click away with every field editable.
 * Renders all rows like the board does — at this feature's design scale
 * (plan D1, ≤10k rows) a flat list is cheaper than virtualizing a second
 * surface.
 */

import { cn } from "@/lib/core/utils";
import {
  cellToText,
  deriveRowTitle,
  type DataColumn,
  type DataRow,
} from "@/lib/domain/data";

/** How many secondary columns ride along as inline context. */
const CONTEXT_COLUMNS = 3;

interface DataListViewProps {
  rows: DataRow[];
  columns: DataColumn[];
  onOpenRow: (rowId: string) => void;
}

export function DataListView({ rows, columns, onOpenRow }: DataListViewProps) {
  const secondary = columns
    .filter((c) => !c.isPrimary && !c.deletedAt)
    .slice(0, CONTEXT_COLUMNS);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        No rows match this view.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => {
        const title = deriveRowTitle(columns, row.data);
        const untitled = title === "Untitled";
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpenRow(row.id)}
            className="flex items-baseline gap-3 border-b border-border/40 px-4 py-2 text-left hover:bg-muted/50"
          >
            <span
              className={cn(
                "shrink-0 text-xs font-medium",
                untitled && "italic text-muted-foreground"
              )}
            >
              {title}
            </span>
            <span className="flex min-w-0 gap-3 text-[11px] text-muted-foreground">
              {secondary.map((col) => {
                const text = cellToText(col, row.data[col.key]);
                return text ? (
                  <span key={col.id} className="truncate" title={col.name}>
                    {text}
                  </span>
                ) : null;
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
