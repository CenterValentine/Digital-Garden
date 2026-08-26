"use client";

/**
 * Property header (plan Phase 5 level 2 / built as Phase 6a): the row's
 * cells rendered as a collapsible strip above the promoted page's note
 * body — the Notion row-page experience. Shares the exact field editors
 * the peek and split view use (DataRowFields), so an editor fix lands on
 * every surface at once.
 *
 * Self-contained: fetches its row hydrated via the rows `ids=` branch,
 * commits through the same CAS-shaped PATCH the grid uses (no
 * expectations — last-write-wins per cell here), and refetches after
 * every commit so hydrated refs (person, files, relations) stay honest.
 * A primary-cell edit dispatches `content-updated`, keeping the page
 * title, tab, and tree label in sync with the server-side title sync.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  deriveRowTitle,
  type ContentRef,
  type DataColumn,
  type DataRow,
} from "@/lib/domain/data";
import { useContentStore } from "@/state/content-store";
import { DataRowFields } from "./DataRowFields";

interface DataRowPropertyHeaderProps {
  tableId: string;
  rowId: string;
}

export function DataRowPropertyHeader({
  tableId,
  rowId,
}: DataRowPropertyHeaderProps) {
  const [row, setRow] = useState<DataRow | null>(null);
  const [columns, setColumns] = useState<DataColumn[]>([]);
  const [editable, setEditable] = useState(false);
  const [open, setOpen] = useState(true);
  const selectNode = useContentStore((s) => s.setSelectedContentId);

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- audited: every setState in `load` runs after fetch awaits resolve, never synchronously in the effect body (same shape as DataTableViewer's mount load)
    void load();
  }, [load]);

  const commitCell = useCallback(
    async (id: string, columnKey: string, value: unknown) => {
      const res = await fetch(`/api/content/data/${tableId}/rows`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writes: [
            { rowId: id, columnKey, value, hasExpectation: false },
          ],
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

  if (!row || columns.length === 0) return null;

  return (
    <div className="border-b border-border/60 bg-muted/20 px-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Properties
      </button>
      {open && (
        <div className="max-w-2xl pb-2">
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
