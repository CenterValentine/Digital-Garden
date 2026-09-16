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

import { memo, useCallback, useEffect, useState } from "react";
import {
  Check,
  Expand,
  ExternalLink,
  Flag,
  Heart,
  Plus,
  Square,
  Star,
  ThumbsUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  cellToDisplayText,
  hasOpenFence,
  optionMatchKey,
  sortStatusOptions,
  splitDelimited,
  titleCaseLabel,
  type CellValue,
  type ContentRef,
  type DataColumn,
  type DataRow,
  type PersonRef,
  type RelationLinkRef,
} from "@/lib/domain/data";
import { DEFAULT_COLUMN_WIDTH } from "./DataColumnHeader";
import { PanelPortal } from "./PanelPortal";
import { dragHasFiles } from "./file-upload";
import { ImageLightbox, imageDownloadUrl } from "./ImageLightbox";

/** Checkbox display variants (config.checkDisplay). Filled when checked.
 * The ✓ variant's UNCHECKED state is an empty box, not a faded check —
 * a ghost checkmark reads as "checked but disabled" (owner, 2026-08-31);
 * the shaped variants (star/heart/…) keep their own faded outline, where
 * the silhouette itself says what clicking will do. */
const CHECK_ICONS: Record<
  string,
  { icon: LucideIcon; uncheckedIcon?: LucideIcon; fillable: boolean }
> = {
  check: { icon: Check, uncheckedIcon: Square, fillable: false },
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
/**
 * Chip-list overflow accounting (owner report, 2026-09-15).
 *
 * A list cell is `display:flex` with `overflow-hidden`, and its chips carry
 * `truncate` — which sets `overflow:hidden`, which makes each chip's
 * automatic flex minimum resolve to ZERO. So N chips in a narrow cell do not
 * overflow and clip; they each shrink to a sliver, and a relation column
 * renders "O." "I." "W." instead of a truncated-but-readable list.
 *
 * The fix is two-sided: chips stop shrinking (CHIP_CLASS pins `shrink-0`
 * with a max-width so long titles still ellipsize), and the cell shows only
 * as many as actually fit, followed by a "+N" pill that opens the full list.
 *
 * The budget is computed from the column width rather than measured. A
 * ResizeObserver pass would be exact, but this runs for every cell of every
 * visible row on every width change; an arithmetic estimate is stable,
 * synchronous, and cannot cause a layout-measure feedback loop. Being off by
 * one chip costs a "+N" that reads 3 instead of 2 — the list is reachable
 * either way.
 */
const CHIP_GAP_PX = 4; // gap-1
const CELL_PAD_PX = 16; // px-2, both sides
const ADD_BTN_PX = 22; // the dashed "+" that rides along on editable cells
const MORE_PILL_PX = 34; // the "+N" pill itself
const CHIP_PAD_PX = 16; // px-2 inside a chip
const CHAR_PX = 6.4; // ~11px system font, average advance
const CHIP_MAX_PX = 144; // max-w-[9rem]

/** Shared chip skin: never shrinks, ellipsizes past ~9rem. */
const CHIP_CLASS =
  "shrink-0 max-w-[9rem] truncate rounded-full px-2 py-0.5 text-[11px]";

/**
 * A chip's rendered width, estimated from its LABEL.
 *
 * The first cut used one flat minimum for every chip, which folded far too
 * eagerly: a 180px column showed a single "Hello" and a "+4" because the
 * budget assumed every chip was as wide as the widest plausible one (owner,
 * 2026-09-16). Per-label estimation costs one multiply and gets two or three
 * short tags into the same space.
 */
function estimateChipPx(label: string): number {
  return Math.min(CHIP_MAX_PX, CHIP_PAD_PX + Math.max(1, label.length) * CHAR_PX);
}

/**
 * How many of `labels` to render, and how many fold behind the pill.
 * `hidden: 0` whenever everything fits — the pill is only drawn when it is
 * actually standing in for something.
 */
function chipBudget(
  width: number,
  labels: string[],
  opts: { hasAddButton: boolean; fixedChipPx?: number }
): { shown: number; hidden: number } {
  const total = labels.length;
  if (total <= 0) return { shown: 0, hidden: 0 };
  const widthOf = (label: string) =>
    opts.fixedChipPx ?? estimateChipPx(label);

  const available =
    (width || DEFAULT_COLUMN_WIDTH) -
    CELL_PAD_PX -
    (opts.hasAddButton ? ADD_BTN_PX + CHIP_GAP_PX : 0);

  // First pass: how many fit with no pill at all?
  let used = 0;
  let fits = 0;
  for (const label of labels) {
    const next = used + (fits > 0 ? CHIP_GAP_PX : 0) + widthOf(label);
    if (next > available) break;
    used = next;
    fits++;
  }
  if (fits >= total) return { shown: total, hidden: 0 };

  // Something folds, so the pill now costs space too. Re-measure against the
  // smaller budget, but always show at least one chip: a bare count with no
  // sample of the contents is worse than a slightly crowded cell.
  const withPillBudget = available - MORE_PILL_PX - CHIP_GAP_PX;
  used = 0;
  let shown = 0;
  for (const label of labels) {
    const next = used + (shown > 0 ? CHIP_GAP_PX : 0) + widthOf(label);
    if (next > withPillBudget) break;
    used = next;
    shown++;
  }
  shown = Math.max(1, Math.min(total - 1, shown));
  return { shown, hidden: total - shown };
}

/**
 * The "+N" affordance. Deliberately a real button into the cell's OWN
 * expand path (the row peek for relations/links, the options panel for
 * multiSelect) rather than a nested horizontal scroller: the grid already
 * scrolls on that axis, and a same-axis scroll region inside it steals
 * trackpad momentum and shows no affordance at rest.
 */
function MoreChip({
  count,
  label,
  onClick,
}: {
  count: number;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
    >
      +{count}
    </button>
  );
}

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
  /** Owner-only: create a select/status option from the cell picker. */
  onCreateOption?: (
    column: DataColumn,
    label: string
  ) => Promise<{ id: string; label: string } | null>;
  /** Writers: upload dropped/pasted OS files into a File cell. */
  onUploadFiles?: (
    rowId: string,
    column: DataColumn,
    files: FileList
  ) => void | Promise<void>;
  /** Cache-bust token for image streams after an in-place overwrite. */
  imageVersion?: number;
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
  onCreateOption,
  onUploadFiles,
  imageVersion,
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
            onCreateOption={onCreateOption}
            onUploadFiles={onUploadFiles}
            imageVersion={imageVersion}
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
  /** Owner-only: create a select/status option from the cell picker. */
  onCreateOption?: (
    column: DataColumn,
    label: string
  ) => Promise<{ id: string; label: string } | null>;
  /** Writers: upload dropped OS files into a File cell. */
  onUploadFiles?: (
    rowId: string,
    column: DataColumn,
    files: FileList
  ) => void | Promise<void>;
  /** Cache-bust token for image streams after an in-place overwrite. */
  imageVersion?: number;
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
  onCreateOption,
  onUploadFiles,
  imageVersion,
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

  // Select-like cells edit through an anchored option picker instead of a
  // text draft. Seeded from forceEdit the same way (keyed remount), so
  // Enter-on-selected opens it too.
  // The "+N" expansion: this cell's values, NOT the column vocabulary.
  const [valuesOpen, setValuesOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(
    () =>
      forceEdit &&
      editable &&
      (column.type === "select" ||
        column.type === "status" ||
        column.type === "multiSelect")
  );

  /** File cells double as drop targets for OS files. */
  const [fileDragOver, setFileDragOver] = useState(false);
  /** Images columns: the thumbnail currently zoomed, if any. */
  const [lightbox, setLightbox] = useState<ContentRef | null>(null);

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
            {(() => {
              const Icon = checked
                ? iconEntry.icon
                : (iconEntry.uncheckedIcon ?? iconEntry.icon);
              return (
                <Icon
                  className={cn(
                    "h-3.5 w-3.5",
                    checked ? colorClass : "text-muted-foreground/40"
                  )}
                  fill={
                    checked && iconEntry.fillable ? "currentColor" : "none"
                  }
                />
              );
            })()}
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
        {(() => {
          const all = links ?? [];
          const { shown, hidden } = chipBudget(
            width,
            all.map((l) => (l.restricted ? "Restricted" : l.title)),
            { hasAddButton: editable }
          );
          return (
            <>
              {all.slice(0, shown).map((link) => (
                <span
                  key={link.linkId}
                  className={cn(
                    CHIP_CLASS,
                    link.restricted
                      ? "bg-muted italic text-muted-foreground"
                      : "bg-primary/10 text-primary"
                  )}
                  title={link.restricted ? "Restricted" : link.title}
                >
                  {link.restricted ? "Restricted" : link.title}
                </span>
              ))}
              {hidden > 0 && (
                <MoreChip
                  count={hidden}
                  label={`Show all ${all.length} linked rows`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenRow(rowId, column.id);
                  }}
                />
              )}
            </>
          );
        })()}
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
    const fileDroppable =
      column.type === "file" && editable && Boolean(onUploadFiles);
    return (
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 overflow-hidden border-r border-border/40 px-2 text-xs",
          cellSelected && "ring-1 ring-inset ring-primary",
          fileDragOver && "bg-primary/10 ring-2 ring-inset ring-primary/60"
        )}
        style={{ width }}
        onClick={() => onSelect(rowId, column.key)}
        // OS-file drags only (dragHasFiles) — the app's own column/board
        // drags carry text data and never light this up.
        onDragOver={
          fileDroppable
            ? (e) => {
                if (!dragHasFiles(e)) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                setFileDragOver(true);
              }
            : undefined
        }
        onDragLeave={
          fileDroppable
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setFileDragOver(false);
                }
              }
            : undefined
        }
        onDrop={
          fileDroppable
            ? (e) => {
                if (!dragHasFiles(e)) return;
                e.preventDefault();
                e.stopPropagation();
                setFileDragOver(false);
                onSelect(rowId, column.key);
                void onUploadFiles?.(rowId, column, e.dataTransfer.files);
              }
            : undefined
        }
      >
        {(() => {
          const all = contentRefs ?? [];
          // Image chips are 28px thumbnails, not ~64px text pills, so the
          // budget is told the real chip size — an Images column fits four
          // or five where a link column fits two.
          const { shown, hidden } = chipBudget(
            width,
            all.map((r) => (r.restricted ? "Restricted" : r.title)),
            {
              hasAddButton: editable,
              // Image chips are 28px thumbnails, not text pills, so their
              // width does not follow the label at all.
              fixedChipPx: column.config.imageOnly ? 28 : undefined,
            }
          );
          return (
            <>
              {all.slice(0, shown).map((ref) =>
                ref.restricted ? (
                  <span
                    key={ref.id}
                    className={cn(
                      CHIP_CLASS,
                      "bg-muted italic text-muted-foreground"
                    )}
                    title="Restricted"
                  >
                    Restricted
                  </span>
                ) : column.config.imageOnly ? (
                  // Images column: thumbnail, click to zoom. Hydration's
                  // thumbnail when processed, else the full image streams.
                  <button
                    key={ref.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightbox(ref);
                    }}
                    title={`View "${ref.title}"`}
                    className="shrink-0 overflow-hidden rounded border border-border/60 hover:ring-2 hover:ring-primary/50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny authed thumbnail; next/image adds nothing */}
                    <img
                      src={
                        ref.file?.thumbnailUrl ??
                        imageDownloadUrl(ref.id, imageVersion)
                      }
                      alt={ref.title}
                      className="h-7 w-7 object-cover"
                    />
                  </button>
                ) : (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenContent(ref);
                    }}
                    className={cn(
                      CHIP_CLASS,
                      "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                    title={`Open "${ref.title}"`}
                  >
                    {ref.title}
                  </button>
                )
              )}
              {hidden > 0 && (
                <MoreChip
                  count={hidden}
                  label={
                    column.config.imageOnly
                      ? `Show all ${all.length} images`
                      : `Show all ${all.length} linked items`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenRow(rowId, column.id);
                  }}
                />
              )}
            </>
          );
        })()}
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
        {lightbox && (
          <ImageLightbox
            contentId={lightbox.id}
            title={lightbox.title}
            version={imageVersion}
            onClose={() => setLightbox(null)}
          />
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

  // Select-like cells: pill display + a dashed "+" (same affordance the
  // relation cells teach) opening an anchored option picker — pick, clear,
  // and (owners) create options without leaving the grid. Was: no editor
  // at all, which read as "these cells are dead" (owner, 2026-08-31).
  if (isSelectLike) {
    const display = cellToDisplayText(column, value);
    const close = () => {
      setOptionsOpen(false);
      onEditEnd();
    };
    return (
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 overflow-hidden border-r border-border/40 px-2 text-xs",
          editable && "cursor-pointer",
          cellSelected && "ring-1 ring-inset ring-primary"
        )}
        style={{ width }}
        onClick={() => onSelect(rowId, column.key)}
        onDoubleClick={editable ? () => setOptionsOpen(true) : undefined}
        title={display || (editable ? "Double-click to choose" : undefined)}
      >
        {column.type === "multiSelect" && Array.isArray(value)
          ? (() => {
              // One pill per chosen option, like relation chips — a single
              // joined pill read as one value (owner, 2026-08-31). Removed
              // options render nothing (their ids stay in the cell, plan
              // D3), so the budget counts RESOLVED options, not raw ids —
              // otherwise "+2" could stand for two options that no longer
              // exist and clicking through would show nothing.
              const opts = value
                .map((id) => column.config.options?.find((o) => o.id === id))
                .filter((o): o is NonNullable<typeof o> => Boolean(o));
              const { shown, hidden } = chipBudget(
                width,
                opts.map((o) => o.label),
                { hasAddButton: editable }
              );
              return (
                <>
                  {opts.slice(0, shown).map((opt) => (
                    <span
                      key={opt.id}
                      className={cn(CHIP_CLASS, "bg-muted")}
                      title={opt.label}
                    >
                      {opt.label}
                    </span>
                  ))}
                  {hidden > 0 && (
                    <MoreChip
                      count={hidden}
                      label={`Show this cell's ${opts.length} values`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(rowId, column.key);
                        setValuesOpen(true);
                      }}
                    />
                  )}
                </>
              );
            })()
          : display
            ? (
                <span className={cn(CHIP_CLASS, "bg-muted")} title={display}>
                  {display}
                </span>
              )
            : null}
        {editable && (
          <button
            type="button"
            aria-label={`Choose ${column.name}`}
            title="Choose options"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(rowId, column.key);
              setOptionsOpen(true);
            }}
            className="shrink-0 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            +
          </button>
        )}
        {optionsOpen &&
          editable &&
          (column.type === "multiSelect" && column.config.freeform ? (
            // Free-form has no vocabulary to present, so it gets the
            // type-and-pill editor instead of the checklist.
            <PanelPortal open onDismiss={close}>
              <FreeformTagsPanel
                column={column}
                value={value}
                rowId={rowId}
                onCommit={onCommit}
                onCreateOption={onCreateOption}
                onClose={close}
              />
            </PanelPortal>
          ) : (
            <PanelPortal open onDismiss={close}>
              <SelectOptionsPanel
                column={column}
                value={value}
                rowId={rowId}
                onCommit={onCommit}
                onCreateOption={onCreateOption}
                onClose={close}
              />
            </PanelPortal>
          ))}
        {valuesOpen && (
          <PanelPortal open onDismiss={() => setValuesOpen(false)}>
            <CellValuesPanel
              title={column.name}
              values={(Array.isArray(value) ? value : [])
                .map((id) => {
                  const opt = column.config.options?.find((o) => o.id === id);
                  return opt ? { id: opt.id, label: opt.label } : null;
                })
                .filter((v): v is { id: string; label: string } => Boolean(v))}
              onRemove={
                editable
                  ? (index) =>
                      onCommit(
                        rowId,
                        column.key,
                        (Array.isArray(value) ? value : []).filter(
                          (_, i) => i !== index
                        )
                      )
                  : undefined
              }
              onClose={() => setValuesOpen(false)}
            />
          </PanelPortal>
        )}
      </div>
    );
  }

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
          // URLs stay type=text: the encoder upgrades bare domains to
          // https://, and type=url's browser validation would fight that.
          type={
            column.type === "number"
              ? "number"
              : column.type === "date"
                ? column.config.includeTime
                  ? "datetime-local"
                  : "date"
                : column.type === "email"
                  ? "email"
                  : "text"
          }
          inputMode={column.type === "url" ? "url" : undefined}
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
      {/* URL cells get an open affordance — click still selects/edits, ↗
          opens. Scheme-guarded: only encoder-normalized values (http/https)
          render a link; a legacy bare "example.com" would resolve as a
          RELATIVE path. */}
      {/* (select-like cells return earlier via SelectOptionsPanel) */}
      {column.type === "url" &&
        typeof value === "string" &&
        /^https?:\/\//i.test(value) && (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Open ${value}`}
            aria-label={`Open ${value}`}
            className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
    </div>
  );
}

// ── Select-like option picker ────────────────────────────────────────────

/**
 * Values-only expansion for a "+N" click.
 *
 * The first cut opened the option CHECKLIST, which answers the wrong
 * question: the user clicked a count of what is in this cell and got the
 * column's whole vocabulary, most of it unrelated (owner, 2026-09-16). This
 * lists exactly the cell's values, with an × per row when the cell is
 * editable — reading is the point, editing is the courtesy.
 */
function CellValuesPanel({
  title,
  values,
  onRemove,
  onClose,
}: {
  title: string;
  values: Array<{ id: string; label: string; muted?: boolean }>;
  /**
   * Removal is by INDEX, not id: a column that allows duplicates holds the
   * same id more than once, and filtering by id would delete every copy
   * when the user clicked one.
   */
  onRemove?: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="min-w-[180px] max-w-[280px] rounded-lg border border-border bg-popover p-1 shadow-lg">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {values.length}
        </span>
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {values.map((v, index) => (
          <li
            key={`${v.id}-${index}`}
            className="group flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-muted"
          >
            <span
              className={cn(
                "flex-1 truncate",
                v.muted && "italic text-muted-foreground"
              )}
              title={v.label}
            >
              {v.label}
            </span>
            {onRemove && (
              <button
                type="button"
                aria-label={`Remove ${v.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClose}
        className="mt-0.5 w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted"
      >
        Close
      </button>
    </div>
  );
}

/**
 * The free-form multi-select editor: type, and each delimiter completes a
 * pill — the interaction people already know from email "To" fields.
 *
 * No checklist, because there is no vocabulary to pick from: whatever is
 * typed becomes an option (minted server-side on write, capped by
 * FREEFORM_OPTION_CAP). Quoting keeps a delimiter inside a value, and the
 * quotes are stripped from the pill — `"hello world"` is one pill reading
 * `hello world`.
 *
 * Backspace on an empty input removes the last pill, which is the other half
 * of the email-field muscle memory and the reason there is no separate
 * "delete mode".
 */
function FreeformTagsPanel({
  column,
  value,
  rowId,
  onCommit,
  onCreateOption,
  onClose,
}: {
  column: DataColumn;
  value: CellValue | undefined;
  rowId: string;
  onCommit: (rowId: string, columnKey: string, value: unknown) => void;
  onCreateOption?: (
    column: DataColumn,
    label: string
  ) => Promise<{ id: string; label: string } | null>;
  onClose: () => void;
}) {
  const options = column.config.options ?? [];
  const [items, setItems] = useState<Array<{ id: string; label: string }>>(
    () =>
      Array.isArray(value)
        ? value
            .map((id) => options.find((o) => o.id === id))
            .filter((o): o is NonNullable<typeof o> => Boolean(o))
            .map((o) => ({ id: o.id, label: o.label }))
        : []
  );
  const [draft, setDraft] = useState("");
  /**
   * A value the user just re-typed that is already in the cell.
   *
   * Duplicates are dropped — a multi-select cell is a SET, and every
   * consumer downstream assumes it (hasAny/hasAll/hasNone are set
   * operations, grouping counts each value once, digests list it once). But
   * dropping it SILENTLY makes the input look broken: you type a value,
   * press comma, and nothing happens. Flashing the pill that already holds
   * it turns a confusing non-event into an answer (owner, 2026-09-16).
   */
  const [duplicate, setDuplicate] = useState<string | null>(null);

  useEffect(() => {
    if (!duplicate) return;
    const t = window.setTimeout(() => setDuplicate(null), 1200);
    return () => window.clearTimeout(t);
  }, [duplicate]);

  const commit = useCallback(
    (next: Array<{ id: string; label: string }>) => {
      setItems(next);
      onCommit(
        rowId,
        column.key,
        next.map((i) => i.id)
      );
    },
    [onCommit, rowId, column.key]
  );

  /**
   * Absorb the draft into pills.
   *
   * The pill appears FIRST, on the keystroke, and the id is resolved behind
   * it. Awaiting the mint before rendering put a visible gap between typing
   * the delimiter and seeing the pill — the text vanished, then came back as
   * a card (owner, 2026-09-16) — which reads as a stutter in the one
   * interaction that has to feel immediate.
   *
   * A provisional pill carries its LABEL as its id. That is also the
   * permanent fallback when there is no schema permission to mint with: the
   * server's freeform pass accepts labels and mints them itself. So the
   * optimistic state is not a lie waiting to be corrected — it is a valid
   * value that usually gets upgraded to a real option id.
   */
  const flushDraft = useCallback(
    async (text: string) => {
      const parts = splitDelimited(text, column.config.splitOn ?? ",");
      setDraft("");
      if (parts.length === 0) return;

      const allowDuplicates = column.config.allowDuplicates === true;
      const keyOf = (label: string) => optionMatchKey(label, column.config);
      const seen = new Set(items.map((i) => keyOf(i.label)));
      const fresh: Array<{ id: string; label: string }> = [];
      let repeated: string | null = null;
      for (const part of parts) {
        const typed = column.config.titleCase ? titleCaseLabel(part) : part;
        const key = keyOf(typed);
        if (seen.has(key) && !allowDuplicates) {
          repeated = key;
          continue;
        }
        seen.add(key);
        const known = (column.config.options ?? []).find(
          (o) => keyOf(o.label) === key
        );
        fresh.push(
          known
            ? { id: known.id, label: known.label }
            : { id: typed, label: typed }
        );
      }
      if (repeated) setDuplicate(repeated);
      if (fresh.length === 0) return;

      // Paint immediately, then reconcile.
      const optimistic = [...items, ...fresh];
      setItems(optimistic);

      const needMint = fresh.filter((f) => f.id === f.label);
      if (needMint.length === 0 || !onCreateOption) {
        commit(optimistic);
        return;
      }

      const resolved = new Map<string, string>();
      for (const item of needMint) {
        const created = await onCreateOption(column, item.label);
        if (created) resolved.set(item.label, created.id);
      }
      // Rebuild from the LATEST state, not the snapshot we optimistically
      // rendered: the user may have typed or removed a pill while the mints
      // were in flight, and clobbering that would lose their edit.
      setItems((current) => {
        const next = current.map((i) =>
          resolved.has(i.label) ? { ...i, id: resolved.get(i.label)! } : i
        );
        onCommit(
          rowId,
          column.key,
          next.map((i) => i.id)
        );
        return next;
      });
    },
    [items, column, onCreateOption, onCommit, rowId, commit]
  );

  return (
    <div className="min-w-[220px] max-w-[320px] rounded-lg border border-border bg-popover p-2 shadow-lg">
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-1">
        {items.map((item, i) => (
          <span
            key={`${item.id}-${i}`}
            className={cn(
              "inline-flex max-w-[12rem] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors",
              duplicate === optionMatchKey(item.label, column.config)
                ? "bg-amber-500/20 ring-1 ring-amber-500/60"
                : "bg-muted"
            )}
            title={
              duplicate === optionMatchKey(item.label, column.config)
                ? "Already in this cell"
                : undefined
            }
          >
            <span className="truncate">{item.label}</span>
            <button
              type="button"
              aria-label={`Remove ${item.label}`}
              onClick={() => commit(items.filter((_, j) => j !== i))}
              className="shrink-0 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            const text = e.target.value;
            // The DELIMITER completes a pill in place — unless a backtick
            // fence is open, where it is part of the value being typed.
            //
            // Space was a terminator at first (copying email "To" fields)
            // and quotes protected values containing one; both lost to
            // ordinary text, since spaces are in most tags and the
            // apostrophe in "I'm" swallowed every later delimiter. A
            // backtick never appears in ordinary tag text, so it is safe to
            // give it meaning (owner, 2026-09-16).
            const delim = column.config.splitOn ?? ",";
            if (text.endsWith(delim) && !hasOpenFence(text)) {
              void flushDraft(text);
              return;
            }
            setDraft(text);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              if (draft.trim()) {
                e.preventDefault();
                void flushDraft(draft);
              }
              return;
            }
            if (e.key === "Backspace" && draft === "" && items.length > 0) {
              e.preventDefault();
              commit(items.slice(0, -1));
              return;
            }
            if (e.key === "Escape") onClose();
          }}
          onBlur={() => {
            if (draft.trim()) void flushDraft(draft);
          }}
          placeholder={items.length === 0 ? "Type a value…" : ""}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-xs outline-none"
        />
      </div>
      <p className="mt-1.5 px-0.5 text-[10px] leading-snug text-muted-foreground">
        Comma, Enter or Tab completes a value. For one containing a comma,
        use <span className="font-mono">`Portland, OR`</span>.
      </p>
    </div>
  );
}

interface SelectOptionsPanelProps {
  column: DataColumn;
  value: CellValue | undefined;
  rowId: string;
  onCommit: (rowId: string, columnKey: string, value: unknown) => void;
  onCreateOption?: (
    column: DataColumn,
    label: string
  ) => Promise<{ id: string; label: string } | null>;
  onClose: () => void;
}

/**
 * The grid cell's option picker. Single select commits and closes; multi
 * toggles live and closes on dismiss. "+ New option" (owners only, via
 * onCreateOption) creates AND applies — you typed it in this cell because
 * this row wears it. Mirrors the peek's inline creation, different chrome.
 */
function SelectOptionsPanel({
  column,
  value,
  rowId,
  onCommit,
  onCreateOption,
  onClose,
}: SelectOptionsPanelProps) {
  const multi = column.type === "multiSelect";
  const options =
    column.type === "status"
      ? sortStatusOptions(column.config.options ?? [])
      : (column.config.options ?? []);
  const chosen = new Set(
    multi
      ? Array.isArray(value)
        ? value
        : []
      : typeof value === "string"
        ? [value]
        : []
  );
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  const commitSingle = (id: string) => {
    // Re-picking the current option clears it — the one-click "unset".
    onCommit(rowId, column.key, chosen.has(id) ? undefined : id);
    onClose();
  };

  const toggleMulti = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Option-definition order — cell arrays are order-significant (B8c).
    const ordered = options.filter((o) => next.has(o.id)).map((o) => o.id);
    onCommit(rowId, column.key, ordered.length > 0 ? ordered : undefined);
  };

  const submitNew = async () => {
    if (!onCreateOption) return;
    const trimmed = label.trim();
    if (!trimmed) return;
    const created = await onCreateOption(column, trimmed);
    if (created) {
      if (multi) {
        const current = Array.isArray(value) ? value : [];
        if (!current.includes(created.id)) {
          onCommit(rowId, column.key, [...current, created.id]);
        }
      } else {
        onCommit(rowId, column.key, created.id);
      }
    }
    setLabel("");
    setAdding(false);
    if (!multi) onClose();
  };

  return (
    <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
      {options.length === 0 && (
        <p className="px-1 py-0.5 text-[11px] italic text-muted-foreground">
          No options yet.
        </p>
      )}
      {options.map((o) =>
        multi ? (
          <label
            key={o.id}
            className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60"
          >
            <input
              type="checkbox"
              checked={chosen.has(o.id)}
              onChange={() => toggleMulti(o.id)}
              className="h-3.5 w-3.5 accent-current"
            />
            <span className="truncate">{o.label}</span>
          </label>
        ) : (
          <button
            key={o.id}
            type="button"
            onClick={() => commitSingle(o.id)}
            className={cn(
              "flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted/60",
              chosen.has(o.id) && "bg-muted/40"
            )}
          >
            <Check
              className={cn(
                "h-3 w-3 shrink-0",
                chosen.has(o.id) ? "opacity-100" : "opacity-0"
              )}
            />
            <span className="truncate">{o.label}</span>
          </button>
        )
      )}

      {onCreateOption &&
        (adding ? (
          <div className="mt-1 flex items-center gap-1">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitNew();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setAdding(false);
                  setLabel("");
                }
              }}
              placeholder="New option label"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => void submitNew()}
              disabled={!label.trim()}
              className="shrink-0 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1 flex items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            New option
          </button>
        ))}
    </div>
  );
}
