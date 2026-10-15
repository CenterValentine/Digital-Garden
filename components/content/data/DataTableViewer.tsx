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
import { Plus, Trash2, Undo2, Redo2, Layers, Copy } from "lucide-react";
import { cellDisplayValue } from "@/lib/domain/data/read-format";
import {
  registerPollingTask,
  runPollingTaskNow,
} from "@/lib/core/polling/scheduler";
import { subscribeEngagement } from "@/lib/core/engagement";
import { useDataFlashcardsDialogStore } from "@/state/data-flashcards-dialog-store";
import { FLASHCARDS_EXTENSION_ID } from "@/extensions/flashcards/manifest";
import { FLASHCARD_CHANGED_EVENT } from "@/extensions/flashcards/events";
import { useIsExtensionEnabled } from "@/lib/extensions/client-registry";
import {
  findTableLink,
  useDataFlashcardsLinksStore,
} from "@/state/data-flashcards-links-store";
import { cn } from "@/lib/core/utils";
import {
  cellToText,
  NON_STORING_COLUMN_TYPES,
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  columnWidthMin,
  createUndoStack,
  encodeCell,
  isEncodeError,
  deriveRowTitle,
  describeOp,
  diffRow,
  keyBetween,
  keyForMove,
  pushOp,
  generateColumnKey,
  optionMatchKey,
  titleCaseLabel,
  redo as redoStack,
  undo as undoStack,
  type CellEdit,
  type ColumnPref,
  type DataColumn,
  type DataColumnConfig,
  type DataRow,
  type DataTable,
  type ContentRef,
  type DataView,
  type RowData,
  type UndoExecutor,
  type UndoOp,
  type UndoStackState,
} from "@/lib/domain/data";
import {
  DataGridRow,
  INLINE_EDITABLE_TYPES,
  type CellSelectMods,
} from "./DataGridRow";
import { DataColumnHeader, DEFAULT_COLUMN_WIDTH } from "./DataColumnHeader";
import { usePressHold } from "./use-press-hold";
import { ContentPathBreadcrumb } from "../content/ContentPathBreadcrumb";
import {
  DATA_SCHEMA_CHANGED_EVENT,
  dispatchDataSchemaChanged,
  type DataSchemaChangedDetail,
} from "./events";
import { overwriteFileViaUpload, uploadFilesToTable } from "./file-upload";
import { AddColumnButton, AddColumnPanel, ColumnMenu } from "./DataColumnMenu";
import { DataColumnContextMenu, type ColumnContextMenuState } from "./DataColumnContextMenu";
import { HiddenColumnsButton } from "./HiddenColumnsButton";
import { DataViewBar, type ViewPatch } from "./DataViewBar";
import { CHECKED_GROUP, DataBoardView } from "./DataBoardView";
import { DataListView } from "./DataListView";
import { DataFormView } from "./DataFormView";
import { DataGalleryView } from "./DataGalleryView";
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
  /** Owner-only affordances (option creation) key off this, matching the
   * server's canAlterSchema — strictly stronger than canWrite. */
  canAlterSchema: boolean;
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
    canAlterSchema: false,
    loading: true,
    error: null,
  });
  const [stack, setStack] = useState<UndoStackState>(createUndoStack);
  /**
   * The grid's ONE status surface (the banner under the header): saves that
   * failed, "⌘Z to undo" confirmations, copies — and, with an `action`, an
   * inline Undo for what ⌘Z doesn't cover (column deletes). Owner,
   * 2026-10-09: a toast for column deletes beside this banner for everything
   * else was two surfaces for one job.
   */
  const [notice, setNotice] = useState<
    string | { text: string; action?: { label: string; run: () => void } } | null
  >(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  /** Right-click menu on a column (header or any cell). */
  const [columnMenu, setColumnMenu] = useState<ColumnContextMenuState | null>(null);
  /** "Insert column left/right": the add form, open on that column's header. */
  const [insertAt, setInsertAt] = useState<{
    columnId: string;
    side: "left" | "right";
  } | null>(null);
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{
    rowId: string;
    columnKey: string;
  } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    rowId: string;
    columnKey: string;
  } | null>(null);
  /**
   * Multi-cell selection (owner ask, 2026-09-28): `selectedCell` is the
   * ANCHOR; a ⇧-click or a drag sets the focus corner of a rectangle;
   * ⌘/Ctrl-click toggles single cells in `extraCells` (keyed rowId␀colKey).
   * ⌘C copies the block as tab-separated text.
   */
  const [rangeFocus, setRangeFocus] = useState<{
    rowId: string;
    columnKey: string;
  } | null>(null);
  const [extraCells, setExtraCells] = useState<Set<string>>(new Set());
  /** True between a cell mousedown and the next mouseup — text selection is
   * suppressed on the grid while a drag-select is in flight. */
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const dragSelectingRef = useRef(false);
  /** Last checkbox toggled — the far end of a ⇧-click row range. */
  const lastToggledRowRef = useRef<string | null>(null);
  const [peekRowId, setPeekRowId] = useState<string | null>(null);
  const [peekFocusColumnId, setPeekFocusColumnId] = useState<string | null>(null);
  /**
   * A peek opened by click-and-HOLD on a row stays put (owner, 2026-10-09);
   * one opened by a click or double-click is dismissed by clicking away.
   */
  const [peekPinned, setPeekPinned] = useState(false);
  /**
   * One-click editing (owner, 2026-10-09): the first cell edit takes a
   * double-click; after that a single click edits, until Esc or a click
   * outside the grid's cells (header, toolbar, another pane).
   */
  const [clickEditArmed, setClickEditArmed] = useState(false);
  const armClickEdit = useCallback(() => setClickEditArmed(true), []);
  useEffect(() => {
    if (!clickEditArmed) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest("[data-db-panel]")) return; // working in an editor
      const cell = target.closest("[data-column-key]");
      if (cell && rootRef.current?.contains(cell)) return;
      setClickEditArmed(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClickEditArmed(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [clickEditArmed]);
  /** Bumped on every grid-"+" click so a field's auto-open can re-fire even
   * when the peek (and the target column's focus) is already in place —
   * an initializer-only read misses that case entirely. */
  const [peekFocusToken, setPeekFocusToken] = useState(0);
  /** Title rename: null = viewing. The override shows the committed rename
   * until the prop refreshes through the content-updated event round trip. */
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    columnId: string;
    side: "left" | "right";
  } | null>(null);
  /** Live widths during/after a resize drag, keyed by column id. Cleared on
   * view switch so each view shows its own stored prefs. */
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>(
    {}
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  /** The viewer's own root — the click-away scope for the overlay peek. */
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * Stable per-mount id, so undo entries can be attributed to this client
   * when a durable log lands later. `useId()` rather than `crypto.randomUUID()`
   * — the latter is an impure call during render, which is the pattern that
   * produced the OnlyOfficeEditor iframe-reload bug (CLAUDE.md, Apr 2026).
   */
  const clientId = useId();

  // Gates the "create flashcard deck" header button; hoisted above the
  // loading/error early returns per rules-of-hooks.
  const flashcardsEnabled = useIsExtensionEnabled(FLASHCARDS_EXTENSION_ID);

  // Auto-sync any flashcard decks derived from this table (links live in
  // user settings; the server no-ops when none exist or nothing changed).
  // Fire-and-forget — viewing a table never waits on deck reconciliation —
  // but when the sync DID reconcile something, broadcast the change so an
  // open flashcards panel refreshes its lists and counts.
  useEffect(() => {
    if (!flashcardsEnabled) return;
    useDataFlashcardsLinksStore.getState().ensureLoaded();
    void fetch("/api/flashcards/from-data/sync", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId: contentId }),
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          data?: { created?: number; updated?: number };
        };
        if ((json.data?.created ?? 0) + (json.data?.updated ?? 0) > 0) {
          window.dispatchEvent(new CustomEvent(FLASHCARD_CHANGED_EVENT));
        }
      })
      .catch(() => {});
  }, [contentId, flashcardsEnabled]);

  const tableLinked = useDataFlashcardsLinksStore((s) =>
    Boolean(findTableLink(s.links, contentId)),
  );

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

  /** Every live column — filters, sorts, the peek and the other views. */
  const allColumns = useMemo(
    () => state.table?.columns.filter((c) => !c.deletedAt) ?? [],
    [state.table]
  );
  /**
   * The columns the GRID shows: hiding is a per-VIEW choice (owner,
   * 2026-10-09 — `columnPrefs[id].hidden`), never a schema change. Other
   * views and the row peek keep every field.
   */
  const gridMode = !state.view || state.view.mode === "grid" || state.view.mode === "split";
  const columns = useMemo(
    () =>
      gridMode
        ? allColumns.filter((c) => !state.view?.columnPrefs?.[c.id]?.hidden)
        : allColumns,
    [allColumns, gridMode, state.view]
  );
  const hiddenColumns = useMemo(
    () => allColumns.filter((c) => state.view?.columnPrefs?.[c.id]?.hidden),
    [allColumns, state.view]
  );

  // Effective widths: the view's stored prefs overlaid with live drag
  // values. One memoized map, so the memo()'d rows only re-render when a
  // width actually changes.
  const columnWidths = useMemo(() => {
    const map: Record<string, number> = {};
    for (const column of columns) {
      map[column.id] =
        widthOverrides[column.id] ??
        state.view?.columnPrefs?.[column.id]?.width ??
        DEFAULT_COLUMN_WIDTH;
    }
    return map;
  }, [columns, state.view, widthOverrides]);

  // Each view keeps its own widths — switching views drops the overrides
  // (they equal the stored prefs after a successful persist anyway).
  const activeViewIdForWidths = state.view?.id ?? null;
  useEffect(() => {
    setWidthOverrides({});
  }, [activeViewIdForWidths]);

  /** Geometry of an in-flight resize drag. A ref, not state — pointermove
   * only re-renders through the width it changes. */
  const resizeRef = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
    latest: number;
  } | null>(null);

  const persistColumnWidth = useCallback(
    async (columnId: string, width: number) => {
      const view = viewRef.current;
      if (!view) return;
      // Replaced wholesale server-side (like `config`), so spread the
      // loaded map and overlay this column's width.
      const merged: Record<string, ColumnPref> = {
        ...view.columnPrefs,
        [columnId]: { ...view.columnPrefs?.[columnId], width },
      };
      const res = await fetch(`/api/content/data/${contentId}/views`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewId: view.id, columnPrefs: merged }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        // Fold into local view state instead of reloading — the override
        // already shows it; future merges start from the stored map.
        setState((cur) =>
          cur.view && cur.view.id === view.id
            ? { ...cur, view: { ...cur.view, columnPrefs: merged } }
            : cur
        );
      } else {
        // Locked view, lost access, network — revert to the stored width.
        setWidthOverrides((cur) => {
          const next = { ...cur };
          delete next[columnId];
          return next;
        });
        setNotice(json?.error?.message ?? "Could not save the column width");
      }
    },
    [contentId]
  );

  /**
   * Hide / show columns IN THIS VIEW (owner, 2026-10-09). Stored on the
   * view's columnPrefs, so another view of the same table is untouched, and
   * nothing about the schema or the data changes. Optimistic; a refused save
   * (locked view, lost access) reverts and says so.
   */
  const setColumnsHidden = useCallback(
    async (ids: string[], hidden: boolean, opts?: { quiet?: boolean }) => {
      const view = viewRef.current;
      if (!view || ids.length === 0) return;
      const before = view.columnPrefs ?? {};
      const merged: Record<string, ColumnPref> = { ...before };
      for (const id of ids) {
        const next: ColumnPref = { ...before[id] };
        if (hidden) next.hidden = true;
        else delete next.hidden;
        merged[id] = next;
      }
      const apply = (prefs: Record<string, ColumnPref>) =>
        setState((cur) =>
          cur.view && cur.view.id === view.id
            ? { ...cur, view: { ...cur.view, columnPrefs: prefs } }
            : cur
        );
      apply(merged);
      setSelectedCell(null);
      setRangeFocus(null);
      setColumnMenu(null);
      const res = await fetch(`/api/content/data/${contentId}/views`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewId: view.id, columnPrefs: merged }),
      }).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !json?.success) {
        apply(before);
        setNotice(json?.error?.message ?? "Could not change which columns this view shows");
        return;
      }
      if (opts?.quiet) return;
      const n = ids.length;
      const what = n === 1 ? "1 column" : `${n} columns`;
      setNotice({
        text: hidden
          ? `Hid ${what} in the “${view.name}” view — other views still show ${n === 1 ? "it" : "them"}.`
          : `Showing ${what} again.`,
        action: {
          label: "Undo",
          run: () => {
            setNotice(null);
            void setColumnsHidden(ids, !hidden, { quiet: true });
          },
        },
      });
    },
    [contentId]
  );

  const handleResizeStart = useCallback(
    (e: React.PointerEvent, columnId: string) => {
      const startWidth = columnWidths[columnId] ?? DEFAULT_COLUMN_WIDTH;
      // Chip-list columns floor higher than COLUMN_WIDTH_MIN: their cells
      // COMPRESS instead of clipping, so a 60px relation column renders
      // single letters rather than a truncated list (owner, 2026-09-15).
      const column = columns.find((c) => c.id === columnId);
      const floor = column ? columnWidthMin(column) : COLUMN_WIDTH_MIN;
      resizeRef.current = {
        columnId,
        startX: e.clientX,
        startWidth,
        latest: startWidth,
      };
      const onMove = (ev: PointerEvent) => {
        const r = resizeRef.current;
        if (!r) return;
        const width = Math.round(
          Math.max(
            floor,
            Math.min(COLUMN_WIDTH_MAX, r.startWidth + (ev.clientX - r.startX))
          )
        );
        if (width === r.latest) return;
        r.latest = width;
        setWidthOverrides((cur) => ({ ...cur, [r.columnId]: width }));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const r = resizeRef.current;
        resizeRef.current = null;
        if (r && r.latest !== r.startWidth) {
          void persistColumnWidth(r.columnId, r.latest);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [columns, columnWidths, persistColumnWidth]
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

  // ?row= is meaningful only while THIS viewer owns the URL. Every
  // departure to a node must strip it, or the param outlives the table:
  // the next mount consumes the stale value and — for a promoted row —
  // "canonically" redirects right back to the note, making the page's
  // breadcrumb flash to the database and bounce (owner report,
  // 2026-08-26). The content-store URL sync preserves foreign params, so
  // nothing else will clean it up.
  // Node-affecting database mutations announce themselves the way every
  // other surface does (owner report, 2026-08-26): `content-updated`
  // patches a title in place; `dg:tree-refresh` refetches after promotion
  // creates/revives a node or a delete takes one with it. Without these
  // the tree and open tabs go stale until a manual refresh.
  const refreshTree = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
  }, []);

  const clearRowParam = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("row")) return;
    url.searchParams.delete("row");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

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
        canAlterSchema: json.data.accessLevel === "owner",
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

  // ?row= addressability (plan Phase 5): a copied link reopens this row.
  // Promoted rows resolve to their NODE — once a page exists it is the
  // canonical surface (it carries the breadcrumb back here), so the link
  // follows the row's graduation instead of reopening the lesser peek.
  // Un-promoted rows open as the peek. The first data pass consumes the
  // inbound param BEFORE the mirror below may rewrite it; afterwards the
  // param simply follows peek state (replaceState — not a navigation).
  // A row beyond the loaded page or filtered out opens nothing (v1: no
  // row-by-id fetch path exists yet).
  const rowUrlInitRef = useRef(false);
  useEffect(() => {
    if (!rowUrlInitRef.current) {
      if (state.loading || !state.table) return;
      rowUrlInitRef.current = true;
      const fromUrl = new URLSearchParams(window.location.search).get("row");
      if (fromUrl) {
        const row = state.rows.find((r) => r.id === fromUrl);
        if (row?.contentId) {
          clearRowParam();
          selectNode(row.contentId, { contentType: "note" });
          return;
        }
        if (row) {
          setPeekRowId(row.id);
          return;
        }
      }
    }
    const url = new URL(window.location.href);
    if (peekRowId) url.searchParams.set("row", peekRowId);
    else url.searchParams.delete("row");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [state.loading, state.table, state.rows, peekRowId, selectNode, clearRowParam]);

  // ── Poll ───────────────────────────────────────────────────────────────
  //
  // Goes through the shared scheduler, which owns BOTH the hidden and the idle
  // gate. It used to run its own self-rescheduling setTimeout with a bare
  // `document.hidden` check — pre-idle-gating semantics, so a table sitting
  // open and untouched polled every 10s indefinitely. Being a setTimeout rather
  // than a setInterval, it was also invisible to `polling:check`.
  //
  // `serverTime` is read through a ref so this effect depends only on the
  // content id. Reading it from state would re-run the effect on every
  // successful poll (each one advances serverTime), unregistering and
  // re-registering the task on every tick.

  const serverTimeRef = useRef<string | null>(null);
  useEffect(() => {
    serverTimeRef.current = state.serverTime;
  }, [state.serverTime]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const since = serverTimeRef.current;
      // No baseline yet: the initial load has not landed, so there is nothing
      // to ask for changes since.
      if (cancelled || !since) return;
      try {
        const res = await fetch(
          `/api/content/data/${contentId}/rows?since=${encodeURIComponent(since)}`,
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

    const taskId = `data-rows:${contentId}`;
    const unregister = registerPollingTask({
      id: taskId,
      intervalMs: POLL_MS,
      run: poll,
    });

    // Catch up in one request when the user comes back, rather than waiting out
    // a full interval. Safe to pause in between because the `since` cursor
    // means nothing is lost — the next poll asks for everything that changed
    // while we were quiet.
    const unsubscribe = subscribeEngagement((engagement) => {
      if (engagement === "active") runPollingTaskNow(taskId);
    });

    return () => {
      cancelled = true;
      unregister();
      unsubscribe();
    };
  }, [contentId, load]);

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
      const column = state.table?.columns.find((c) => c.key === columnKey);

      // Encode client-side with the SAME pure encoder the server runs
      // (cells.ts is client-safe by design): the optimistic cell shows the
      // normalized value — https://-upgraded URLs, ISO dates, rounded
      // numbers — immediately instead of after the next 10s poll (owner
      // report, 2026-08-31), and a validation failure rejects instantly
      // with the server's exact wording, no round trip. The server still
      // re-encodes; the encoders are idempotent on their own output.
      let outbound = value;
      if (column) {
        const encoded = encodeCell(column, value);
        if (isEncodeError(encoded)) {
          setNotice(`Could not save — ${encoded.error}`);
          return;
        }
        outbound = encoded.value;
      }

      const before: RowData = row.data;
      const optimistic: RowData = { ...before };
      if (outbound === undefined || outbound === null || outbound === "") {
        delete optimistic[columnKey];
      } else {
        optimistic[columnKey] = outbound as RowData[string];
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

      // Person and content-link cells store ids but DISPLAY server-hydrated
      // read-model (names, titles) — the optimistic merge above can only
      // show the raw id, which these renderers ignore. One reload fetches
      // the refs; without it the picker's choice looks like it never landed
      // (owner report, 2026-08-26).
      if (
        column &&
        (column.type === "person" ||
          column.type === "contentLink" ||
          column.type === "file")
      ) {
        void load(viewRef.current?.id ?? null);
      }

      // Title sync, client half: the server renames the promoted node in
      // writeCells; the tree label and any open tab hear it through the
      // same event every other rename travels on.
      if (column?.isPrimary && row.contentId && state.table) {
        window.dispatchEvent(
          new CustomEvent("content-updated", {
            detail: {
              contentId: row.contentId,
              updates: {
                title: deriveRowTitle(state.table.columns, optimistic),
              },
            },
          })
        );
      }
    },
    [state.rows, state.table, sendWrites, clientId, load]
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
          // Deletes cascade to promoted pages and restores revive them —
          // either way the tree changed. (Unconditional: restored rows are
          // not in client state to check for contentId.)
          refreshTree();
          await load(state.view?.id ?? null);
          return { status: "applied" };
        }
        default:
          return { status: "failed", detail: "not undoable yet" };
      }
    },
    [contentId, sendWrites, load, state.view, refreshTree]
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
    // The cascade just took any promoted pages with it.
    if (rowIds.some((id) => state.rows.find((r) => r.id === id)?.contentId)) {
      refreshTree();
    }
    setSelectedRows(new Set());
    setNotice(`${describeOp(op)} deleted · ⌘Z to undo`);
    await load(state.view?.id ?? null);
  }, [contentId, selectedRows, load, clientId, state.view, state.rows, refreshTree]);

  /**
   * Duplicate the checked rows in place (owner ask, 2026-09-28). The server
   * lands each copy directly below its source with every stored cell and
   * its forward relation links; the copies become the selection so a
   * follow-up action (edit, delete, duplicate again) targets them, and one
   * undo removes them all.
   */
  const duplicateSelected = useCallback(async () => {
    if (selectedRows.size === 0) return;
    // Display order, so the copies interleave the way the grid shows them.
    const sourceIds = state.rows
      .filter((r) => selectedRows.has(r.id))
      .map((r) => r.id);
    const res = await fetch(`/api/content/data/${contentId}/rows`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicateRowIds: sourceIds }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { rowIds?: string[] };
    };
    const rowIds = json.data?.rowIds ?? [];
    if (!res.ok || !json.success || rowIds.length === 0) {
      setNotice("Could not duplicate");
      return;
    }
    const n = rowIds.length;
    const op: UndoOp = {
      kind: "addRows",
      rowIds,
      label: n === 1 ? "duplicated row" : `${n} duplicated rows`,
    };
    setStack((s) => pushOp(s, op, clientId, Date.now()));
    setSelectedRows(new Set(rowIds));
    setNotice(`Duplicated ${n} row${n === 1 ? "" : "s"} · ⌘Z to undo`);
    await load(state.view?.id ?? null);
  }, [contentId, selectedRows, state.rows, load, clientId, state.view]);

  // Form view submission (plan O13): one fresh row, its cells written in a
  // single unconditional batch (no CAS — nothing existed before), then a
  // reload so the new row appears when the user switches back to the grid.
  const submitFormRow = useCallback(
    async (cells: Record<string, unknown>): Promise<boolean> => {
      const res = await fetch(`/api/content/data/${contentId}/rows`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data.rowIds?.[0]) {
        setNotice("Could not add the row");
        return false;
      }
      const rowId: string = json.data.rowIds[0];
      const edits: CellEdit[] = Object.entries(cells).map(
        ([columnKey, value]) => ({
          rowId,
          columnKey,
          after: value as CellEdit["after"],
          before: undefined,
        })
      );
      if (edits.length > 0) {
        const write = await sendWrites(edits, false);
        if (!write.ok) {
          setNotice(`Row added, but some fields failed — ${write.message}`);
        }
      }
      const op: UndoOp = { kind: "addRows", rowIds: [rowId], label: "" };
      setStack((s) =>
        pushOp(s, { ...op, label: describeOp(op) }, clientId, Date.now())
      );
      void load(viewRef.current?.id ?? null);
      return true;
    },
    [contentId, sendWrites, clientId, load]
  );

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
      // Tell the context rail (right sidebar) the schema moved under it.
      dispatchDataSchemaChanged(contentId, "grid");
      return true;
    },
    [contentId, load, state.view]
  );

  // Schema edits from OTHER surfaces (the context rail, an AI proposal
  // card) → reload the grid. Own dispatches are skipped — the grid already
  // reloads after its own mutations.
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<DataSchemaChangedDetail>).detail;
      if (detail?.tableId !== contentId || detail.source === "grid") return;
      void load(viewRef.current?.id ?? null);
    };
    window.addEventListener(DATA_SCHEMA_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(DATA_SCHEMA_CHANGED_EVENT, onChanged);
  }, [contentId, load]);

  const addColumn = useCallback(
    async (input: {
      name: string;
      type: DataColumn["type"];
      config?: DataColumn["config"];
      createBacklink?: boolean;
    }) => {
      await columnRequest("POST", input);
    },
    [columnRequest]
  );

  const saveColumn = useCallback(
    async (
      columnId: string,
      patch: {
        name: string;
        description: string | null;
        config?: DataColumnConfig;
      }
    ) => {
      await columnRequest("PATCH", { columnId, ...patch });
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
        // Checkbox boards pass synthetic group ids — stamp the boolean.
        // Explicit false matters: a defaultChecked column would otherwise
        // bounce a row added under "Unchecked" into the Checked group.
        const after =
          groupCol.type === "checkbox"
            ? optionId === CHECKED_GROUP
            : optionId;
        await sendWrites(
          [{ rowId: rowIds[0], columnKey: groupCol.key, before: undefined, after }],
          false
        );
      }
      await load(state.view?.id ?? null);
    },
    [contentId, columns, state.view, sendWrites, load, clientId]
  );

  const effectiveTitle = titleOverride ?? title;

  /**
   * Rename the database from its own header — double-click, like a note's
   * title. The PATCH renames the ContentNode; the content-updated event is
   * the same hook every other rename travels on, so the file tree label
   * and any open tab follow without bespoke wiring.
   */
  const commitTitle = useCallback(async () => {
    const draft = titleDraft?.trim();
    setTitleDraft(null);
    if (!draft || draft === effectiveTitle) return;
    const res = await fetch(`/api/content/content/${contentId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: draft }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.success === false) {
      setNotice(json?.error?.message ?? "Could not rename the database");
      return;
    }
    setTitleOverride(draft);
    window.dispatchEvent(
      new CustomEvent("content-updated", {
        detail: { contentId, updates: { title: draft } },
      })
    );
  }, [titleDraft, effectiveTitle, contentId]);

  /**
   * Create one select/status/multiSelect option from a ROW editor — the
   * "just type it" path, so adding a category doesn't mean a detour
   * through the column menu. Dedupes case-insensitively (returns the
   * existing option rather than minting a twin); goes through the same
   * columns PATCH as the menu, so the rail hears about it too.
   */
  const createOption = useCallback(
    async (column: DataColumn, label: string) => {
      const raw = label.trim().slice(0, 120);
      if (!raw) return null;
      // Title Case normalises on the way in; otherwise a free-form column
      // preserves case, so `how` beside `How` is a second option rather
      // than a silent reuse that retitles what the user typed.
      const trimmed = column.config.titleCase ? titleCaseLabel(raw) : raw;
      const key = optionMatchKey(trimmed, column.config);
      const existing = (column.config.options ?? []).find(
        (o) => optionMatchKey(o.label, column.config) === key
      );
      if (existing) return existing;
      const option = {
        id: generateColumnKey(),
        label: trimmed,
        ...(column.type === "status" ? { group: "todo" as const } : {}),
      };
      const done = await columnRequest("PATCH", {
        columnId: column.id,
        config: {
          ...column.config,
          options: [...(column.config.options ?? []), option],
        },
      });
      return done ? option : null;
    },
    [columnRequest]
  );

  /**
   * Upload OS files straight into a File cell — the grid's drop target
   * and paste both land here, sharing the peek's upload path (files
   * become nodes under the database, then link into the cell).
   */
  /** Bumped after an in-place overwrite so cached image streams re-fetch
   * (the download stream carries an hour of private cache). */
  const [imageVersion, setImageVersion] = useState(0);

  const uploadIntoFileCell = useCallback(
    async (rowId: string, column: DataColumn, files: FileList | File[]) => {
      if (!canEditData) return;
      // Images columns accept images only — filtered here so a mixed drop
      // degrades to "images attached, N skipped" instead of a rejection.
      let list = Array.from(files);
      let skippedNonImages = 0;
      if (column.config.imageOnly) {
        const images = list.filter((f) => f.type.startsWith("image/"));
        skippedNonImages = list.length - images.length;
        list = images;
        if (list.length === 0) {
          setNotice("This column accepts images only");
          return;
        }
      }

      // Collision prompt (owner approval, 2026-08-31): a dropped file whose
      // name matches an attached one offers overwrite-in-place — same node
      // id, every referencer sees the new version — instead of silently
      // stacking "name (1)" twins.
      const row = state.rows.find((r) => r.id === rowId);
      const refs = row?.contentRefs?.[column.id] ?? [];
      const toCreate: File[] = [];
      let overwritten = 0;
      for (const f of list) {
        const match = refs.find((r) => !r.restricted && r.title === f.name);
        if (
          match &&
          window.confirm(
            `"${f.name}" is already attached — overwrite it?\n\nOK replaces the file everywhere it's referenced. Cancel keeps both.`
          )
        ) {
          setNotice(`Overwriting ${f.name}…`);
          const res = await overwriteFileViaUpload(match.id, f);
          if (res.error) {
            setNotice(`Overwrite failed — ${res.error}`);
            return;
          }
          overwritten++;
        } else {
          toCreate.push(f);
        }
      }

      let uploaded: string[] = [];
      let errors: string[] = [];
      if (toCreate.length > 0) {
        setNotice(
          `Uploading ${toCreate.length} file${toCreate.length === 1 ? "" : "s"}…`
        );
        ({ ids: uploaded, errors } = await uploadFilesToTable(
          contentId,
          toCreate
        ));
        if (uploaded.length === 0 && overwritten === 0) {
          setNotice(`Upload failed — ${errors[0] ?? "nothing was attached"}`);
          return;
        }
        if (uploaded.length > 0) {
          const current = Array.isArray(row?.data[column.key])
            ? (row.data[column.key] as string[])
            : [];
          const merged = [
            ...current,
            ...uploaded.filter((id) => !current.includes(id)),
          ];
          await commitCell(rowId, column.key, merged);
        }
      }
      if (overwritten > 0) {
        setImageVersion(Date.now());
        void load(viewRef.current?.id ?? null);
      }

      const parts: string[] = [];
      if (uploaded.length > 0) {
        parts.push(
          `Attached ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}`
        );
      }
      if (overwritten > 0) {
        parts.push(`overwrote ${overwritten}`);
      }
      if (skippedNonImages > 0) parts.push(`${skippedNonImages} non-image skipped`);
      if (errors.length > 0) parts.push(`${errors.length} failed — ${errors[0]}`);
      setNotice(parts.join(" · ") || null);
    },
    [canEditData, contentId, state.rows, commitCell, load]
  );

  // Paste into a SELECTED File cell — the keyboard's drop. Skipped while
  // typing in any input so ordinary pasting is never hijacked (same guard
  // as ⌘C above).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!selectedCell || !canEditData) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      const column = columns.find((c) => c.key === selectedCell.columnKey);
      if (column?.type !== "file") return;
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      void uploadIntoFileCell(selectedCell.rowId, column, files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectedCell, canEditData, columns, uploadIntoFileCell]);

  /**
   * Check/uncheck every loaded row in ONE batch — one PATCH (the route
   * takes up to 1000 writes; a page is ≤100), one optimistic pass, one
   * setCells undo entry so ⌘Z reverts the whole sweep.
   */
  const bulkSetCheckbox = useCallback(
    async (column: DataColumn, value: boolean) => {
      const edits: CellEdit[] = [];
      for (const row of state.rows) {
        if ((row.data[column.key] === true) === value) continue;
        edits.push({
          rowId: row.id,
          columnKey: column.key,
          before: row.data[column.key],
          after: value,
        });
      }
      if (edits.length === 0) {
        setNotice(value ? "Every row is already checked" : "No rows are checked");
        return;
      }
      const editIds = new Set(edits.map((e) => e.rowId));
      setState((s) => ({
        ...s,
        rows: s.rows.map((r) =>
          editIds.has(r.id)
            ? { ...r, data: { ...r.data, [column.key]: value } }
            : r
        ),
      }));
      const result = await sendWrites(edits, false);
      if (!result.ok) {
        await load(viewRef.current?.id ?? null);
        setNotice(`Could not update — ${result.message}`);
        return;
      }
      const op: UndoOp = { kind: "setCells", edits, label: "" };
      setStack((s) =>
        pushOp(s, { ...op, label: describeOp(op) }, clientId, Date.now())
      );
      setNotice(
        `${value ? "Checked" : "Unchecked"} ${edits.length} row${edits.length === 1 ? "" : "s"}`
      );
    },
    [state.rows, sendWrites, load, clientId]
  );

  // ── Cell keyboard model (owner friction, 2026-08-24) ───────────────────

  const cellKey = (rowId: string, columnKey: string) => `${rowId}\u0000${columnKey}`;

  const selectCell = useCallback(
    (rowId: string, columnKey: string, mods?: CellSelectMods) => {
      setEditTarget(null);
      if (mods?.shift && selectedCell) {
        // Extend the rectangle from the anchor; adds stay.
        setRangeFocus({ rowId, columnKey });
        return;
      }
      if (mods?.meta && selectedCell) {
        // Toggle one cell; the anchor joins the set the first time so the
        // block the user sees is the block ⌘C copies.
        setExtraCells((prev) => {
          const next = new Set(prev);
          next.add(cellKey(selectedCell.rowId, selectedCell.columnKey));
          const k = cellKey(rowId, columnKey);
          if (next.has(k)) next.delete(k);
          else next.add(k);
          return next;
        });
        return;
      }
      setSelectedCell({ rowId, columnKey });
      setRangeFocus(null);
      setExtraCells(new Set());
      // A plain mousedown may become a drag: cells entered until mouseup
      // extend the rectangle from this anchor.
      dragSelectingRef.current = true;
      setIsDragSelecting(true);
    },
    [selectedCell]
  );

  /**
   * Header click (owner, 2026-10-09): the whole column, as the same
   * rectangle a drag would make — so ⌘C, Delete and the highlight all work
   * unchanged. Spans the LOADED rows (the grid pages in as it scrolls).
   */
  /**
   * The columns a column selection covers (header click, ⇧-click another
   * header to span) — a rectangle running the full loaded height. Empty when
   * the selection is anything else (a cell, a partial block).
   */
  const selectedColumnIds = useMemo(() => {
    if (!selectedCell || state.rows.length === 0) return [] as string[];
    const firstId = state.rows[0].id;
    const lastId = state.rows[state.rows.length - 1].id;
    const focus = rangeFocus ?? selectedCell;
    const fullHeight =
      (selectedCell.rowId === firstId && focus.rowId === lastId) ||
      (selectedCell.rowId === lastId && focus.rowId === firstId);
    if (!fullHeight || extraCells.size > 0) return [];
    const a = columns.findIndex((c) => c.key === selectedCell.columnKey);
    const b = columns.findIndex((c) => c.key === focus.columnKey);
    if (a < 0 || b < 0) return [];
    return columns.slice(Math.min(a, b), Math.max(a, b) + 1).map((c) => c.id);
  }, [selectedCell, rangeFocus, extraCells, columns, state.rows]);

  const selectColumn = useCallback(
    (columnId: string, mods?: { shift?: boolean }) => {
      const column = columns.find((c) => c.id === columnId);
      const first = state.rows[0];
      const last = state.rows[state.rows.length - 1];
      setOpenColumnId(null);
      if (!column || !first || !last) return;
      setEditTarget(null);
      setExtraCells(new Set());
      // ⇧-click a second header: span from the selected column(s) to here.
      const anchorKey =
        mods?.shift && selectedCell && selectedColumnIds.length > 0
          ? selectedCell.columnKey
          : column.key;
      setSelectedCell({ rowId: first.id, columnKey: anchorKey });
      setRangeFocus(
        last.id === first.id && anchorKey === column.key
          ? null
          : { rowId: last.id, columnKey: column.key }
      );
    },
    [columns, state.rows, selectedCell, selectedColumnIds]
  );

  // ── Column context menu (owner, 2026-10-09) ────────────────────────────

  /** Right-click on a header or cell. Editors only; others get the browser's menu. */
  const openColumnMenu = useCallback(
    (e: React.MouseEvent, columnId: string) => {
      if (!canEditData) return;
      e.preventDefault();
      // A click outside the current column selection acts on that column:
      // select it, so what the menu deletes is what the user sees.
      if (!selectedColumnIds.includes(columnId)) selectColumn(columnId);
      setOpenColumnId(null);
      setColumnMenu({ columnId, x: e.clientX, y: e.clientY });
    },
    [canEditData, selectedColumnIds, selectColumn]
  );

  /** What the menu's Delete acts on: the selection, or the clicked column. */
  const menuDeleteIds = useMemo(() => {
    if (!columnMenu) return [] as string[];
    return selectedColumnIds.includes(columnMenu.columnId)
      ? selectedColumnIds
      : [columnMenu.columnId];
  }, [columnMenu, selectedColumnIds]);

  const menuDeleteBlocked = useMemo(() => {
    const targets = columns.filter((c) => menuDeleteIds.includes(c.id));
    if (targets.some((c) => c.isPrimary)) return "The title column can't be deleted";
    if (targets.some((c) => c.config?.system === true))
      return "System columns are locked — part of the charter's ledger machinery";
    return null;
  }, [columns, menuDeleteIds]);

  /** The new column's key: right beside the clicked one, on the chosen side. */
  const insertPosition = useCallback(
    (columnId: string, side: "left" | "right") => {
      const i = columns.findIndex((c) => c.id === columnId);
      if (i < 0) return undefined;
      return side === "left"
        ? keyBetween(columns[i - 1]?.position ?? null, columns[i].position)
        : keyBetween(columns[i].position, columns[i + 1]?.position ?? null);
    },
    [columns]
  );

  /**
   * Delete one or several columns — soft deletes, so values survive and the
   * toast's Undo is a metadata flip (DELETE {restore}). One reload at the end,
   * not one per column.
   */
  const deleteColumns = useCallback(
    async (ids: string[]) => {
      const names = columns.filter((c) => ids.includes(c.id)).map((c) => c.name);
      const send = (columnId: string, restore = false) =>
        fetch(`/api/content/data/${contentId}/columns`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(restore ? { columnId, restore: true } : { columnId }),
        })
          .then(async (res) => ({ ok: res.ok && (await res.json())?.success === true }))
          .catch(() => ({ ok: false }));
      const deleted: string[] = [];
      for (const id of ids) {
        if ((await send(id)).ok) deleted.push(id);
      }
      setOpenColumnId(null);
      setSelectedCell(null);
      setRangeFocus(null);
      await load(state.view?.id ?? null);
      dispatchDataSchemaChanged(contentId, "grid");
      if (deleted.length === 0) {
        setNotice(ids.length === 1 ? "That column could not be deleted." : "Those columns could not be deleted.");
        return;
      }
      const what =
        deleted.length === 1
          ? `Column "${names[ids.indexOf(deleted[0])] ?? ""}"`
          : `${deleted.length} columns`;
      setNotice({
        text:
          `${what} deleted — values are kept.` +
          (deleted.length < ids.length
            ? ` ${ids.length - deleted.length} could not be deleted.`
            : ""),
        action: {
          label: "Undo",
          run: () => {
            setNotice(null);
            void (async () => {
              for (const id of deleted) await send(id, true);
              await load(viewRef.current?.id ?? null);
              dispatchDataSchemaChanged(contentId, "grid");
              setNotice(`${what} restored.`);
            })();
          },
        },
      });
    },
    [columns, contentId, load, state.view]
  );


  const hoverCell = useCallback((rowId: string, columnKey: string) => {
    if (!dragSelectingRef.current) return;
    setRangeFocus((prev) =>
      prev?.rowId === rowId && prev.columnKey === columnKey
        ? prev
        : { rowId, columnKey }
    );
  }, []);

  useEffect(() => {
    const end = () => {
      if (!dragSelectingRef.current) return;
      dragSelectingRef.current = false;
      setIsDragSelecting(false);
      // A drag that never left its cell is a click — no rectangle.
      setRangeFocus((prev) =>
        prev && selectedCell && prev.rowId === selectedCell.rowId && prev.columnKey === selectedCell.columnKey
          ? null
          : prev
      );
    };
    window.addEventListener("mouseup", end);
    return () => window.removeEventListener("mouseup", end);
  }, [selectedCell]);

  /**
   * Row id → column keys inside the selection, display order. Null when
   * only the anchor is selected (single-cell behaviour is untouched). A row
   * outside the block gets null, so memo'd rows re-render only on change.
   */
  const rangeByRow = useMemo(() => {
    if (!selectedCell) return null;
    const rowIndex = new Map(state.rows.map((r, i) => [r.id, i] as const));
    const colIndex = new Map(columns.map((c, i) => [c.key, i] as const));
    const cells = new Map<string, Set<string>>();
    const add = (rowId: string, key: string) => {
      const set = cells.get(rowId) ?? new Set<string>();
      set.add(key);
      cells.set(rowId, set);
    };
    if (rangeFocus) {
      const r1 = rowIndex.get(selectedCell.rowId);
      const r2 = rowIndex.get(rangeFocus.rowId);
      const c1 = colIndex.get(selectedCell.columnKey);
      const c2 = colIndex.get(rangeFocus.columnKey);
      if (r1 !== undefined && r2 !== undefined && c1 !== undefined && c2 !== undefined) {
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
          for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
            add(state.rows[r].id, columns[c].key);
          }
        }
      }
    }
    for (const k of extraCells) {
      const [rowId, key] = k.split("\u0000");
      if (rowIndex.has(rowId) && colIndex.has(key)) add(rowId, key);
    }
    let count = 0;
    for (const set of cells.values()) count += set.size;
    return count > 1 ? cells : null;
  }, [selectedCell, rangeFocus, extraCells, state.rows, columns]);

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
        // Select-likes open their option picker through the same forced-
        // edit remount the text editors use.
        if (
          column &&
          (INLINE_EDITABLE_TYPES.has(column.type) ||
            column.type === "select" ||
            column.type === "status" ||
            column.type === "multiSelect")
        ) {
          e.preventDefault();
          setEditTarget(selectedCell);
        }
      } else if (e.key === " ") {
        // Space toggles a selected checkbox cell — the keyboard's click.
        const column = columns.find((c) => c.key === selectedCell.columnKey);
        if (column?.type === "checkbox" && canEditData) {
          e.preventDefault();
          const row = state.rows.find((r) => r.id === selectedCell.rowId);
          if (row) {
            void commitCell(
              row.id,
              column.key,
              !(row.data[column.key] === true)
            );
          }
        }
      } else if (e.key === "Escape") {
        setSelectedCell(null);
        setRangeFocus(null);
        setExtraCells(new Set());
      } else if ((e.key === "Delete" || e.key === "Backspace") && canEditData) {
        // Clear the selected cell or block (owner ask, 2026-09-28) — one
        // batched CAS write, one undo entry. Computed and derived columns
        // have nothing to clear; already-empty cells are skipped so the
        // op (and its undo) is exactly the cells that changed.
        e.preventDefault();
        const targets: Array<{ rowId: string; columnKey: string }> = rangeByRow
          ? [...rangeByRow.entries()].flatMap(([rowId, keys]) =>
              [...keys].map((columnKey) => ({ rowId, columnKey }))
            )
          : [selectedCell];
        const edits: CellEdit[] = [];
        for (const t of targets) {
          const column = columns.find((c) => c.key === t.columnKey);
          const row = state.rows.find((r) => r.id === t.rowId);
          if (!column || !row) continue;
          if (NON_STORING_COLUMN_TYPES.includes(column.type)) continue;
          const before = row.data[column.key];
          if (before === undefined || before === "" || (Array.isArray(before) && before.length === 0)) continue;
          edits.push({ rowId: row.id, columnKey: column.key, before, after: undefined });
        }
        if (edits.length === 0) {
          setNotice("Nothing to clear");
          return;
        }
        void (async () => {
          const result = await sendWrites(edits, true);
          if (!result.ok) {
            setNotice(result.stale ? "Not cleared — a cell changed since you read it" : (result.message ?? "Could not clear"));
            return;
          }
          const op: UndoOp = { kind: "setCells", edits, label: "" };
          setStack((s) => pushOp(s, { ...op, label: `cleared ${edits.length} cell${edits.length === 1 ? "" : "s"}` }, clientId, Date.now()));
          setNotice(`Cleared ${edits.length} cell${edits.length === 1 ? "" : "s"} · ⌘Z to undo`);
          await load(state.view?.id ?? null);
        })();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCell, editTarget, columns, state.rows, canEditData, commitCell, rangeByRow, sendWrites, load, clientId, state.view]);

  // Delete / Backspace with rows CHECKED and no cell selected deletes the
  // rows — the keyboard's "Delete N" button, undoable the same way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedCell || editTarget || selectedRows.size === 0) return;
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
      e.preventDefault();
      void deleteSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCell, editTarget, selectedRows, deleteSelected]);

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
      // A multi-cell selection copies as a tab-separated block over its
      // bounding rectangle (cells outside the selection stay blank), so it
      // pastes straight into a spreadsheet. Relations and derived columns
      // copy as their display text — a title list, a computed value.
      if (rangeByRow) {
        e.preventDefault();
        const rowIdx = state.rows
          .map((r, i) => (rangeByRow.has(r.id) ? i : -1))
          .filter((i) => i >= 0);
        const colIdx = columns
          .map((c, i) => ([...rangeByRow.values()].some((s) => s.has(c.key)) ? i : -1))
          .filter((i) => i >= 0);
        const tsvCell = (text: string) =>
          /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        const lines: string[] = [];
        let count = 0;
        for (let r = Math.min(...rowIdx); r <= Math.max(...rowIdx); r++) {
          const row = state.rows[r];
          const members = rangeByRow.get(row.id);
          const cells: string[] = [];
          for (let c = Math.min(...colIdx); c <= Math.max(...colIdx); c++) {
            const column = columns[c];
            if (members?.has(column.key)) {
              count++;
              cells.push(tsvCell(cellDisplayValue(row, column)));
            } else {
              cells.push("");
            }
          }
          lines.push(cells.join("\t"));
        }
        void navigator.clipboard.writeText(lines.join("\n"));
        setNotice(`Copied ${count} cell${count === 1 ? "" : "s"} (${lines.length} row${lines.length === 1 ? "" : "s"})`);
        return;
      }
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
  }, [selectedCell, rangeByRow, columns, state.rows]);

  /** contentLink chip → the real node, in a workspace tab (plan Phase 4). */
  const openContent = useCallback(
    (ref: ContentRef) => {
      if (ref.restricted) return;
      clearRowParam();
      selectNode(ref.id, {
        contentType: ref.contentType,
        title: ref.title,
      });
    },
    [selectNode, clearRowParam]
  );

  /**
   * Deliberate promotion (plan Phase 5): the row becomes a real note —
   * role "primary", visible in the tree under the database — and opens in
   * a workspace tab. Idempotent server-side; an already-promoted row just
   * opens.
   */
  const openAsPage = useCallback(
    async (rowId: string) => {
      // Always through the promote endpoint — no contentId short-circuit.
      // It is idempotent and cheap, and it is also the recovery path: a
      // page deleted from the tree leaves row.contentId pointing at a
      // TRASHED node, which the server revives (body and tags intact)
      // where a client-side jump would open a dead page (owner report,
      // 2026-08-26).
      const res = await fetch(`/api/content/data/${contentId}/promote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, role: "primary" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice(json?.error?.message ?? "Could not open the row as a page");
        return;
      }
      setPeekRowId(null);
      clearRowParam();
      refreshTree();
      selectNode(json.data.contentId, { contentType: "note" });
      // Refresh so the row carries its contentId (the peek badge flips).
      void load(state.view?.id ?? null);
    },
    [contentId, state.view, selectNode, load, clearRowParam, refreshTree]
  );

  const openRow = useCallback(
    (rowId: string, focusColumnId?: string, options?: { pinned?: boolean }) => {
      if (isQuery) {
        // The row IS a note/file — open the real thing, never a row page.
        const row = state.rows.find((r) => r.id === rowId);
        clearRowParam();
        selectNode(rowId, {
          contentType: row?.nodeContentType ?? null,
          title: typeof row?.data.title === "string" ? row.data.title : null,
        });
        return;
      }
      setPeekRowId(rowId);
      setPeekFocusColumnId(focusColumnId ?? null);
      setPeekPinned(options?.pinned === true);
      if (focusColumnId) setPeekFocusToken((t) => t + 1);
      setEditTarget(null);
    },
    [isQuery, state.rows, selectNode, clearRowParam]
  );

  const rowHold = usePressHold<string>((rowId) => openRow(rowId, undefined, { pinned: true }));

  /**
   * Click-away dismissal for the OVERLAY peek — reaching for the ✕ every
   * time was friction (owner, 2026-08-31). Scoped to this viewer's root:
   * clicks in other panels/sidebars leave the peek open, and the peek's
   * portaled pickers live in document.body (outside the root), so
   * interacting with them never counts as "away". mousedown, so the
   * click's own action (cell select, +) still lands after the close.
   * The split variant is a pane, not an overlay — it never dismisses.
   */
  const overlayPeekOpen =
    peekRowId !== null && state.view?.mode !== "split" && !isQuery && !peekPinned;
  useEffect(() => {
    if (!overlayPeekOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const root = rootRef.current;
      if (!target || !root || !root.contains(target)) return;
      if (target.closest("[data-row-peek]")) return;
      setPeekRowId(null);
      setPeekFocusColumnId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [overlayPeekOpen]);

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

  const toggleRow = useCallback(
    (rowId: string, shiftKey?: boolean) => {
      const last = lastToggledRowRef.current;
      lastToggledRowRef.current = rowId;
      setSelectedRows((prev) => {
        const next = new Set(prev);
        // ⇧-click selects every row between the last toggled row and this
        // one (display order), like a file list — the range is ADDED, so a
        // second ⇧-click elsewhere grows the selection.
        if (shiftKey && last && last !== rowId) {
          const a = state.rows.findIndex((r) => r.id === last);
          const b = state.rows.findIndex((r) => r.id === rowId);
          if (a >= 0 && b >= 0) {
            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
              next.add(state.rows[i].id);
            }
            return next;
          }
        }
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      });
    },
    [state.rows]
  );

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
    <div ref={rootRef} className="relative flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {titleDraft !== null ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void commitTitle()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitTitle();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setTitleDraft(null);
                  }
                }}
                aria-label="Database title"
                // Same edit chrome as the note title: transparent with a
                // subtle bottom border, never a boxed input.
                className="min-w-0 flex-1 border-b border-primary/40 bg-transparent text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
              />
            ) : (
              <h2
                className={cn(
                  "truncate text-sm font-semibold",
                  state.canWrite && "cursor-text"
                )}
                title={state.canWrite ? "Double-click to rename" : undefined}
                onDoubleClick={
                  state.canWrite
                    ? () => setTitleDraft(effectiveTitle)
                    : undefined
                }
              >
                {effectiveTitle}
              </h2>
            )}
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {state.rows.length} {state.rows.length === 1 ? "row" : "rows"}
            </span>
          </div>
          {/* Same folder-path breadcrumb the note editor renders under its
              title — crumbs mirror a real file-tree selection. */}
          <ContentPathBreadcrumb
            contentId={contentId}
            currentTitle={effectiveTitle}
            currentContentType="data"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {flashcardsEnabled && (
            <button
              type="button"
              onClick={() =>
                useDataFlashcardsDialogStore
                  .getState()
                  .openDialog({ contentId, title })
              }
              title={
              tableLinked
                ? "Sync flashcard deck from this database"
                : "Create flashcard deck from this database"
            }
              className="rounded p-1.5 text-muted-foreground hover:bg-muted"
            >
              <Layers className="h-4 w-4" />
            </button>
          )}
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
          {selectedRows.size > 0 && canEditData && (
            <button
              type="button"
              onClick={duplicateSelected}
              title="Duplicate the selected rows below their originals"
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate {selectedRows.size}
            </button>
          )}
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
        columns={allColumns}
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
          columns={allColumns}
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
          // Amber, the repo's most neutral yellow (the template-warning
          // family) — a save that didn't land deserves warning weight, not
          // the muted grey that reads as a status line.
          className="border-b border-amber-300/60 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200"
        >
          {typeof notice === "string" ? notice : notice.text}
          {typeof notice !== "string" && notice.action && (
            <button
              type="button"
              onClick={notice.action.run}
              className="ml-2 font-medium underline"
            >
              {notice.action.label}
            </button>
          )}
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
            columns={allColumns}
            rows={state.rows}
            editable={canEditData}
            onCommitCell={commitCell}
            onAddRowInGroup={addRowInGroup}
            onOpenRow={openRow}
          />
        </div>
      ) : state.view?.mode === "list" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DataListView
            rows={state.rows}
            columns={allColumns}
            onOpenRow={openRow}
          />
        </div>
      ) : state.view?.mode === "form" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DataFormView
            columns={allColumns}
            view={state.view}
            canWrite={canEditData}
            onSubmit={submitFormRow}
          />
        </div>
      ) : state.view?.mode === "gallery" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DataGalleryView
            rows={state.rows}
            columns={allColumns}
            view={state.view}
            onOpenRow={openRow}
          />
        </div>
      ) : state.view?.mode === "split" ? (
        <div className="flex min-h-0 flex-1">
          <div className="w-72 shrink-0 overflow-y-auto border-r border-border">
            <DataListView
              rows={state.rows}
              columns={allColumns}
              onOpenRow={openRow}
            />
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto">
            {peekRow ? (
              <DataRowPeek
                variant="inline"
                tableId={contentId}
                row={peekRow}
                columns={allColumns}
                editable={canEditData}
                index={peekIndex}
                total={state.rows.length}
                focusColumnId={peekFocusColumnId}
                focusToken={peekFocusToken}
                onCreateOption={state.canAlterSchema ? createOption : undefined}
                onOpenContent={openContent}
                onOpenAsPage={openAsPage}
                onCommitCell={commitCell}
                onRefresh={() => load(viewRef.current?.id ?? null)}
                onNavigate={navigatePeek}
                onClose={() => setPeekRowId(null)}
              />
            ) : (
              <p className="px-6 py-8 text-xs text-muted-foreground">
                Select a row on the left.
              </p>
            )}
          </div>
        </div>
      ) : (
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        // No native text selection while a drag-select is in flight.
        className={cn("flex-1 overflow-auto", isDragSelecting && "select-none")}
      >
        <div className="min-w-max">
          <div className="sticky top-0 z-10 flex border-b border-border bg-muted/60 backdrop-blur">
            <div className="w-9 shrink-0 border-r border-border/60" />
            <div className="w-6 shrink-0" />
            {columns.map((column) => {
              // Checkbox header toggle: absent counts as unchecked, the
              // same two-state doctrine as the filter and the board.
              const allChecked =
                column.type === "checkbox" &&
                state.rows.length > 0 &&
                state.rows.every((r) => r.data[column.key] === true);
              const someChecked =
                column.type === "checkbox" &&
                state.rows.some((r) => r.data[column.key] === true);
              return (
              <DataColumnHeader
                key={column.id}
                column={column}
                width={columnWidths[column.id]}
                editable={canEditData}
                menuOpen={openColumnId === column.id}
                onSelectColumn={selectColumn}
                onOpenMenu={setOpenColumnId}
                onContextMenu={openColumnMenu}
                isDragSource={dragColumnId === column.id}
                dropIndicator={
                  dropTarget?.columnId === column.id ? dropTarget.side : null
                }
                onColumnDragStart={handleColumnDragStart}
                onColumnDragOver={handleColumnDragOver}
                onColumnDrop={handleColumnDrop}
                onColumnDragEnd={handleColumnDragEnd}
                // Widths persist through the views PATCH (canWrite-gated);
                // query tables keep it too — views are the table's own
                // objects even when the data is a read-only projection.
                onResizeStart={state.canWrite ? handleResizeStart : undefined}
                onBulkToggle={
                  column.type === "checkbox" &&
                  canEditData &&
                  state.rows.length > 0
                    ? () => void bulkSetCheckbox(column, !allChecked)
                    : undefined
                }
                allChecked={allChecked}
                someChecked={someChecked}
              >
                {openColumnId === column.id && (
                  <ColumnMenu
                    column={column}
                    onSave={(patch) => saveColumn(column.id, patch)}
                    onDelete={() => deleteColumns([column.id])}
                    onClose={() => setOpenColumnId(null)}
                  />
                )}
                {insertAt?.columnId === column.id && (
                  <AddColumnPanel
                    tableId={contentId}
                    columns={allColumns}
                    open
                    heading={`Insert column ${insertAt.side === "left" ? "left" : "right"} of “${column.name}”`}
                    onClose={() => setInsertAt(null)}
                    onAdd={(input) =>
                      columnRequest("POST", {
                        ...input,
                        position: insertPosition(column.id, insertAt.side),
                      }).then(() => undefined)
                    }
                  />
                )}
              </DataColumnHeader>
              );
            })}
            {hiddenColumns.length > 0 && (
              <HiddenColumnsButton
                hidden={hiddenColumns}
                viewName={state.view?.name}
                onShow={(ids) => void setColumnsHidden(ids, false)}
              />
            )}
            {canEditData && (
              <AddColumnButton
                tableId={contentId}
                columns={allColumns}
                onAdd={addColumn}
              />
            )}
          </div>

          {/* Spacer preserves true scroll height while only a slice renders.
              Click-and-HOLD anywhere on a row (not on its controls) opens
              the row as a PINNED peek — it stays until closed (owner,
              2026-10-09). Moving cancels it: that is a drag-select. */}
          <div
            style={{ height: totalHeight, position: "relative" }}
            onPointerDown={(e) => {
              if (isQuery) return;
              const target = e.target as HTMLElement | null;
              if (!target || target.closest("input, textarea, select, button, a, [contenteditable=true]")) return;
              const rowId = target.closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
              if (rowId) rowHold.start(e, rowId);
            }}
            onPointerMove={rowHold.move}
            onPointerUp={rowHold.cancel}
            onPointerLeave={rowHold.cancel}
            onContextMenu={(e) => {
              const key = (e.target as HTMLElement | null)
                ?.closest<HTMLElement>("[data-column-key]")?.dataset.columnKey;
              const column = key ? columns.find((c) => c.key === key) : undefined;
              if (column) openColumnMenu(e, column.id);
            }}
          >
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
                  widths={columnWidths}
                  onCreateOption={state.canAlterSchema ? createOption : undefined}
                  onUploadFiles={canEditData ? uploadIntoFileCell : undefined}
                  imageVersion={imageVersion}
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
                  rangeColumnKeys={rangeByRow?.get(row.id) ?? null}
                  onToggleSelect={toggleRow}
                  onCommitCell={commitCell}
                  onSelectCell={selectCell}
                  onHoverCell={hoverCell}
                  onOpenRow={openRow}
                  onOpenContent={openContent}
                  clickToEdit={clickEditArmed}
                  onArmClickEdit={armClickEdit}
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

      {columnMenu && (
        <DataColumnContextMenu
          menu={columnMenu}
          deleteCount={menuDeleteIds.length}
          deleteBlockedReason={menuDeleteBlocked}
          onClose={() => setColumnMenu(null)}
          onInsert={(side) => {
            setInsertAt({ columnId: columnMenu.columnId, side });
            setColumnMenu(null);
          }}
          onDelete={() => {
            const ids = menuDeleteIds;
            setColumnMenu(null);
            void deleteColumns(ids);
          }}
          onHide={() => void setColumnsHidden(menuDeleteIds, true)}
          hideBlockedReason={
            columns.length - menuDeleteIds.length < 1
              ? "A view needs at least one visible column"
              : null
          }
          hiddenCount={hiddenColumns.length}
          onShowHidden={() => void setColumnsHidden(hiddenColumns.map((c) => c.id), false)}
          viewName={state.view?.name}
        />
      )}

      {peekRow && state.view?.mode !== "split" && (
        <DataRowPeek
          tableId={contentId}
          row={peekRow}
          columns={allColumns}
          editable={canEditData}
          index={peekIndex}
          total={state.rows.length}
          focusColumnId={peekFocusColumnId}
          focusToken={peekFocusToken}
          onCreateOption={state.canAlterSchema ? createOption : undefined}
          onOpenContent={openContent}
          onOpenAsPage={openAsPage}
          onCommitCell={commitCell}
          onRefresh={() => void load(state.view?.id ?? null)}
          onNavigate={navigatePeek}
          pinned={peekPinned}
          onClose={() => {
            setPeekRowId(null);
            setPeekFocusColumnId(null);
          }}
        />
      )}
    </div>
  );
}

export type { DataColumn, DataRow };
