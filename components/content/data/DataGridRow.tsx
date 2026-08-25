"use client";

/**
 * One grid row and its cells.
 *
 * Editing is commit-on-blur / commit-on-Enter rather than per-keystroke: a
 * keystroke-level write turns one edit into forty undo entries and forty
 * round trips, and Escape needs somewhere to revert *to*.
 *
 * Keyboard model (owner friction, 2026-08-24):
 *  - Tab / Shift+Tab commit and advance editing to the adjacent inline-
 *    editable cell — the parent owns the geometry, this file only reports
 *    direction.
 *  - Single click SELECTS a cell (ring); ⌘C on a selected cell copies its
 *    display text. Double-click edits, as before.
 *
 * Forced entry into edit mode arrives as the `forceEdit` prop and is
 * honoured via a KEYED REMOUNT in the parent (the key embeds the flag), so
 * the draft is seeded in the useState initializer — no state-mirroring
 * effect, which the React Compiler rejects and which cost a data-loss bug
 * in this file's first draft.
 */

import { memo, useCallback, useState } from "react";
import { Expand } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  cellToText,
  type CellValue,
  type DataColumn,
  type DataRow,
  type RelationLinkRef,
} from "@/lib/domain/data";
import { DEFAULT_COLUMN_WIDTH } from "./DataColumnHeader";

/** Types whose cells open a text input in place. Everything else edits in peek. */
export const INLINE_EDITABLE_TYPES: ReadonlySet<string> = new Set([
  "text",
  "longText",
  "number",
  "date",
  "url",
  "email",
  "phone",
]);

interface DataGridRowProps {
  row: DataRow;
  columns: DataColumn[];
  height: number;
  selected: boolean;
  editable: boolean;
  /** Column key currently forced into edit mode in THIS row, if any. */
  editColumnKey: string | null;
  /** Column key currently selected (ring + ⌘C source) in THIS row, if any. */
  selectedColumnKey: string | null;
  onToggleSelect: (rowId: string) => void;
  onCommitCell: (rowId: string, columnKey: string, value: unknown) => void;
  onSelectCell: (rowId: string, columnKey: string) => void;
  /** Open this row in the peek panel. */
  onOpenRow: (rowId: string) => void;
  /** Tab/Shift+Tab out of an editing cell. */
  onAdvance: (rowId: string, columnKey: string, dir: 1 | -1) => void;
  /** Enter/Escape ended an edit — the parent clears any forced target. */
  onEditEnd: () => void;
}

function DataGridRowImpl({
  row,
  columns,
  height,
  selected,
  editable,
  editColumnKey,
  selectedColumnKey,
  onToggleSelect,
  onCommitCell,
  onSelectCell,
  onOpenRow,
  onAdvance,
  onEditEnd,
}: DataGridRowProps) {
  return (
    <div
      className={cn(
        "group flex border-b border-border/40",
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
      {/* Peek affordance: reserved width so cells stay aligned with the
          header's matching spacer; visible on row hover. */}
      <div className="flex w-6 shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={() => onOpenRow(row.id)}
          title="Open row"
          aria-label="Open row"
          className={cn(
            "rounded p-0.5 text-muted-foreground opacity-0",
            "hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100"
          )}
        >
          <Expand className="h-3 w-3" />
        </button>
      </div>
      {columns.map((column) => {
        const forceEdit = editable && editColumnKey === column.key;
        return (
          <DataCell
            // The flag lives in the key so flipping it REMOUNTS the cell —
            // the draft seeds in the initializer instead of an effect.
            key={`${column.id}:${forceEdit ? "e" : "v"}`}
            column={column}
            rowId={row.id}
            value={row.data[column.key]}
            links={row.links?.[column.id]}
            editable={editable}
            forceEdit={forceEdit}
            cellSelected={selectedColumnKey === column.key}
            onCommit={onCommitCell}
            onSelect={onSelectCell}
            onAdvance={onAdvance}
            onEditEnd={onEditEnd}
          />
        );
      })}
    </div>
  );
}

export const DataGridRow = memo(DataGridRowImpl);

// ── Cell ─────────────────────────────────────────────────────────────────

interface DataCellProps {
  column: DataColumn;
  rowId: string;
  value: CellValue | undefined;
  /** Hydrated relation targets, when this is a relation column. */
  links?: RelationLinkRef[];
  editable: boolean;
  forceEdit: boolean;
  cellSelected: boolean;
  onCommit: (rowId: string, columnKey: string, value: unknown) => void;
  onSelect: (rowId: string, columnKey: string) => void;
  onAdvance: (rowId: string, columnKey: string, dir: 1 | -1) => void;
  onEditEnd: () => void;
}

function DataCell({
  column,
  rowId,
  value,
  links,
  editable,
  forceEdit,
  cellSelected,
  onCommit,
  onSelect,
  onAdvance,
  onEditEnd,
}: DataCellProps) {
  const canInlineEdit = editable && INLINE_EDITABLE_TYPES.has(column.type);

  /**
   * The draft exists ONLY while editing; `null` = view mode. Seeded from
   * `forceEdit` in the initializer — the keyed remount above makes that
   * sound. Holding a draft mirrored from `value` would need a sync effect,
   * which is both a compiler error and a real data-loss hazard when a poll
   * lands mid-typing.
   */
  const [draft, setDraft] = useState<string | null>(() =>
    forceEdit && canInlineEdit ? (value === undefined ? "" : String(value)) : null
  );
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

  // Checkboxes have no edit mode — a click IS the commit. The wrapper click
  // still selects, so ⌘C works on them too.
  if (column.type === "checkbox") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center border-r border-border/40 px-3",
          cellSelected && "ring-1 ring-inset ring-primary"
        )}
        style={{ width: DEFAULT_COLUMN_WIDTH }}
        onClick={() => onSelect(rowId, column.key)}
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

  // Relation cells render their hydrated targets as chips — read-only in
  // the grid, edited from the peek. A restricted target shows a redacted
  // pill, never a title (plan V1-3).
  if (column.type === "relation") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 overflow-hidden border-r border-border/40 px-2 text-xs",
          cellSelected && "ring-1 ring-inset ring-primary"
        )}
        style={{ width: DEFAULT_COLUMN_WIDTH }}
        onClick={() => onSelect(rowId, column.key)}
      >
        {(links ?? []).map((link) => (
          <span
            key={link.linkId}
            className={cn(
              "truncate rounded-full px-2 py-0.5 text-[11px]",
              link.restricted
                ? "bg-muted italic text-muted-foreground"
                : "bg-primary/10 text-primary"
            )}
            title={link.restricted ? "Restricted" : link.title}
          >
            {link.restricted ? "Restricted" : link.title}
          </span>
        ))}
      </div>
    );
  }

  const isSelectLike =
    column.type === "select" ||
    column.type === "status" ||
    column.type === "multiSelect";

  if (editing && canInlineEdit) {
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
              onEditEnd();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
              onEditEnd();
            } else if (e.key === "Tab") {
              // Commit, then hand the direction up — the parent knows the
              // column geometry and picks the adjacent editable cell.
              e.preventDefault();
              commit();
              onAdvance(rowId, column.key, e.shiftKey ? -1 : 1);
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
        canInlineEdit && "cursor-text",
        column.type === "number" && "justify-end font-mono tabular-nums",
        cellSelected && "ring-1 ring-inset ring-primary"
      )}
      style={{ width: DEFAULT_COLUMN_WIDTH }}
      onClick={() => onSelect(rowId, column.key)}
      onDoubleClick={() => {
        if (canInlineEdit && !isSelectLike) {
          onEditEnd();
          beginEdit();
        }
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
