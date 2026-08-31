"use client";

/**
 * Database context rail — the right-sidebar tab for a `data` node.
 *
 * A flat column list with inline editing, so schema tweaks (rename, options,
 * number formatting, descriptions) don't require hunting through grid header
 * menus one popover at a time. Renders the SAME editor the header popover
 * uses (ColumnEditForm) and the same AddColumnButton, so the two surfaces
 * cannot drift.
 *
 * The rail and the grid are unrelated corners of the tree with no shared
 * store; schema changes travel the DATA_SCHEMA_CHANGED_EVENT seam in both
 * directions (see ./events.ts). Each surface skips its own echo.
 *
 * Editing is gated on accessLevel === "owner" — the columns route enforces
 * `canAlterSchema`, which is deliberately stricter than cell-write access
 * (a bad column change can invalidate every row, plan Phase 6).
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { DataColumnType, DataTable } from "@/lib/domain/data";
import { TYPE_GLYPH } from "./DataColumnHeader";
import { AddColumnButton, ColumnEditForm, TYPE_LABEL } from "./DataColumnMenu";
import {
  DATA_SCHEMA_CHANGED_EVENT,
  dispatchDataSchemaChanged,
  type DataSchemaChangedDetail,
} from "./events";

interface DataSchemaRailProps {
  contentId: string | null;
}

interface RailState {
  table: DataTable | null;
  accessLevel: string | null;
  total: number;
  loading: boolean;
  error: string | null;
}

const INITIAL: RailState = {
  table: null,
  accessLevel: null,
  total: 0,
  loading: true,
  error: null,
};

export function DataSchemaRail({ contentId }: DataSchemaRailProps) {
  const [state, setState] = useState<RailState>(INITIAL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contentId) return;
    try {
      const res = await fetch(`/api/content/data/${contentId}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Could not load this database");
      }
      setState({
        table: json.data.table as DataTable,
        accessLevel: (json.data.accessLevel as string) ?? null,
        total: (json.data.total as number) ?? 0,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((cur) => ({
        ...cur,
        loading: false,
        error:
          err instanceof Error ? err.message : "Could not load this database",
      }));
    }
  }, [contentId]);

  // Fresh node = fresh rail: the mount site keys this component by
  // contentId, so navigation remounts it and state re-seeds from INITIAL —
  // no reset effect, per react-hooks/set-state-in-effect.
  useEffect(() => {
    void load();
  }, [load]);

  // Grid-side schema changes → refetch. Own echoes are skipped: the rail
  // already reloads after its own mutations.
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<DataSchemaChangedDetail>).detail;
      if (detail?.tableId !== contentId || detail.source === "rail") return;
      void load();
    };
    window.addEventListener(DATA_SCHEMA_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(DATA_SCHEMA_CHANGED_EVENT, onChanged);
  }, [contentId, load]);

  const columnRequest = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", body: unknown) => {
      if (!contentId) return false;
      const res = await fetch(`/api/content/data/${contentId}/columns`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice(json?.error?.message ?? "Could not update columns");
        return false;
      }
      setNotice(null);
      await load();
      dispatchDataSchemaChanged(contentId, "rail");
      return true;
    },
    [contentId, load]
  );

  const columns =
    state.table?.columns.filter((c) => !c.deletedAt) ?? [];
  const canEditSchema = state.accessLevel === "owner";
  const isQuery = state.table?.mode === "query";

  if (!contentId) return null;

  if (state.loading) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">Loading…</p>
    );
  }

  if (state.error || !state.table) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        {state.error ?? "Could not load this database"}
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="truncate text-sm font-medium" title={state.table.title}>
          {state.table.title}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {columns.length} {columns.length === 1 ? "column" : "columns"} ·{" "}
          {state.total} {state.total === 1 ? "row" : "rows"}
          {isQuery && " · query"}
        </p>
      </div>

      {notice && (
        <p className="border-b border-border/60 bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
          {notice}
        </p>
      )}

      <div className="flex-1">
        {columns.map((column) => {
          const expanded = expandedId === column.id;
          return (
            <div key={column.id} className="border-b border-border/40">
              <button
                type="button"
                onClick={() =>
                  setExpandedId((cur) => (cur === column.id ? null : column.id))
                }
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2 text-left text-xs",
                  "hover:bg-muted/50",
                  expanded && "bg-muted/40"
                )}
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground"
                >
                  {column.config?.isBacklink
                    ? "⇠"
                    : (TYPE_GLYPH[column.type as DataColumnType] ?? "·")}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
                  {column.name}
                </span>
                {column.description && !expanded && (
                  <Info
                    className="h-3 w-3 shrink-0 text-primary/70"
                    aria-label={column.description}
                  />
                )}
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[column.type] ?? column.type}
                </span>
              </button>

              {expanded &&
                (canEditSchema && !isQuery ? (
                  // The outer key={column.id} remounts this form per column,
                  // so its draft state always seeds from the right column.
                  <div className="border-t border-border/40 bg-muted/20 px-4 py-3">
                    <ColumnEditForm
                      column={column}
                      autoFocus={false}
                      onSave={async (patch) => {
                        await columnRequest("PATCH", {
                          columnId: column.id,
                          ...patch,
                        });
                      }}
                      onDelete={async () => {
                        const done = await columnRequest("DELETE", {
                          columnId: column.id,
                        });
                        if (done) {
                          setExpandedId(null);
                          setNotice(null);
                        }
                      }}
                      onClose={() => setExpandedId(null)}
                    />
                  </div>
                ) : (
                  <div className="border-t border-border/40 bg-muted/20 px-4 py-3">
                    {column.description ? (
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {column.description}
                      </p>
                    ) : (
                      <p className="text-[11px] italic text-muted-foreground">
                        No description.
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {isQuery
                        ? "Query tables synthesize their columns — nothing to edit."
                        : "Only the database owner can change its columns."}
                    </p>
                  </div>
                ))}
            </div>
          );
        })}
        {columns.length === 0 && (
          <p className="px-4 py-6 text-xs text-muted-foreground">
            No columns yet.
          </p>
        )}
      </div>

      {canEditSchema && !isQuery && (
        <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">Add a column</span>
          <AddColumnButton
            tableId={contentId}
            columns={columns}
            onAdd={async (input) => {
              await columnRequest("POST", input);
            }}
          />
        </div>
      )}
    </div>
  );
}
