"use client";

/**
 * Database content viewer — the grid.
 *
 * Phase 1a of DATABASE-CONTENT-TYPE-PLAN. Deliberately narrow: one view, cell
 * editing, add/delete rows and columns, undo. Views, board/gallery/form, and
 * promotion all arrive later and hang off the same read path.
 *
 * Three things here are load-bearing rather than incidental:
 *
 *  - **Rows are windowed.** Only the visible slice is in the DOM. Retrofitting
 *    virtualization into a built grid means rewriting scroll, selection and
 *    keyboard navigation, so it is here from the first commit (plan B8d).
 *  - **Writes are optimistic, then reconciled.** The cell shows your edit
 *    immediately; the server is authoritative and corrects it if it disagrees.
 *  - **Every mutation pushes its inverse** onto the undo stack, carrying the
 *    value it expects to find so undo cannot clobber a concurrent edit.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  cellToText,
  createUndoStack,
  describeOp,
  diffRow,
  keyForMove,
  pushOp,
  redo as redoStack,
  undo as undoStack,
  type CellEdit,
  type DataColumn,
  type DataRow,
  type DataTable,
  type DataView,
  type RowData,
  type UndoExecutor,
  type UndoOp,
  type UndoStackState,
} from "@/lib/domain/data";
import { DataGridRow, INLINE_EDITABLE_TYPES } from "./DataGridRow";
import { DataColumnHeader } from "./DataColumnHeader";
import { AddColumnButton, ColumnMenu } from "./DataColumnMenu";
import { DataViewBar, type ViewPatch } from "./DataViewBar";
import { DataBoardView } from "./DataBoardView";
import { DataRowPeek } from "./DataRowPeek";
import { DataFilterBar } from "./DataFilterBar";
import { DataQueryBar } from "./DataQueryBar";
import { useContentStore } from "@/state/content-store";

/** Row height in px. Fixed so the windowing maths stays honest. */
const ROW_HEIGHT = 36;
/** Rows rendered beyond the viewport, so scrolling does not flash blanks. */
const OVERSCAN = 8;
/** How often the grid asks the server what changed (plan B8d). */
const POLL_MS = 10_000;

interface DataTableViewerProps {
  contentId: string;
  title: string;
}

interface LoadState {
  table: DataTable | null;
  view: DataView | null;
  rows: DataRow[];
  serverTime: string | null;
  canWrite: boolean;
  loading: boolean;
  error: string | null;
}

export function DataTableViewer({ contentId, title }: DataTableViewerProps) {
  const [state, setState] = useState<LoadState>({
    table: null,
    view: null,
    rows: [],
    serverTime: null,
    canWrite: false,
    loading: true,
    error: null,
  });
  const [stack, setStack] = useState<UndoStackState>(createUndoStack);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{
    rowId: string;
    columnKey: string;
  } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    rowId: string;
    columnKey: string;
  } | null>(null);
  const [peekRowId, setPeekRowId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    columnId: string;
    side: "left" | "right";
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  /**
   * Stable per-mount id, so undo entries can be attributed to this client
   * when a durable log lands later. `useId()` rather than `crypto.randomUUID()`
   * — the latter is an impure call during render, which is the pattern that
   * produced the OnlyOfficeEditor iframe-reload bug (CLAUDE.md, Apr 2026).
   */
  const clientId = useId();

  /**
   * The poll callback reads the CURRENT view through this ref instead of
   * closing over state.view — keeping the poll effect's dep array at its
   * original constant shape. (Growing it mid-session tripped React's
   * changed-size warning under Fast Refresh; the ref also stops the poll
   * from re-subscribing on every view switch.)
   */
  const viewRef = useRef<DataView | null>(null);
  useEffect(() => {
    viewRef.current = state.view;
  }, [state.view]);

  const columns = useMemo(
    () => state.table?.columns.filter((c) => !c.deletedAt) ?? [],
    [state.table]
  );

  /**
   * Query tables are read-only projections (plan Phase 3): rows ARE
   * ContentNodes, so nothing here may edit cells, columns, or rows — the
   * server rejects it anyway, but the affordances should never render.
   * View management (rename, layout, access) stays live: views are the
   * table's OWN objects either way.
   */
  const isQuery = state.table?.mode === "query";
  const canEditData = state.canWrite && !isQuery;
  const selectNode = useContentStore((s) => s.setSelectedContentId);

  // ── Load ───────────────────────────────────────────────────────────────

  const load = useCallback(async (viewId: string | null = null) => {
    try {
      const q = viewId ? `?view=${encodeURIComponent(viewId)}` : "";
      const res = await fetch(`/api/content/data/${contentId}${q}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Failed to load database");
      }
      setState({
        table: json.data.table,
        view: json.data.view,
        rows: json.data.rows,
        serverTime: json.data.serverTime,
        canWrite:
          json.data.accessLevel === "write" || json.data.accessLevel === "owner",
        loading: false,
        error: null,
      });
      // ?view= addressability (plan B8 surface 1): the resolved view lands
      // in the URL so a copied link reopens THIS view. replaceState, not the
      // router — a view switch is not a navigation.
      const url = new URL(window.location.href);
      if (json.data.view?.id) url.searchParams.set("view", json.data.view.id);
      else url.searchParams.delete("view");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load database",
      }));
    }
  }, [contentId]);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    void load(fromUrl);
  }, [load]);

  // The rail's open-a-view seam: a fresh mount reads ?view= above; an
  // already-mounted viewer switches live on this event (same CustomEvent
  // pattern as dg:people-create-document).
  useEffect(() => {
    const onOpenView = (e: Event) => {
      const detail = (e as CustomEvent<{ contentId: string; viewId: string }>)
        .detail;
      if (detail?.contentId !== contentId || !detail.viewId) return;
      setSelectedRows(new Set());
      void load(detail.viewId);
    };
    window.addEventListener("dg:data-open-view", onOpenView);
    return () => window.removeEventListener("dg:data-open-view", onOpenView);
  }, [contentId, load]);

  // ── Poll ───────────────────────────────────────────────────────────────
  //
  // Reuses the shared-poller shape `noteWindow` established rather than
  // introducing a third concurrency mechanism beside Y.js and per-cell LWW.
  // Suspended while the tab is hidden; runs once immediately on refocus.

  useEffect(() => {
    if (!state.serverTime) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch(
          `/api/content/data/${contentId}/rows?since=${encodeURIComponent(state.serverTime!)}`,
          { credentials: "include" }
        );
        const json = await res.json();
        if (cancelled || !json?.success) return;

        const changed: DataRow[] = json.data.changed ?? [];
        const deletedIds: string[] = json.data.deletedIds ?? [];
        if (changed.length === 0 && deletedIds.length === 0) {
          setState((s) => ({ ...s, serverTime: json.data.serverTime }));
          return;
        }

        // Under view sorts the merge below would be WRONG — it re-sorts by
        // sortKey, scrambling the server's cell-value order. One reload gets
        // the truth; changes are rare enough that this costs nothing.
        const currentView = viewRef.current;
        if ((currentView?.sorts?.length ?? 0) > 0) {
          void load(currentView?.id ?? null);
          return;
        }

        setState((s) => {
          const gone = new Set(deletedIds);
          const byId = new Map(changed.map((r) => [r.id, r]));
          const merged = s.rows
            .filter((r) => !gone.has(r.id))
            .map((r) => byId.get(r.id) ?? r);
          for (const row of changed) {
            if (!merged.some((r) => r.id === row.id)) merged.push(row);
          }
          merged.sort((a, b) =>
            a.sortKey === b.sortKey
              ? a.id.localeCompare(b.id)
              : a.sortKey < b.sortKey
                ? -1
                : 1
          );
          return { ...s, rows: merged, serverTime: json.data.serverTime };
        });
      } catch {
        // A failed poll is not worth surfacing — the next one will catch up,
        // and a toast per dropped request would be noise, not information.
      }
    };

    const schedule = () => {
      timer = setTimeout(async () => {
        await poll();
        if (!cancelled) schedule();
      }, POLL_MS);
    };

    const onVisibility = () => {
      if (!document.hidden) void poll();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [contentId, state.serverTime, load]);

  // ── Viewport measurement ───────────────────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const firstVisible = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN
  );
  const visibleCount =
    Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const visibleRows = state.rows.slice(
    firstVisible,
    firstVisible + visibleCount
  );

  // ── Writes ─────────────────────────────────────────────────────────────

  const sendWrites = useCallback(
    async (
      edits: CellEdit[],
      withExpectation: boolean
    ): Promise<{ ok: boolean; stale: boolean; message?: string }> => {
      const res = await fetch(`/api/content/data/${contentId}/rows`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writes: edits.map((e) => ({
            rowId: e.rowId,
            columnKey: e.columnKey,
            value: e.after,
            expect: e.before,
            hasExpectation: withExpectation,
          })),
        }),
      });
      const json = await res.json();

      if (res.status === 409) {
        return {
          ok: false,
          stale: true,
          message: "someone else changed it first",
        };
      }
      if (!res.ok || !json.success) {
        const detail =
          json?.data?.results?.find(
            (r: { status: string; message?: string }) => r.status === "error"
          )?.message ?? json?.error?.message;
        return { ok: false, stale: false, message: detail ?? "write failed" };
      }
      return { ok: true, stale: false };
    },
    [contentId]
  );

  const commitCell = useCallback(
    async (rowId: string, columnKey: string, value: unknown) => {
      const row = state.rows.find((r) => r.id === rowId);
      if (!row) return;

      const before: RowData = row.data;
      const optimistic: RowData = { ...before };
      if (value === undefined || value === null || value === "") {
        delete optimistic[columnKey];
      } else {
        optimistic[columnKey] = value as RowData[string];
      }

      const edits = diffRow(rowId, before, optimistic);
      if (edits.length === 0) return;

      // Optimistic: the cell reflects the edit now, and the server corrects
      // it if it disagrees. Waiting for a round trip per keystroke-commit
      // makes a grid feel broken even when it is working.
      setState((s) => ({
        ...s,
        rows: s.rows.map((r) =>
          r.id === rowId ? { ...r, data: optimistic } : r
        ),
      }));

      const result = await sendWrites(edits, false);
      if (!result.ok) {
        setState((s) => ({
          ...s,
          rows: s.rows.map((r) => (r.id === rowId ? { ...r, data: before } : r)),
        }));
        setNotice(`Could not save — ${result.message}`);
        return;
      }

      const op: UndoOp = { kind: "setCells", edits, label: "" };
      setStack((s) =>
        pushOp(
          s,
          { ...op, label: describeOp(op) },
          clientId,
          Date.now()
        )
      );
    },
    [state.rows, sendWrites, clientId]
  );

  // ── Undo ───────────────────────────────────────────────────────────────

  const executor: UndoExecutor = useCallback(
    async (op) => {
      switch (op.kind) {
        case "setCells": {
          const result = await sendWrites(op.edits, true);
          if (result.stale) {
            return { status: "skipped-stale", detail: result.message! };
          }
          if (!result.ok) {
            return { status: "failed", detail: result.message ?? "write failed" };
          }
          await load(state.view?.id ?? null);
          return { status: "applied" };
        }
        case "deleteRows":
        case "addRows": {
          const restoring = op.kind === "addRows";
          const res = await fetch(`/api/content/data/${contentId}/rows`, {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rowIds: op.rowIds, restore: restoring }),
          });
          if (!res.ok) return { status: "failed", detail: "request failed" };
          await load(state.view?.id ?? null);
          return { status: "applied" };
        }
        default:
          return { status: "failed", detail: "not undoable yet" };
      }
    },
    [contentId, sendWrites, load, state.view]
  );

  const handleUndo = useCallback(async () => {
    const result = await undoStack(stack, executor);
    setStack(result.state);
    if (result.message) setNotice(result.message);
  }, [stack, executor]);

  const handleRedo = useCallback(async () => {
    const result = await redoStack(stack, executor);
    setStack(result.state);
    if (result.message) setNotice(result.message);
  }, [stack, executor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      // Let a focused input own its own undo — hijacking it would break
      // ordinary text editing inside a cell.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      void (e.shiftKey ? handleRedo() : handleUndo());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo]);

  // ── Row lifecycle ──────────────────────────────────────────────────────

  const addRow = useCallback(async () => {
    const res = await fetch(`/api/content/data/${contentId}/rows`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 1 }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setNotice("Could not add a row");
      return;
    }
    const op: UndoOp = {
      kind: "addRows",
      rowIds: json.data.rowIds,
      label: "",
    };
    setStack((s) =>
      pushOp(s, { ...op, label: describeOp(op) }, clientId, Date.now())
    );
    await load(state.view?.id ?? null);
  }, [contentId, load, clientId, state.view]);

  const deleteSelected = useCallback(async () => {
    if (selectedRows.size === 0) return;
    const rowIds = [...selectedRows];
    const res = await fetch(`/api/content/data/${contentId}/rows`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowIds }),
    });
    if (!res.ok) {
      setNotice("Could not delete");
      return;
    }
    const op: UndoOp = { kind: "deleteRows", rowIds, label: "" };
    setStack((s) =>
      pushOp(s, { ...op, label: describeOp(op) }, clientId, Date.now())
    );
    setSelectedRows(new Set());
    setNotice(`${describeOp(op)} deleted · ⌘Z to undo`);
    await load(state.view?.id ?? null);
  }, [contentId, selectedRows, load, clientId, state.view]);

  // ── Column lifecycle ───────────────────────────────────────────────────
  //
  // Schema edits reload the whole table rather than patching state locally:
  // a new column changes every row's shape, and reconciling that by hand is
  // more code and more bugs than one extra round trip on a rare action.

  const columnRequest = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", body: unknown) => {
      const res = await fetch(`/api/content/data/${contentId}/columns`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice(json?.error?.message ?? "Could not update columns");
        return false;
      }
      await load(state.view?.id ?? null);
      return true;
    },
    [contentId, load, state.view]
  );

  const addColumn = useCallback(
    async (input: {
      name: string;
      type: DataColumn["type"];
      config?: DataColumn["config"];
    }) => {
      await columnRequest("POST", input);
    },
    [columnRequest]
  );

  const saveColumn = useCallback(
    async (columnId: string, patch: { name: string; description: string | null }) => {
      await columnRequest("PATCH", { columnId, ...patch });
    },
    [columnRequest]
  );

  const deleteColumn = useCallback(
    async (columnId: string) => {
      const done = await columnRequest("DELETE", { columnId });
      if (done) {
        setOpenColumnId(null);
        // Cell data survives a column delete — that is what makes restoring
        // one a metadata flip rather than a recovery job (plan B4).
        setNotice("Column removed. Its values are kept.");
      }
    },
    [columnRequest]
  );

  // ── Column drag reorder ────────────────────────────────────────────────
  //
  // Fractional keys mean the whole gesture is ONE column's position write
  // (plan D7). The insertion index is computed in the without-the-mover
  // frame, which is the frame keyForMove expects.

  const dropSideFor = (e: React.DragEvent): "left" | "right" => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientX < rect.left + rect.width / 2 ? "left" : "right";
  };

  const handleColumnDragStart = useCallback(
    (e: React.DragEvent, columnId: string) => {
      e.dataTransfer.effectAllowed = "move";
      // Firefox refuses to start a drag without payload data.
      e.dataTransfer.setData("text/plain", columnId);
      setDragColumnId(columnId);
      setOpenColumnId(null);
    },
    []
  );

  const handleColumnDragOver = useCallback(
    (e: React.DragEvent, columnId: string) => {
      if (!dragColumnId || columnId === dragColumnId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const side = dropSideFor(e);
      setDropTarget((cur) =>
        cur && cur.columnId === columnId && cur.side === side
          ? cur
          : { columnId, side }
      );
    },
    [dragColumnId]
  );

  const handleColumnDragEnd = useCallback(() => {
    setDragColumnId(null);
    setDropTarget(null);
  }, []);

  const handleColumnDrop = useCallback(
    async (e: React.DragEvent, targetColumnId: string) => {
      e.preventDefault();
      const moving = dragColumnId;
      const side = dropSideFor(e);
      setDragColumnId(null);
      setDropTarget(null);
      if (!moving || moving === targetColumnId) return;

      const without = columns.filter((c) => c.id !== moving);
      const targetIdx = without.findIndex((c) => c.id === targetColumnId);
      if (targetIdx === -1) return;
      const insertion = side === "left" ? targetIdx : targetIdx + 1;

      const position = keyForMove(
        columns.map((c) => ({ id: c.id, sortKey: c.position })),
        moving,
        insertion
      );

      // Optimistic: the column lands immediately; columnRequest reloads the
      // schema afterwards, so the server stays the truth.
      setState((s) => {
        if (!s.table) return s;
        const cols = s.table.columns
          .map((c) => (c.id === moving ? { ...c, position } : c))
          .sort((a, b) =>
            a.position === b.position
              ? a.id.localeCompare(b.id)
              : a.position < b.position
                ? -1
                : 1
          );
        return { ...s, table: { ...s.table, columns: cols } };
      });

      await columnRequest("PATCH", { columnId: moving, position });
    },
    [dragColumnId, columns, columnRequest]
  );

  // ── View lifecycle ─────────────────────────────────────────────────────

  const switchView = useCallback(
    (viewId: string) => {
      if (viewId === state.view?.id) return;
      setSelectedRows(new Set());
      void load(viewId);
    },
    [state.view, load]
  );

  const createView = useCallback(async () => {
    const res = await fetch(`/api/content/data/${contentId}/views`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setNotice(json?.error?.message ?? "Could not create a view");
      return;
    }
    await load(json.data.viewId);
  }, [contentId, load]);

  const updateView = useCallback(
    async (viewId: string, patch: ViewPatch) => {
      const res = await fetch(`/api/content/data/${contentId}/views`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewId, ...patch }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice(json?.error?.message ?? "Could not update the view");
        return;
      }
      await load(state.view?.id ?? null);
    },
    [contentId, load, state.view]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      const res = await fetch(`/api/content/data/${contentId}/views`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice(json?.error?.message ?? "Could not delete the view");
        return;
      }
      // Deleting the active view lands on the table's resolved default.
      await load(viewId === state.view?.id ? null : (state.view?.id ?? null));
    },
    [contentId, load, state.view]
  );

  /**
   * Board's per-column "+ New": create a row, stamp its group cell. Two
   * requests, one undo entry for the add — the stamp rides as a second
   * cell-edit entry, which reads correctly in the undo toast.
   */
  const addRowInGroup = useCallback(
    async (optionId: string | null) => {
      const res = await fetch(`/api/content/data/${contentId}/rows`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice("Could not add a row");
        return;
      }
      const rowIds: string[] = json.data.rowIds;
      const op: UndoOp = { kind: "addRows", rowIds, label: "" };
      setStack((s) =>
        pushOp(s, { ...op, label: describeOp(op) }, clientId, Date.now())
      );

      const groupCol = columns.find((c) => c.id === state.view?.groupByColumnId)
        ?? columns.find((c) => c.type === "status")
        ?? columns.find((c) => c.type === "select");
      if (optionId && groupCol && rowIds[0]) {
        await sendWrites(
          [{ rowId: rowIds[0], columnKey: groupCol.key, before: undefined, after: optionId }],
          false
        );
      }
      await load(state.view?.id ?? null);
    },
    [contentId, columns, state.view, sendWrites, load, clientId]
  );

  // ── Cell keyboard model (owner friction, 2026-08-24) ───────────────────

  const selectCell = useCallback((rowId: string, columnKey: string) => {
    setSelectedCell({ rowId, columnKey });
    setEditTarget(null);
  }, []);

  const clearEditTarget = useCallback(() => setEditTarget(null), []);

  /** Tab advances editing through inline-editable columns, wrapping rows. */
  const advanceEdit = useCallback(
    (rowId: string, columnKey: string, dir: 1 | -1) => {
      const editableCols = columns.filter((c) =>
        INLINE_EDITABLE_TYPES.has(c.type)
      );
      const ci = editableCols.findIndex((c) => c.key === columnKey);
      const ri = state.rows.findIndex((r) => r.id === rowId);
      if (ci === -1 || ri === -1) {
        setEditTarget(null);
        return;
      }
      let nci = ci + dir;
      let nri = ri;
      if (nci >= editableCols.length) {
        nci = 0;
        nri = ri + 1;
      } else if (nci < 0) {
        nci = editableCols.length - 1;
        nri = ri - 1;
      }
      const nextRow = state.rows[nri];
      if (!nextRow) {
        setEditTarget(null);
        return;
      }
      const target = { rowId: nextRow.id, columnKey: editableCols[nci].key };
      setEditTarget(target);
      setSelectedCell(target);
    },
    [columns, state.rows]
  );

  // Tab walks SELECTION through every column, row by row, until exhausted
  // (owner, 2026-08-24) — distinct from Tab-while-editing, which advances
  // the editor through inline-editable columns only. Enter on a selected
  // editable cell opens its editor; Escape clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedCell || editTarget) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const ci = columns.findIndex((c) => c.key === selectedCell.columnKey);
        const ri = state.rows.findIndex((r) => r.id === selectedCell.rowId);
        if (ci === -1 || ri === -1) return;
        let nci = ci + dir;
        let nri = ri;
        if (nci >= columns.length) {
          nci = 0;
          nri = ri + 1;
        } else if (nci < 0) {
          nci = columns.length - 1;
          nri = ri - 1;
        }
        const nextRow = state.rows[nri];
        // Exhausted means STOP — the selection holds at the last cell
        // rather than wrapping to the top, so repeated Tab is bounded.
        if (!nextRow) return;
        setSelectedCell({ rowId: nextRow.id, columnKey: columns[nci].key });
      } else if (e.key === "Enter") {
        const column = columns.find((c) => c.key === selectedCell.columnKey);
        if (column && INLINE_EDITABLE_TYPES.has(column.type)) {
          e.preventDefault();
          setEditTarget(selectedCell);
        }
      } else if (e.key === "Escape") {
        setSelectedCell(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCell, editTarget, columns, state.rows]);

  // ⌘C on a selected cell copies its display text — labels for selects,
  // never option ids. Skipped inside inputs and when the browser has a real
  // text selection, so ordinary copying is never hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "c") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (window.getSelection()?.toString()) return;
      if (!selectedCell) return;
      const column = columns.find((c) => c.key === selectedCell.columnKey);
      const row = state.rows.find((r) => r.id === selectedCell.rowId);
      if (!column || !row) return;
      e.preventDefault();
      const text = cellToText(column, row.data[column.key]);
      void navigator.clipboard.writeText(text);
      setNotice(text ? `Copied "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"` : "Copied empty cell");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCell, columns, state.rows]);

  const openRow = useCallback(
    (rowId: string) => {
      if (isQuery) {
        // The row IS a note/file — open the real thing, never a row page.
        const row = state.rows.find((r) => r.id === rowId);
        selectNode(rowId, {
          contentType: row?.nodeContentType ?? null,
          title: typeof row?.data.title === "string" ? row.data.title : null,
        });
        return;
      }
      setPeekRowId(rowId);
      setEditTarget(null);
    },
    [isQuery, state.rows, selectNode]
  );

  const navigatePeek = useCallback(
    (dir: 1 | -1) => {
      setPeekRowId((cur) => {
        const i = state.rows.findIndex((r) => r.id === cur);
        const next = state.rows[i + dir];
        return next ? next.id : cur;
      });
    },
    [state.rows]
  );

  const toggleRow = useCallback((rowId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading database…
      </div>
    );
  }

  if (state.error || !state.table) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {state.error ?? "Database not found"}
      </div>
    );
  }

  const totalHeight = state.rows.length * ROW_HEIGHT;

  const peekRow = peekRowId
    ? state.rows.find((r) => r.id === peekRowId) ?? null
    : null;
  const peekIndex = peekRow
    ? state.rows.findIndex((r) => r.id === peekRow.id)
    : -1;

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {state.rows.length} {state.rows.length === 1 ? "row" : "rows"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={stack.undo.length === 0}
            title="Undo (⌘Z)"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={stack.redo.length === 0}
            title="Redo (⇧⌘Z)"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          {selectedRows.size > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedRows.size}
            </button>
          )}
        </div>
      </header>

      <DataViewBar
        views={state.table.views}
        columns={columns}
        activeViewId={state.view?.id ?? null}
        defaultViewId={state.table.defaultViewId}
        canWrite={state.canWrite}
        onSwitch={switchView}
        onCreate={createView}
        onUpdate={updateView}
        onDelete={deleteView}
      />

      {state.view && !isQuery && (
        <DataFilterBar
          view={state.view}
          columns={columns}
          canWrite={state.canWrite}
          onSave={(filters) => updateView(state.view!.id, { filters })}
          onSaveSorts={(sorts) => updateView(state.view!.id, { sorts })}
        />
      )}

      {isQuery && state.table?.query && (
        <DataQueryBar
          query={state.table.query}
          total={state.rows.length}
          canEdit={state.canWrite}
          onSave={async (query) => {
            const res = await fetch(`/api/content/data/${contentId}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              setNotice(json?.error?.message ?? "Could not update the query");
              return;
            }
            await load(state.view?.id ?? null);
          }}
        />
      )}

      {notice && (
        <div
          role="status"
          className="border-b border-border bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground"
        >
          {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-2 underline"
          >
            dismiss
          </button>
        </div>
      )}

      {state.view?.mode === "board" ? (
        <div className="min-h-0 flex-1">
          <DataBoardView
            view={state.view}
            columns={columns}
            rows={state.rows}
            editable={canEditData}
            onCommitCell={commitCell}
            onAddRowInGroup={addRowInGroup}
            onOpenRow={openRow}
          />
        </div>
      ) : (
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 overflow-auto"
      >
        <div className="min-w-max">
          <div className="sticky top-0 z-10 flex border-b border-border bg-muted/60 backdrop-blur">
            <div className="w-9 shrink-0 border-r border-border/60" />
            <div className="w-6 shrink-0" />
            {columns.map((column) => (
              <DataColumnHeader
                key={column.id}
                column={column}
                editable={canEditData}
                menuOpen={openColumnId === column.id}
                onToggleMenu={(columnId) =>
                  setOpenColumnId((current) =>
                    current === columnId ? null : columnId
                  )
                }
                isDragSource={dragColumnId === column.id}
                dropIndicator={
                  dropTarget?.columnId === column.id ? dropTarget.side : null
                }
                onColumnDragStart={handleColumnDragStart}
                onColumnDragOver={handleColumnDragOver}
                onColumnDrop={handleColumnDrop}
                onColumnDragEnd={handleColumnDragEnd}
              >
                {openColumnId === column.id && (
                  <ColumnMenu
                    column={column}
                    onSave={(patch) => saveColumn(column.id, patch)}
                    onDelete={() => deleteColumn(column.id)}
                    onClose={() => setOpenColumnId(null)}
                  />
                )}
              </DataColumnHeader>
            ))}
            {canEditData && (
              <AddColumnButton tableId={contentId} onAdd={addColumn} />
            )}
          </div>

          {/* Spacer preserves true scroll height while only a slice renders. */}
          <div style={{ height: totalHeight, position: "relative" }}>
            <div
              style={{
                transform: `translateY(${firstVisible * ROW_HEIGHT}px)`,
                position: "absolute",
                left: 0,
                right: 0,
              }}
            >
              {visibleRows.map((row) => (
                <DataGridRow
                  key={row.id}
                  row={row}
                  columns={columns}
                  height={ROW_HEIGHT}
                  selected={selectedRows.has(row.id)}
                  editable={canEditData}
                  editColumnKey={
                    editTarget?.rowId === row.id ? editTarget.columnKey : null
                  }
                  selectedColumnKey={
                    selectedCell?.rowId === row.id
                      ? selectedCell.columnKey
                      : null
                  }
                  onToggleSelect={toggleRow}
                  onCommitCell={commitCell}
                  onSelectCell={selectCell}
                  onOpenRow={openRow}
                  onAdvance={advanceEdit}
                  onEditEnd={clearEditTarget}
                />
              ))}
            </div>
          </div>

          {canEditData && (
            <button
              type="button"
              onClick={addRow}
              className={cn(
                "flex w-full items-center gap-2 border-t border-border px-4 py-2",
                "text-xs text-muted-foreground hover:bg-muted/50"
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              New row
            </button>
          )}
        </div>
      </div>
      )}

      {peekRow && (
        <DataRowPeek
          tableId={contentId}
          row={peekRow}
          columns={columns}
          editable={canEditData}
          index={peekIndex}
          total={state.rows.length}
          onCommitCell={commitCell}
          onRefresh={() => void load(state.view?.id ?? null)}
          onNavigate={navigatePeek}
          onClose={() => setPeekRowId(null)}
        />
      )}
    </div>
  );
}

export type { DataColumn, DataRow };
