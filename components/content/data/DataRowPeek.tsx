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
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  cellToText,
  sortStatusOptions,
  type CellValue,
  type DataColumn,
  type DataRow,
} from "@/lib/domain/data";

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-2 py-1.5",
  "text-xs outline-none focus:ring-2 focus:ring-primary"
);

interface DataRowPeekProps {
  row: DataRow;
  columns: DataColumn[];
  editable: boolean;
  index: number;
  total: number;
  onCommitCell: (rowId: string, columnKey: string, value: unknown) => void;
  onNavigate: (dir: 1 | -1) => void;
  onClose: () => void;
}

export function DataRowPeek({
  row,
  columns,
  editable,
  index,
  total,
  onCommitCell,
  onNavigate,
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
  const title = primary
    ? cellToText(primary, row.data[primary.key]) || "Untitled"
    : "Untitled";

  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-20 flex w-80 flex-col",
        "border-l border-border bg-background shadow-xl"
      )}
      aria-label={`Row: ${title}`}
    >
      <header className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Row {index + 1} of {total}
          {!row.contentId && " · not a page"}
        </span>
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

      <h3 className="truncate px-3 pb-1 pt-3 text-base font-semibold" title={title}>
        {title}
      </h3>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {columns.map((column) => (
          <PeekField
            key={`${row.id}:${column.id}`}
            column={column}
            value={row.data[column.key]}
            editable={editable}
            onCommit={(v) => onCommitCell(row.id, column.key, v)}
          />
        ))}

        <p className="mt-4 rounded-md border border-dashed border-border p-2.5 text-[11px] leading-snug text-muted-foreground">
          {row.contentId
            ? "This row has its own page."
            : "This row is not a page yet — opening rows as full pages with a note body arrives with promotion (Phase 5)."}
        </p>
      </div>
    </aside>
  );
}

// ── Fields ───────────────────────────────────────────────────────────────

interface PeekFieldProps {
  column: DataColumn;
  value: CellValue | undefined;
  editable: boolean;
  onCommit: (value: unknown) => void;
}

function PeekField({ column, value, editable, onCommit }: PeekFieldProps) {
  return (
    <div className="border-b border-border/40 py-2.5 last:border-b-0">
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {column.name}
      </label>
      <FieldInput
        column={column}
        value={value}
        editable={editable}
        onCommit={onCommit}
      />
      {/* Inline help (plan D9) — the main reason descriptions exist. */}
      {column.description && (
        <p className="mt-1 text-[10px] italic leading-snug text-muted-foreground">
          {column.description}
        </p>
      )}
    </div>
  );
}

function FieldInput({ column, value, editable, onCommit }: PeekFieldProps) {
  const asText = value === undefined ? "" : String(value);

  const textCommit = (raw: string) => {
    const next = raw.trim() === "" ? undefined : raw;
    if ((next ?? "") === asText) return;
    onCommit(next);
  };

  switch (column.type) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={value === true}
          disabled={!editable}
          onChange={(e) => onCommit(e.target.checked)}
          aria-label={column.name}
          className="h-4 w-4 accent-current"
        />
      );

    case "select":
    case "status": {
      const options =
        column.type === "status"
          ? sortStatusOptions(column.config.options ?? [])
          : (column.config.options ?? []);
      return (
        <select
          value={typeof value === "string" ? value : ""}
          disabled={!editable}
          onChange={(e) => onCommit(e.target.value || undefined)}
          className={fieldClass}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    case "multiSelect": {
      const chosen = new Set(Array.isArray(value) ? value : []);
      const options = column.config.options ?? [];
      if (options.length === 0) {
        return <p className="text-xs text-muted-foreground">No options yet</p>;
      }
      return (
        <div className="flex flex-col gap-1">
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={chosen.has(o.id)}
                disabled={!editable}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(o.id);
                  else next.delete(o.id);
                  // Preserve option-definition order — cell arrays are
                  // order-significant (plan B8c).
                  onCommit(
                    options.filter((x) => next.has(x.id)).map((x) => x.id)
                  );
                }}
                className="h-3.5 w-3.5 accent-current"
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }

    case "longText":
      return (
        <textarea
          defaultValue={asText}
          disabled={!editable}
          rows={3}
          onBlur={(e) => textCommit(e.target.value)}
          className={cn(fieldClass, "resize-none")}
        />
      );

    case "text":
    case "number":
    case "date":
    case "url":
    case "email":
    case "phone":
      return (
        <input
          type={
            column.type === "number"
              ? "number"
              : column.type === "date"
                ? "date"
                : "text"
          }
          defaultValue={asText}
          disabled={!editable}
          onBlur={(e) => textCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              (e.target as HTMLInputElement).value = asText;
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={fieldClass}
        />
      );

    default:
      // relation / contentLink / person / file — editors arrive in Phase 4.
      return (
        <p className="text-xs text-muted-foreground">
          {cellToText(column, value) || "—"}
        </p>
      );
  }
}
