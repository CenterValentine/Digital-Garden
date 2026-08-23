"use client";

/**
 * One grid row and its cells.
 *
 * Editing is commit-on-blur / commit-on-Enter rather than per-keystroke: a
 * keystroke-level write turns one edit into forty undo entries and forty
 * round trips, and Escape needs somewhere to revert *to*.
 */

import { memo, useCallback, useState } from "react";
import { cn } from "@/lib/core/utils";
import { cellToText, type CellValue, type DataColumn, type DataRow } from "@/lib/domain/data";
import { DEFAULT_COLUMN_WIDTH } from "./DataColumnHeader";

interface DataGridRowProps {
  row: DataRow;
  columns: DataColumn[];
  height: number;
  selected: boolean;
  editable: boolean;
  onToggleSelect: (rowId: string) => void;
  onCommitCell: (rowId: string, columnKey: string, value: unknown) => void;
}

function DataGridRowImpl({
  row,
  columns,
  height,
  selected,
  editable,
  onToggleSelect,
  onCommitCell,
}: DataGridRowProps) {
  return (
    <div
      className={cn(
        "flex border-b border-border/40",
        selected ? "bg-primary/5" : "hover:bg-muted/40"
      )}
      style={{ height }}
    >
      <div className="flex w-9 shrink-0 items-center justify-center border-r border-border/40">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(row.id)}
          aria-label="Select row"
          className="h-3.5 w-3.5 accent-current"
        />
      </div>
      {columns.map((column) => (
        <DataCell
          key={column.id}
          column={column}
          rowId={row.id}
          value={row.data[column.key]}
          editable={editable}
          onCommit={onCommitCell}
        />
      ))}
    </div>
  );
}

export const DataGridRow = memo(DataGridRowImpl);

// ── Cell ─────────────────────────────────────────────────────────────────

interface DataCellProps {
  column: DataColumn;
  rowId: string;
  value: CellValue | undefined;
  editable: boolean;
  onCommit: (rowId: string, columnKey: string, value: unknown) => void;
}

function DataCell({ column, rowId, value, editable, onCommit }: DataCellProps) {
  /**
   * The draft exists ONLY while editing, and is seeded at the moment editing
   * begins. Holding a draft mirrored from `value` would mean syncing it back
   * whenever a poll landed — which is both a cascading-render bug the React
   * Compiler rejects, and a real data-loss hazard: a poll arriving mid-typing
   * would overwrite what the user was in the middle of writing.
   *
   * `null` = not editing. Empty string is a legitimate draft.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const asText = value === undefined ? "" : String(value);

  const beginEdit = useCallback(() => {
    setDraft(value === undefined ? "" : String(value));
  }, [value]);

  const commit = useCallback(() => {
    if (draft === null) return;
    const next = draft;
    setDraft(null);
    if (next === asText) return;
    onCommit(rowId, column.key, next === "" ? undefined : next);
  }, [draft, asText, onCommit, rowId, column.key]);

  const cancel = useCallback(() => setDraft(null), []);

  // Checkboxes have no edit mode — a click IS the commit.
  if (column.type === "checkbox") {
    return (
      <div
        className="flex shrink-0 items-center border-r border-border/40 px-3"
        style={{ width: DEFAULT_COLUMN_WIDTH }}
      >
        <input
          type="checkbox"
          checked={value === true}
          disabled={!editable}
          onChange={(e) => onCommit(rowId, column.key, e.target.checked)}
          aria-label={column.name}
          className="h-3.5 w-3.5 accent-current"
        />
      </div>
    );
  }

  const isSelectLike =
    column.type === "select" ||
    column.type === "status" ||
    column.type === "multiSelect";

  if (editing && editable && !isSelectLike) {
    return (
      <div
        className="shrink-0 border-r border-border/40"
        style={{ width: DEFAULT_COLUMN_WIDTH }}
      >
        <input
          autoFocus
          value={draft ?? ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className={cn(
            "h-full w-full bg-background px-3 text-xs outline-none",
            "ring-2 ring-inset ring-primary"
          )}
          type={column.type === "number" ? "number" : "text"}
        />
      </div>
    );
  }

  const display = cellToText(column, value);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center overflow-hidden border-r border-border/40 px-3 text-xs",
        editable && "cursor-text",
        column.type === "number" && "justify-end font-mono tabular-nums"
      )}
      style={{ width: DEFAULT_COLUMN_WIDTH }}
      onDoubleClick={() => {
        if (editable && !isSelectLike) beginEdit();
      }}
      title={display || undefined}
    >
      {isSelectLike && display ? (
        <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px]">
          {display}
        </span>
      ) : (
        <span className="truncate">{display}</span>
      )}
    </div>
  );
}
