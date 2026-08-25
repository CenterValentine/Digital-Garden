"use client";

/**
 * Per-view filter editor (plan Phase 2).
 *
 * A flat list of AND-joined conditions — the stored tree supports arbitrary
 * AND/OR nesting (plan B8c), but the editor deliberately starts with the
 * shape people actually build: "Status is Reading AND Rating > 3". OR groups
 * get UI when a use case demands them; the storage already supports it, so
 * that day costs a component, not a migration.
 *
 * Filters belong to the VIEW and run server-side (filterToWhere), so a
 * filtered board and a filtered grid both come back pre-narrowed and
 * pagination stays correct.
 */

import { useCallback, useState } from "react";
import { ListFilter, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  isFilterGroup,
  operatorsForType,
  sortStatusOptions,
  type DataColumn,
  type DataView,
  type FilterCondition,
  type FilterNode,
  type FilterOperator,
} from "@/lib/domain/data";
import { PanelPortal } from "./PanelPortal";

const OPERATOR_LABEL: Record<FilterOperator, string> = {
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  is: "is",
  isNot: "is not",
  contains: "contains",
  notContains: "doesn't contain",
  startsWith: "starts with",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  hasAny: "has any of",
  hasAll: "has all of",
  hasNone: "has none of",
  isWithin: "is within",
};

const DATE_WINDOWS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last7Days", "Last 7 days"],
  ["last30Days", "Last 30 days"],
  ["thisMonth", "This month"],
  ["thisYear", "This year"],
] as const;

const fieldClass = cn(
  "rounded-md border border-border bg-background px-2 py-1 text-xs",
  "outline-none focus:ring-2 focus:ring-primary"
);

/** The editor's working shape: the flat AND list. */
function toConditions(filters: FilterNode | null | undefined): FilterCondition[] {
  if (!filters || !isFilterGroup(filters)) return [];
  return filters.children.filter((c): c is FilterCondition => !isFilterGroup(c));
}

interface DataFilterBarProps {
  view: DataView;
  columns: DataColumn[];
  canWrite: boolean;
  onSave: (filters: FilterNode) => Promise<void>;
}

export function DataFilterBar({ view, columns, canWrite, onSave }: DataFilterBarProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterCondition[] | null>(null);
  const active = toConditions(view.filters);
  const locked = view.access === "locked";

  const conditions = draft ?? active;

  const close = useCallback(() => {
    setOpen(false);
    setDraft(null);
  }, []);

  const save = useCallback(async () => {
    if (!draft) {
      close();
      return;
    }
    // Complete conditions only — a half-built row (no value where one is
    // required) is dropped rather than saved as an always-false clause.
    const complete = draft.filter(
      (c) =>
        c.operator === "isEmpty" ||
        c.operator === "isNotEmpty" ||
        (c.value !== undefined && c.value !== "")
    );
    await onSave({ op: "and", children: complete });
    close();
  }, [draft, onSave, close]);

  const filterable = columns.filter((c) => operatorsForType(c.type).length > 0);

  return (
    <div className="relative flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs",
          active.length > 0
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-muted"
        )}
      >
        <ListFilter className="h-3.5 w-3.5" />
        Filter
        {active.length > 0 && (
          <span className="font-mono text-[10px] tabular-nums">{active.length}</span>
        )}
      </button>

      <PanelPortal open={open} onDismiss={close} className="w-[22rem]">
        <div className="flex flex-col gap-2">
          {conditions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No filters — every row shows.
            </p>
          )}
          {conditions.map((condition, i) => (
            <ConditionRow
              key={i}
              condition={condition}
              columns={filterable}
              disabled={!canWrite || locked}
              onChange={(next) => {
                const list = [...conditions];
                list[i] = next;
                setDraft(list);
              }}
              onRemove={() => setDraft(conditions.filter((_, j) => j !== i))}
            />
          ))}

          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              disabled={!canWrite || locked || filterable.length === 0}
              onClick={() => {
                const col = filterable[0];
                setDraft([
                  ...conditions,
                  { columnId: col.id, operator: operatorsForType(col.type)[0] },
                ]);
              }}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              Add filter
            </button>
            <button
              type="button"
              disabled={!canWrite || locked || draft === null}
              onClick={() => void save()}
              className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              Apply
            </button>
          </div>
          {locked && (
            <p className="text-[10px] text-muted-foreground">
              This view is locked — its filters cannot change.
            </p>
          )}
        </div>
      </PanelPortal>
    </div>
  );
}

// ── One condition ────────────────────────────────────────────────────────

interface ConditionRowProps {
  condition: FilterCondition;
  columns: DataColumn[];
  disabled: boolean;
  onChange: (next: FilterCondition) => void;
  onRemove: () => void;
}

function ConditionRow({ condition, columns, disabled, onChange, onRemove }: ConditionRowProps) {
  const column = columns.find((c) => c.id === condition.columnId) ?? columns[0];
  if (!column) return null;
  const operators = operatorsForType(column.type);
  const needsValue =
    condition.operator !== "isEmpty" && condition.operator !== "isNotEmpty";

  // Two lines: selects + remove on the first, the VALUE on its own
  // full-width second line. The first cut squeezed the value input into the
  // leftovers of a 256px panel, which collapsed it to a sliver — typed text
  // had nowhere to render (owner bug, 2026-08-24).
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 p-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={column.id}
          disabled={disabled}
          onChange={(e) => {
            const next = columns.find((c) => c.id === e.target.value);
            if (!next) return;
            // Column change resets operator + value — operators are per-type
            // and a stale value silently filters wrong.
            onChange({
              columnId: next.id,
              operator: operatorsForType(next.type)[0],
            });
          }}
          className={cn(fieldClass, "min-w-0 flex-1")}
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={condition.operator}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              columnId: column.id,
              operator: e.target.value as FilterOperator,
            })
          }
          className={cn(fieldClass, "min-w-0 flex-1")}
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABEL[op]}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label="Remove filter"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {needsValue && (
        <ValueInput
          column={column}
          condition={condition}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    </div>
  );
}

interface ValueInputProps {
  column: DataColumn;
  condition: FilterCondition;
  disabled: boolean;
  onChange: (next: FilterCondition) => void;
}

function ValueInput({ column, condition, disabled, onChange }: ValueInputProps) {
  const set = (value: FilterCondition["value"]) =>
    onChange({ ...condition, value });

  if (condition.operator === "isWithin") {
    return (
      <select
        value={typeof condition.value === "string" ? condition.value : ""}
        disabled={disabled}
        onChange={(e) => set(e.target.value)}
        className={cn(fieldClass, "w-full")}
      >
        <option value="">Choose…</option>
        {DATE_WINDOWS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  if (
    column.type === "select" ||
    column.type === "status" ||
    column.type === "multiSelect"
  ) {
    const options =
      column.type === "status"
        ? sortStatusOptions(column.config.options ?? [])
        : (column.config.options ?? []);
    const isSetOp =
      condition.operator === "hasAny" ||
      condition.operator === "hasAll" ||
      condition.operator === "hasNone";
    const current = isSetOp
      ? Array.isArray(condition.value)
        ? (condition.value[0] ?? "")
        : ""
      : typeof condition.value === "string"
        ? condition.value
        : "";
    return (
      <select
        value={current}
        disabled={disabled}
        onChange={(e) =>
          // Set operators carry arrays (plan B8c); the v1 editor picks one
          // option, stored as a one-element array.
          set(isSetOp ? [e.target.value] : e.target.value)
        }
        className={cn(fieldClass, "w-full")}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (column.type === "checkbox") {
    return (
      <select
        value={condition.value === true ? "true" : condition.value === false ? "false" : ""}
        disabled={disabled}
        onChange={(e) => set(e.target.value === "true")}
        className={cn(fieldClass, "w-full")}
      >
        <option value="">Choose…</option>
        <option value="true">Checked</option>
        <option value="false">Unchecked</option>
      </select>
    );
  }

  return (
    <input
      type={
        column.type === "number" ? "number" : column.type === "date" ? "date" : "text"
      }
      value={typeof condition.value === "string" || typeof condition.value === "number" ? String(condition.value) : ""}
      disabled={disabled}
      onChange={(e) =>
        set(
          column.type === "number" && e.target.value !== ""
            ? Number(e.target.value)
            : e.target.value
        )
      }
      placeholder="Value"
      className={cn(fieldClass, "w-full")}
    />
  );
}
