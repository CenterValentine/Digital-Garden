"use client";

/**
 * Board (kanban) renderer — the mode that earns Phase 2.
 *
 * Groups rows by a single-value option column (status or select). Dragging a
 * card between groups IS a cell write: it goes through the same commitCell
 * path as typing in the grid, so it is optimistic, CAS-undoable, and
 * reconciled by the poller like any other edit. No board-specific mutation
 * exists — that is the point.
 *
 * Standalone per the Phase 2 constraint (plan B7): takes (view, columns,
 * rows) and owns no page-level layout, so the same component can later
 * render inside a noteWindow at block width.
 *
 * Windowing note (B8d deviation, recorded): groups render the loaded page
 * (≤100 rows) without per-group virtualization. A board is legible to maybe
 * dozens of cards per column; the grid remains the tool past that, and
 * per-group windowing can land without changing this component's contract.
 */

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  cellToDisplayText,
  cellToText,
  sortStatusOptions,
  type DataColumn,
  type DataRow,
  type DataView,
  type SelectOption,
} from "@/lib/domain/data";

/** The synthetic group for rows whose group cell is absent. */
const UNGROUPED = "__ungrouped__";

interface DataBoardViewProps {
  view: DataView;
  columns: DataColumn[];
  rows: DataRow[];
  editable: boolean;
  onCommitCell: (rowId: string, columnKey: string, value: unknown) => void;
  onAddRowInGroup: (optionId: string | null) => Promise<void>;
  onOpenRow: (rowId: string) => void;
}

export function DataBoardView({
  view,
  columns,
  rows,
  editable,
  onCommitCell,
  onAddRowInGroup,
  onOpenRow,
}: DataBoardViewProps) {
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  /** Click selects (a card should FEEL selectable); double-click opens. */
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const groupColumn = useMemo(
    () =>
      columns.find(
        (c) =>
          c.id === view.groupByColumnId &&
          (c.type === "status" || c.type === "select")
      ) ??
      // Sensible default: the first status column, then the first select —
      // so switching a view to board mode works before groupBy is chosen.
      columns.find((c) => c.type === "status") ??
      columns.find((c) => c.type === "select") ??
      null,
    [columns, view.groupByColumnId]
  );

  const primary = useMemo(
    () => columns.find((c) => c.isPrimary) ?? columns[0] ?? null,
    [columns]
  );

  /** Up to two non-empty context fields per card, beyond title + group. */
  const cardColumns = useMemo(
    () =>
      columns.filter(
        (c) => !c.isPrimary && c.id !== groupColumn?.id && !c.deletedAt
      ),
    [columns, groupColumn]
  );

  const groups = useMemo(() => {
    if (!groupColumn) return [];
    const options =
      groupColumn.type === "status"
        ? sortStatusOptions(groupColumn.config.options ?? [])
        : (groupColumn.config.options ?? []);

    const byOption = new Map<string, DataRow[]>();
    for (const option of options) byOption.set(option.id, []);
    const ungrouped: DataRow[] = [];

    for (const row of rows) {
      const value = row.data[groupColumn.key];
      if (typeof value === "string" && byOption.has(value)) {
        byOption.get(value)!.push(row);
      } else {
        ungrouped.push(row);
      }
    }

    const result: Array<{
      id: string;
      option: SelectOption | null;
      rows: DataRow[];
    }> = options.map((option) => ({
      id: option.id,
      option,
      rows: byOption.get(option.id) ?? [],
    }));
    // "No <column>" renders only when it has members — an empty synthetic
    // column is noise, unlike an empty real option which invites dropping.
    if (ungrouped.length > 0) {
      result.push({ id: UNGROUPED, option: null, rows: ungrouped });
    }
    return result;
  }, [groupColumn, rows]);

  const handleDrop = useCallback(
    (e: React.DragEvent, groupId: string) => {
      e.preventDefault();
      const rowId = dragRowId;
      setDragRowId(null);
      setDropGroup(null);
      if (!rowId || !groupColumn) return;
      const row = rows.find((r) => r.id === rowId);
      const current = row?.data[groupColumn.key];
      const next = groupId === UNGROUPED ? undefined : groupId;
      if (current === next) return;
      // A card move IS a cell edit — same optimistic write, same undo entry.
      onCommitCell(rowId, groupColumn.key, next);
    },
    [dragRowId, groupColumn, rows, onCommitCell]
  );

  if (!groupColumn) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Boards group rows by a Status or Select column.
        <br />
        Add one to this database to use the board.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-3">
      {groups.map((group) => (
        <div
          key={group.id}
          className={cn(
            "flex w-56 shrink-0 flex-col rounded-lg",
            dropGroup === group.id && "bg-primary/5 ring-1 ring-primary/40"
          )}
          onDragOver={(e) => {
            if (!dragRowId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropGroup((cur) => (cur === group.id ? cur : group.id));
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropGroup((cur) => (cur === group.id ? null : cur));
            }
          }}
          onDrop={(e) => handleDrop(e, group.id)}
        >
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
              {group.option?.label ?? `No ${groupColumn.name}`}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {group.rows.length}
            </span>
          </div>

          <div className="flex min-h-8 flex-col gap-1.5 px-1.5 pb-1.5">
            {group.rows.map((row) => (
              <BoardCard
                key={row.id}
                row={row}
                primary={primary}
                cardColumns={cardColumns}
                editable={editable}
                dragging={dragRowId === row.id}
                selected={selectedRowId === row.id}
                onSelect={() => setSelectedRowId(row.id)}
                onOpen={() => onOpenRow(row.id)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", row.id);
                  setDragRowId(row.id);
                }}
                onDragEnd={() => {
                  setDragRowId(null);
                  setDropGroup(null);
                }}
              />
            ))}
            {editable && group.id !== UNGROUPED && (
              <button
                type="button"
                onClick={() => void onAddRowInGroup(group.option?.id ?? null)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left",
                  "text-xs text-muted-foreground hover:bg-muted/60"
                )}
              >
                <Plus className="h-3 w-3" />
                New
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────

interface BoardCardProps {
  row: DataRow;
  primary: DataColumn | null;
  cardColumns: DataColumn[];
  editable: boolean;
  dragging: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function BoardCard({
  row,
  primary,
  cardColumns,
  editable,
  dragging,
  selected,
  onSelect,
  onOpen,
  onDragStart,
  onDragEnd,
}: BoardCardProps) {
  const title = primary
    ? cellToText(primary, row.data[primary.key]) || "Untitled"
    : "Untitled";

  const context = cardColumns
    .map((c) => ({ column: c, text: cellToDisplayText(c, row.data[c.key]) }))
    .filter((e) => e.text)
    .slice(0, 2);

  return (
    <div
      draggable={editable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      // Click = select, double-click = open (owner, 2026-08-24). The open
      // affordance moving to dblclick is what makes single-click selection
      // feel safe to use.
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        "rounded-md border bg-background p-2 shadow-sm",
        "cursor-pointer transition-all duration-100",
        "hover:-translate-y-px hover:border-primary/40 hover:shadow-md",
        selected
          ? "border-primary ring-1 ring-primary"
          : "border-border",
        editable && "active:cursor-grabbing",
        dragging && "opacity-40"
      )}
    >
      <div className="text-xs font-medium leading-snug">{title}</div>
      {context.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {context.map(({ column, text }) => (
            <div
              key={column.id}
              className="truncate text-[11px] text-muted-foreground"
              title={`${column.name}: ${text}`}
            >
              {text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
