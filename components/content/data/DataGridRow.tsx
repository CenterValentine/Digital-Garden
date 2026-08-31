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
import {
  Check,
  Expand,
  Flag,
  Heart,
  Star,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  cellToDisplayText,
  type CellValue,
  type ContentRef,
  type DataColumn,
  type DataRow,
  type PersonRef,
  type RelationLinkRef,
} from "@/lib/domain/data";
import { DEFAULT_COLUMN_WIDTH } from "./DataColumnHeader";
import { PanelPortal } from "./PanelPortal";

/** Checkbox display variants (config.checkDisplay). Filled when checked. */
const CHECK_ICONS: Record<string, { icon: LucideIcon; fillable: boolean }> = {
  check: { icon: Check, fillable: false },
  star: { icon: Star, fillable: true },
  heart: { icon: Heart, fillable: true },
  flag: { icon: Flag, fillable: true },
  thumbsUp: { icon: ThumbsUp, fillable: false },
};

const CHECK_COLOR_CLASS: Record<string, string> = {
  default: "text-foreground",
  blue: "text-blue-500",
  green: "text-emerald-500",
  amber: "text-amber-500",
  red: "text-red-500",
  purple: "text-purple-500",
};

/**
 * What the edit draft seeds from. Stored datetimes are UTC ISO; a
 * `datetime-local` input needs local "YYYY-MM-DDTHH:mm" (the encoder
 * parses that back as local time on commit). Shared with DataRowFields
 * so the grid and the peek seed identically.
 */
export function editDraftFor(
  column: DataColumn,
  value: CellValue | undefined
): string {
  if (value === undefined) return "";
  if (
    column.type === "date" &&
    column.config.includeTime &&
    typeof value === "string"
  ) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return String(value);
}

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
  /** Effective column widths keyed by column id (view prefs + live drag).
   * Memoized by the parent so this memo()'d row only re-renders on change. */
  widths?: Record<string, number>;
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
  /** Open this row in the peek panel — optionally focused on one column,
   * which auto-opens that relation's link picker (no second click). */
  onOpenRow: (rowId: string, focusColumnId?: string) => void;
  /** Open a linked ContentNode in a workspace tab (owner requirement). */
  onOpenContent: (ref: ContentRef) => void;
  /** Tab/Shift+Tab out of an editing cell. */
  onAdvance: (rowId: string, columnKey: string, dir: 1 | -1) => void;
  /** Enter/Escape ended an edit — the parent clears any forced target. */
  onEditEnd: () => void;
}

function DataGridRowImpl({
  row,
  columns,
  widths,
  height,
  selected,
  editable,
  editColumnKey,
  selectedColumnKey,
  onToggleSelect,
  onCommitCell,
  onSelectCell,
  onOpenRow,
  onOpenContent,
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
            width={widths?.[column.id] ?? DEFAULT_COLUMN_WIDTH}
            rowId={row.id}
            value={row.data[column.key]}
            links={row.links?.[column.id]}
            contentRefs={row.contentRefs?.[column.id]}
            personRef={row.personRefs?.[column.id]}
            derivedValue={row.derived?.[column.id]}
            editable={editable}
            forceEdit={forceEdit}
            cellSelected={selectedColumnKey === column.key}
            onCommit={onCommitCell}
            onSelect={onSelectCell}
            onOpenRow={onOpenRow}
            onOpenContent={onOpenContent}
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
  width: number;
  rowId: string;
  value: CellValue | undefined;
  /** Hydrated relation targets, when this is a relation column. */
  links?: RelationLinkRef[];
  /** Hydrated node targets, when this is a contentLink column. */
  contentRefs?: ContentRef[];
  /** Hydrated person, when this is a person column. */
  personRef?: PersonRef;
  /** Server-computed lookup/rollup value, when this is a derived column. */
  derivedValue?: string | number;
  editable: boolean;
  forceEdit: boolean;
  cellSelected: boolean;
  onCommit: (rowId: string, columnKey: string, value: unknown) => void;
  onSelect: (rowId: string, columnKey: string) => void;
  onOpenRow: (rowId: string, focusColumnId?: string) => void;
  onOpenContent: (ref: ContentRef) => void;
  onAdvance: (rowId: string, columnKey: string, dir: 1 | -1) => void;
  onEditEnd: () => void;
}

function DataCell({
  column,
  width,
  rowId,
  value,
  links,
  contentRefs,
  personRef,
  derivedValue,
  editable,
  forceEdit,
  cellSelected,
  onCommit,
  onSelect,
  onOpenRow,
  onOpenContent,
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
    forceEdit && canInlineEdit ? editDraftFor(column, value) : null
  );
  const editing = draft !== null;

  const beginEdit = useCallback(() => {
    setDraft(editDraftFor(column, value));
  }, [column, value]);

  const commit = useCallback(() => {
    if (draft === null) return;
    const next = draft;
    setDraft(null);
    // Compare against the same representation the draft was seeded from —
    // for datetime-local that's the LOCAL string, not the stored UTC ISO,
    // so an untouched editor never fires a spurious write.
    if (next === editDraftFor(column, value)) return;
    onCommit(rowId, column.key, next === "" ? undefined : next);
  }, [draft, column, value, onCommit, rowId]);

  const cancel = useCallback(() => setDraft(null), []);

  // Checkboxes have no edit mode — a click IS the commit. The wrapper click
  // still selects, so ⌘C works on them too. Display variants (icon, t/f
  // text) are cosmetic: every mode stores the same boolean, so filters and
  // sorts never notice which one is configured.
  if (column.type === "checkbox") {
    const checked = value === true;
    const displayMode = column.config.checkDisplay ?? "checkbox";
    const colorClass =
      CHECK_COLOR_CLASS[column.config.checkColor ?? "default"] ??
      CHECK_COLOR_CLASS.default;
    const iconEntry = CHECK_ICONS[displayMode];
    return (
      <div
        className={cn(
          "flex shrink-0 items-center border-r border-border/40 px-3",
          cellSelected && "ring-1 ring-inset ring-primary"
        )}
        style={{ width }}
        onClick={() => onSelect(rowId, column.key)}
      >
        {displayMode === "text" ? (
          <button
            type="button"
            disabled={!editable}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(rowId, column.key);
              if (editable) onCommit(rowId, column.key, !checked);
            }}
            aria-pressed={checked}
            aria-label={column.name}
            className={cn(
              "rounded px-1 font-mono text-xs tabular-nums",
              checked ? colorClass : "text-muted-foreground/60",
              editable && "hover:bg-muted"
            )}
          >
            {checked ? "true" : "false"}
          </button>
        ) : iconEntry ? (
          <button
            type="button"
            disabled={!editable}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(rowId, column.key);
              if (editable) onCommit(rowId, column.key, !checked);
            }}
            aria-pressed={checked}
            aria-label={column.name}
            className={cn("rounded p-0.5", editable && "hover:bg-muted")}
          >
            <iconEntry.icon
              className={cn(
                "h-3.5 w-3.5",
                checked ? colorClass : "text-muted-foreground/40"
              )}
              fill={
                checked && iconEntry.fillable ? "currentColor" : "none"
              }
            />
          </button>
        ) : (
          <input
            type="checkbox"
            checked={checked}
            disabled={!editable}
            onChange={(e) => onCommit(rowId, column.key, e.target.checked)}
            aria-label={column.name}
            className={cn("h-3.5 w-3.5 accent-current", colorClass)}
          />
        )}
      </div>
    );
  }

  // Relation cells render their hydrated targets as chips — LINKED and
  // edited from the row peek, which double-click opens. An empty editable
  // cell says so instead of rendering as nothing: "I linked the tables but
  // can't see how to connect rows" was the owner hitting exactly that
  // silence (2026-08-26). A restricted target shows a redacted pill, never
  // a title (plan V1-3).
  if (column.type === "relation") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 overflow-hidden border-r border-border/40 px-2 text-xs",
          cellSelected && "ring-1 ring-inset ring-primary",
          editable && "cursor-pointer"
        )}
        style={{ width }}
        onClick={() => onSelect(rowId, column.key)}
        onDoubleClick={editable ? () => onOpenRow(rowId) : undefined}
        title={editable ? "Double-click to link rows" : undefined}
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
        {/* The + rides along whether the cell is empty or populated —
            linking more rows is as normal as linking the first one, and it
            is a real BUTTON straight into the peek, not a hint that only
            looked like one (owner, 2026-08-26). */}
        {editable && (
          <button
            type="button"
            aria-label="Link rows"
            title="Link rows"
            onClick={(e) => {
              e.stopPropagation();
              // Straight into THIS relation's picker — the + used to open
              // the peek and then demand a second + (owner, 2026-08-26).
              onOpenRow(rowId, column.id);
            }}
            className="shrink-0 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            +
          </button>
        )}
      </div>
    );
  }

  // contentLink cells: chips are the REAL nodes — clicking one opens it in
  // a workspace tab (owner requirement, plan Phase 4); the + goes to the
  // peek's picker. Restricted/dangling targets show a redacted pill that
  // opens nothing (plan V1-3/G12).
  if (column.type === "contentLink" || column.type === "file") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 overflow-hidden border-r border-border/40 px-2 text-xs",
          cellSelected && "ring-1 ring-inset ring-primary"
        )}
        style={{ width }}
        onClick={() => onSelect(rowId, column.key)}
      >
        {(contentRefs ?? []).map((ref) =>
          ref.restricted ? (
            <span
              key={ref.id}
              className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] italic text-muted-foreground"
              title="Restricted"
            >
              Restricted
            </span>
          ) : (
            <button
              key={ref.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenContent(ref);
              }}
              className="truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20"
              title={`Open "${ref.title}"`}
            >
              {ref.title}
            </button>
          )
        )}
        {editable && (
          <button
            type="button"
            aria-label="Link content"
            title="Link content"
            onClick={(e) => {
              e.stopPropagation();
              onOpenRow(rowId, column.id);
            }}
            className="shrink-0 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            +
          </button>
        )}
      </div>
    );
  }

  // Person cells show the hydrated display name; editing lives in the peek
  // (a picker over your People). Restricted = the person is not yours to
  // see, or was deleted (plan V1-3).
  if (column.type === "person") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center overflow-hidden border-r border-border/40 px-2 text-xs",
          cellSelected && "ring-1 ring-inset ring-primary"
        )}
        style={{ width }}
        onClick={() => onSelect(rowId, column.key)}
        onDoubleClick={editable ? () => onOpenRow(rowId, column.id) : undefined}
        title={editable ? "Double-click to assign" : undefined}
      >
        {personRef && (
          <span
            className={cn(
              "truncate rounded-full px-2 py-0.5 text-[11px]",
              personRef.restricted
                ? "bg-muted italic text-muted-foreground"
                : "bg-muted text-foreground"
            )}
          >
            {personRef.restricted ? "Restricted" : personRef.name}
          </span>
        )}
        {!personRef && editable && (
          <button
            type="button"
            aria-label="Assign person"
            title="Assign person"
            onClick={(e) => {
              e.stopPropagation();
              onOpenRow(rowId, column.id);
            }}
            className="shrink-0 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            +
          </button>
        )}
      </div>
    );
  }

  // Derived cells show the server-computed value — nothing is stored
  // (plan D6), nothing is editable, and the muted tone says so.
  if (column.type === "lookup" || column.type === "rollup") {
    const text = derivedValue === undefined ? "" : String(derivedValue);
    return (
      <div
        className={cn(
          "flex shrink-0 items-center overflow-hidden border-r border-border/40 px-3 text-xs text-muted-foreground",
          column.type === "rollup" && "justify-end font-mono tabular-nums",
          cellSelected && "ring-1 ring-inset ring-primary"
        )}
        style={{ width }}
        onClick={() => onSelect(rowId, column.key)}
        title={text || undefined}
      >
        <span className="truncate">{text}</span>
      </div>
    );
  }

  const isSelectLike =
    column.type === "select" ||
    column.type === "status" ||
    column.type === "multiSelect";

  // Long text edits in an anchored popover, not the 36px inline input —
  // Enter makes a NEWLINE here (⌘Enter/click-away saves, Esc cancels),
  // which is the felt difference between the two text types. PanelPortal's
  // outside-click dismiss doubles as blur-commit.
  if (editing && canInlineEdit && column.type === "longText") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center overflow-hidden border-r border-border/40 px-3 text-xs",
          "ring-2 ring-inset ring-primary"
        )}
        style={{ width }}
      >
        <span className="truncate text-muted-foreground">{draft ?? ""}</span>
        <PanelPortal
          open
          onDismiss={() => {
            commit();
            onEditEnd();
          }}
          className="w-80"
        >
          <textarea
            autoFocus
            value={draft ?? ""}
            maxLength={column.config.maxLength}
            rows={6}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
                onEditEnd();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
                onEditEnd();
              } else if (e.key === "Tab") {
                e.preventDefault();
                commit();
                onAdvance(rowId, column.key, e.shiftKey ? -1 : 1);
              }
            }}
            className={cn(
              "w-full resize-y rounded-md border border-border bg-background px-2 py-1.5",
              "text-xs outline-none focus:ring-2 focus:ring-primary"
            )}
            aria-label={column.name}
          />
          <p className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Enter = new line · ⌘Enter saves · Esc cancels</span>
            {column.config.maxLength ? (
              <span className="font-mono tabular-nums">
                {(draft ?? "").length}/{column.config.maxLength}
              </span>
            ) : null}
          </p>
        </PanelPortal>
      </div>
    );
  }

  if (editing && canInlineEdit) {
    return (
      <div
        className="shrink-0 border-r border-border/40"
        style={{ width }}
      >
        <input
          autoFocus
          value={draft ?? ""}
          maxLength={column.type === "text" ? column.config.maxLength : undefined}
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
          // Dates get the native picker — the calendar affordance — with
          // datetime-local when the column's time component is meaningful.
          type={
            column.type === "number"
              ? "number"
              : column.type === "date"
                ? column.config.includeTime
                  ? "datetime-local"
                  : "date"
                : "text"
          }
        />
      </div>
    );
  }

  // Formatted for display; edits and ⌘C copy still use the raw value.
  const display = cellToDisplayText(column, value);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center overflow-hidden border-r border-border/40 px-3 text-xs",
        canInlineEdit && "cursor-text",
        column.type === "number" && "justify-end font-mono tabular-nums",
        cellSelected && "ring-1 ring-inset ring-primary"
      )}
      style={{ width }}
      onClick={() => {
        onSelect(rowId, column.key);
        // First click on an EMPTY editable cell goes straight to editing —
        // there is nothing to select-and-look-at, so the extra step was pure
        // friction (owner, 2026-08-27). Populated cells keep click=select /
        // double-click=edit, and the keyboard path is untouched BY
        // CONSTRUCTION: Tab moves selection through the window keydown
        // handler, which never routes through this click handler, so
        // tabbing across blank cells still only selects (Enter edits).
        if (canInlineEdit && !isSelectLike && value === undefined) {
          onEditEnd();
          beginEdit();
        }
      }}
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
      {/* Multi-line marker: the 36px row shows one line (fixed-height
          windowing); the ¶ says there's more behind the truncation. */}
      {column.type === "longText" &&
        typeof value === "string" &&
        value.includes("\n") && (
          <span
            aria-hidden="true"
            className="ml-1 shrink-0 text-[10px] text-muted-foreground/70"
          >
            ¶
          </span>
        )}
    </div>
  );
}
