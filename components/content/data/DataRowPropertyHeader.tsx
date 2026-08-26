"use client";

/**
 * Property header (plan Phase 5 level 2 / built as Phase 6a): the row's
 * cells rendered as a collapsible strip beside the promoted page's note
 * body — the Notion row-page experience. Shares the exact field editors
 * the peek and split view use (DataRowFields), so an editor fix lands on
 * every surface at once.
 *
 * Placement + collapse follow the Reference Drawer's precedent (owner,
 * 2026-08-27): a two-direction arrow moves the whole strip above or
 * below the note body — per DATABASE, since a table's pages share shape
 * — and the open state persists the same way. Default collapsed. The
 * parent mounts one instance per slot; the instance whose slot doesn't
 * match the persisted position renders nothing and fetches nothing.
 *
 * Commits go through the same PATCH the grid uses; a primary-cell edit
 * dispatches `content-updated` so page title, tab, and tree label follow
 * the server-side title sync. Fields are capped to a viewport fraction
 * and scroll internally, so a wide schema can never push the note out of
 * reach (owner report, 2026-08-27).
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import {
  deriveRowTitle,
  type ContentRef,
  type DataColumn,
  type DataRow,
} from "@/lib/domain/data";
import { useContentStore } from "@/state/content-store";
import { DataRowFields } from "./DataRowFields";

interface PropsPrefs {
  open: boolean;
  position: "above" | "below";
}

const DEFAULT_PREFS: PropsPrefs = { open: false, position: "above" };

function prefsKey(tableId: string): string {
  return `dg:data-props:${tableId}`;
}

function readPrefs(tableId: string): PropsPrefs {
  try {
    const raw = window.localStorage.getItem(prefsKey(tableId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PropsPrefs>;
    return {
      open: parsed.open === true,
      position: parsed.position === "below" ? "below" : "above",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(tableId: string, prefs: PropsPrefs): void {
  try {
    window.localStorage.setItem(prefsKey(tableId), JSON.stringify(prefs));
  } catch {
    // Preference persistence is a convenience — never worth an error.
  }
}

interface DataRowPropertyHeaderProps {
  tableId: string;
  rowId: string;
  /** Which mount this instance is — it renders only in its persisted slot. */
  slot: "above" | "below";
}

export function DataRowPropertyHeader({
  tableId,
  rowId,
  slot,
}: DataRowPropertyHeaderProps) {
  const [prefs, setPrefs] = useState<PropsPrefs>(() => readPrefs(tableId));
  const [row, setRow] = useState<DataRow | null>(null);
  const [columns, setColumns] = useState<DataColumn[]>([]);
  const [editable, setEditable] = useState(false);
  const selectNode = useContentStore((s) => s.setSelectedContentId);

  const active = prefs.position === slot;

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/content/data/${tableId}/rows?ids=${encodeURIComponent(rowId)}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) return;
      setRow((json.data.rows as DataRow[])[0] ?? null);
      setColumns(json.data.columns as DataColumn[]);
      setEditable(
        json.data.accessLevel === "write" || json.data.accessLevel === "owner"
      );
    } catch {
      // The header failing to load must not break the page — the note
      // body renders regardless; the strip just stays empty.
    }
  }, [tableId, rowId]);

  // Fetch only when this instance is the live slot AND the strip is open —
  // a collapsed strip costs nothing until the user reaches for it.
  useEffect(() => {
    if (!active || !prefs.open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- audited: every setState in `load` runs after fetch awaits resolve, never synchronously in the effect body (same shape as DataTableViewer's mount load)
    void load();
  }, [active, prefs.open, load]);

  const setOpen = useCallback(
    (open: boolean) => {
      setPrefs((p) => {
        const next = { ...p, open };
        writePrefs(tableId, next);
        return next;
      });
    },
    [tableId]
  );

  const flipPosition = useCallback(() => {
    setPrefs((p) => {
      const next: PropsPrefs = {
        ...p,
        position: p.position === "above" ? "below" : "above",
      };
      writePrefs(tableId, next);
      return next;
    });
  }, [tableId]);

  const commitCell = useCallback(
    async (id: string, columnKey: string, value: unknown) => {
      const res = await fetch(`/api/content/data/${tableId}/rows`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writes: [{ rowId: id, columnKey, value, hasExpectation: false }],
        }),
      });
      if (res.ok) {
        const column = columns.find((c) => c.key === columnKey);
        if (column?.isPrimary && row?.contentId) {
          const nextData = { ...row.data };
          if (value === undefined || value === null || value === "") {
            delete nextData[columnKey];
          } else {
            nextData[columnKey] = value as DataRow["data"][string];
          }
          window.dispatchEvent(
            new CustomEvent("content-updated", {
              detail: {
                contentId: row.contentId,
                updates: { title: deriveRowTitle(columns, nextData) },
              },
            })
          );
        }
      }
      void load();
    },
    [tableId, columns, row, load]
  );

  const openContent = useCallback(
    (ref: ContentRef) => {
      if (ref.restricted) return;
      selectNode(ref.id, { contentType: ref.contentType, title: ref.title });
    },
    [selectNode]
  );

  if (!active) return null;

  return (
    <div className="shrink-0 border-b border-border/60 bg-muted/20 px-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(!prefs.open)}
          className="flex items-center gap-1 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {prefs.open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Properties
        </button>
        {prefs.open && (
          <button
            type="button"
            onClick={flipPosition}
            title={
              prefs.position === "above"
                ? "Move properties below the note"
                : "Move properties above the note"
            }
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowUpDown className="h-3 w-3" />
          </button>
        )}
      </div>
      {prefs.open && row && columns.length > 0 && (
        <div className="max-h-[45vh] max-w-2xl overflow-y-auto pb-2">
          <DataRowFields
            tableId={tableId}
            row={row}
            columns={columns}
            editable={editable}
            onOpenContent={openContent}
            onCommitCell={commitCell}
            onRefresh={() => void load()}
          />
        </div>
      )}
    </div>
  );
}
