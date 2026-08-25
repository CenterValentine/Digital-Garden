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

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  cellToText,
  sortStatusOptions,
  type CellValue,
  type ContentRef,
  type DataColumn,
  type DataRow,
  type PersonRef,
  type RelationLinkRef,
} from "@/lib/domain/data";
import {
  ContentTreePicker,
  useWorkspaceViewOptions,
} from "@/components/content/pickers/ContentTreePicker";

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-2 py-1.5",
  "text-xs outline-none focus:ring-2 focus:ring-primary"
);

interface DataRowPeekProps {
  /** The table's contentId — relation link writes go through its API. */
  tableId: string;
  row: DataRow;
  columns: DataColumn[];
  editable: boolean;
  index: number;
  total: number;
  /** Auto-open this column's link picker on mount (the grid's relation +). */
  focusColumnId?: string | null;
  /** Open a linked ContentNode in a workspace tab. */
  onOpenContent: (ref: ContentRef) => void;
  /** Promote this row to a page and open it (plan Phase 5). */
  onOpenAsPage: (rowId: string) => void;
  onCommitCell: (rowId: string, columnKey: string, value: unknown) => void;
  /** Link/unlink happened — the parent reloads so hydration refreshes. */
  onRefresh: () => void;
  onNavigate: (dir: 1 | -1) => void;
  onClose: () => void;
}

export function DataRowPeek({
  tableId,
  row,
  columns,
  editable,
  index,
  total,
  focusColumnId,
  onOpenContent,
  onOpenAsPage,
  onCommitCell,
  onRefresh,
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
  const rawTitle = primary ? cellToText(primary, row.data[primary.key]) : "";
  const title = rawTitle || "Untitled";

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

      {/* The heading IS the primary column's value — "Untitled" is its
          empty state, not data (owner asked where it came from,
          2026-08-26). Italic + muted + a tooltip make that legible. */}
      <h3
        className={cn(
          "truncate px-3 pb-1 pt-3 text-base font-semibold",
          !rawTitle && "italic text-muted-foreground"
        )}
        title={
          rawTitle ||
          `Untitled — this row is named by its ${primary?.name ?? "primary"} column`
        }
      >
        {title}
      </h3>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {columns.map((column) =>
          column.type === "person" ? (
            <PersonField
              key={`${row.id}:${column.id}`}
              column={column}
              personRef={row.personRefs?.[column.id]}
              editable={editable}
              autoOpen={focusColumnId === column.id}
              onCommit={(v) => onCommitCell(row.id, column.key, v)}
            />
          ) : column.type === "contentLink" ? (
            <ContentLinkField
              key={`${row.id}:${column.id}`}
              column={column}
              refs={row.contentRefs?.[column.id] ?? []}
              value={row.data[column.key]}
              editable={editable}
              autoOpen={focusColumnId === column.id}
              onOpenContent={onOpenContent}
              onCommit={(v) => onCommitCell(row.id, column.key, v)}
            />
          ) : column.type === "lookup" || column.type === "rollup" ? (
            <div
              key={`${row.id}:${column.id}`}
              className="border-b border-border/40 py-2.5 last:border-b-0"
            >
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                {column.name}
              </label>
              <p className="text-xs text-muted-foreground">
                {row.derived?.[column.id] !== undefined
                  ? String(row.derived[column.id])
                  : "—"}
              </p>
              {column.description && (
                <p className="mt-1 text-[10px] italic leading-snug text-muted-foreground">
                  {column.description}
                </p>
              )}
            </div>
          ) : column.type === "relation" ? (
            <RelationField
              key={`${row.id}:${column.id}`}
              tableId={tableId}
              rowId={row.id}
              column={column}
              links={row.links?.[column.id] ?? []}
              editable={editable}
              autoOpen={focusColumnId === column.id}
              onRefresh={onRefresh}
            />
          ) : (
            <PeekField
              key={`${row.id}:${column.id}`}
              column={column}
              value={row.data[column.key]}
              editable={editable}
              onCommit={(v) => onCommitCell(row.id, column.key, v)}
            />
          )
        )}

        <div className="mt-4 rounded-md border border-dashed border-border p-2.5">
          <p className="text-[11px] leading-snug text-muted-foreground">
            {row.contentId
              ? "This row has its own page — a real note with a body, tags, and backlinks."
              : "Open this row as a page to give it a note body, tags, and backlinks. It stays a row of this database either way."}
          </p>
          {editable && (
            <button
              type="button"
              onClick={() => onOpenAsPage(row.id)}
              className="mt-2 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
            >
              {row.contentId ? "Open page" : "Open as page"}
            </button>
          )}
        </div>
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


// ── Relation field ───────────────────────────────────────────────────────

interface RelationFieldProps {
  tableId: string;
  rowId: string;
  column: DataColumn;
  links: RelationLinkRef[];
  editable: boolean;
  /** Open the picker immediately — the grid's + landed here on purpose. */
  autoOpen?: boolean;
  onRefresh: () => void;
}

/**
 * The relation editor (plan Phase 4): linked rows as removable chips, plus
 * a picker over the target table's rows. Restricted targets render a
 * redacted pill and cannot be unlinked from here — you should not be able
 * to edit what you cannot see (plan V1-3).
 */
function RelationField({
  tableId,
  rowId,
  column,
  links,
  editable,
  autoOpen = false,
  onRefresh,
}: RelationFieldProps) {
  const [picking, setPicking] = useState(autoOpen && editable);
  const [candidates, setCandidates] = useState<
    Array<{ id: string; title: string }> | null
  >(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const targetTableId = column.config.relationTableId;
  /**
   * Backlink half of a pair (plan Phase 4 appendix): it owns no links, so
   * writes go to the FORWARD column on the other table with from/to
   * swapped. Reads were already flipped by hydration.
   */
  const isBacklink = column.config.isBacklink === true;
  const forwardColumnId = isBacklink
    ? column.config.symmetricColumnId
    : column.id;
  const linksEndpointTable = isBacklink ? targetTableId : tableId;

  // Candidates load whenever the picker is open and empty — whether it was
  // opened by click or by the grid's + (autoOpen), one code path.
  useEffect(() => {
    if (!picking || candidates !== null || !targetTableId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/content/data/${targetTableId}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success) {
          setCandidates([]);
          return;
        }
        const primary = (json.data.table.columns as DataColumn[]).find(
          (c) => c.isPrimary
        );
        setCandidates(
          (json.data.rows as DataRow[]).map((r) => ({
            id: r.id,
            title:
              (primary && typeof r.data[primary.key] === "string"
                ? (r.data[primary.key] as string)
                : "") || "Untitled",
          }))
        );
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picking, candidates, targetTableId]);

  const link = useCallback(
    async (toRowId: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await fetch(`/api/content/data/${linksEndpointTable}/links`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isBacklink
              ? { columnId: forwardColumnId, fromRowId: toRowId, toRowId: rowId }
              : { columnId: forwardColumnId, fromRowId: rowId, toRowId }
          ),
        });
        onRefresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, linksEndpointTable, forwardColumnId, isBacklink, rowId, onRefresh]
  );

  const unlink = useCallback(
    async (linkId: string) => {
      if (busy) return;
      setBusy(true);
      try {
        // The link's SOURCE row lives on the forward table — the DELETE
        // scope check demands the request go there.
        await fetch(`/api/content/data/${linksEndpointTable}/links`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkId }),
        });
        onRefresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, linksEndpointTable, onRefresh]
  );

  const linkedIds = new Set(links.map((l) => l.rowId));
  const shown = (candidates ?? []).filter(
    (c) =>
      !linkedIds.has(c.id) &&
      (!filter.trim() ||
        c.title.toLowerCase().includes(filter.trim().toLowerCase()))
  );

  return (
    <div className="border-b border-border/40 py-2.5 last:border-b-0">
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {column.name}
      </label>

      <div className="flex flex-wrap items-center gap-1">
        {links.map((l) => (
          <span
            key={l.linkId}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
              l.restricted
                ? "bg-muted italic text-muted-foreground"
                : "bg-primary/10 text-primary"
            )}
          >
            {l.restricted ? "Restricted" : l.title}
            {editable && !l.restricted && (
              <button
                type="button"
                onClick={() => void unlink(l.linkId)}
                aria-label={`Unlink ${l.title}`}
                className="rounded-full hover:bg-primary/20"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}
        {editable && (
          <button
            type="button"
            aria-label="Link rows"
            title="Link rows"
            onClick={() => setPicking((p) => !p)}
            className="flex items-center rounded-full border border-dashed border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {picking && (
        <div className="mt-2 rounded-md border border-border p-1.5">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search rows…"
            className={cn(fieldClass, "mb-1")}
          />
          <div className="max-h-36 overflow-y-auto">
            {candidates === null && (
              <p className="px-1 py-1 text-[11px] text-muted-foreground">Loading…</p>
            )}
            {candidates !== null && shown.length === 0 && (
              <p className="px-1 py-1 text-[11px] text-muted-foreground">
                Nothing to link.
              </p>
            )}
            {shown.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => void link(c.id)}
                className="block w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {column.description && (
        <p className="mt-1 text-[10px] italic leading-snug text-muted-foreground">
          {column.description}
        </p>
      )}
    </div>
  );
}


// ── Content link field ───────────────────────────────────────────────────

interface ContentLinkFieldProps {
  column: DataColumn;
  refs: ContentRef[];
  value: CellValue | undefined;
  editable: boolean;
  autoOpen?: boolean;
  onOpenContent: (ref: ContentRef) => void;
  onCommit: (value: unknown) => void;
}

/**
 * contentLink editor (plan Phase 4): chips are real nodes (click opens in a
 * tab), × removes, + opens the CANONICAL ContentTreePicker — "Reuse THIS —
 * do not build new pickers" (owner decision 2026-08-15). The cell stores an
 * id array; commit goes through the ordinary cell write, which also runs
 * the ContentLink backlinks dual-write server-side.
 */
function ContentLinkField({
  column,
  refs,
  value,
  editable,
  autoOpen = false,
  onOpenContent,
  onCommit,
}: ContentLinkFieldProps) {
  const [picking, setPicking] = useState(autoOpen && editable);
  // The anchor ELEMENT lives in state, not a ref: it is read during render
  // (the picker needs it as a prop), and the React Compiler correctly
  // rejects ref reads in render. A callback ref keeps it current.
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const { views, defaultViewId } = useWorkspaceViewOptions();

  const ids = useMemo(
    () =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : [],
    [value]
  );

  const add = useCallback(
    (target: { id: string }) => {
      setPicking(false);
      if (ids.includes(target.id)) return;
      onCommit([...ids, target.id]);
    },
    [ids, onCommit]
  );

  const remove = useCallback(
    (id: string) => {
      const next = ids.filter((x) => x !== id);
      onCommit(next.length > 0 ? next : undefined);
    },
    [ids, onCommit]
  );

  return (
    <div className="border-b border-border/40 py-2.5 last:border-b-0">
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {column.name}
      </label>

      <div className="flex flex-wrap items-center gap-1">
        {refs.map((ref) => (
          <span
            key={ref.id}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
              ref.restricted
                ? "bg-muted italic text-muted-foreground"
                : "bg-primary/10 text-primary"
            )}
          >
            {ref.restricted ? (
              "Restricted"
            ) : (
              <button
                type="button"
                onClick={() => onOpenContent(ref)}
                className="truncate hover:underline"
                title={`Open "${ref.title}"`}
              >
                {ref.title}
              </button>
            )}
            {editable && !ref.restricted && (
              <button
                type="button"
                onClick={() => remove(ref.id)}
                aria-label={`Remove ${ref.title}`}
                className="rounded-full hover:bg-primary/20"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}
        {editable && (
          <button
            ref={setAnchorEl}
            type="button"
            aria-label="Link content"
            title="Link content"
            onClick={() => setPicking((p) => !p)}
            className="flex items-center rounded-full border border-dashed border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {picking && anchorEl && (
        <ContentTreePicker
          anchorEl={anchorEl}
          onPick={add}
          onClose={() => setPicking(false)}
          disabledIds={ids}
          disabledReason="already linked"
          searchPlaceholder="Link notes, files, folders…"
          views={views}
          defaultViewId={defaultViewId}
        />
      )}

      {column.description && (
        <p className="mt-1 text-[10px] italic leading-snug text-muted-foreground">
          {column.description}
        </p>
      )}
    </div>
  );
}


// ── Person field ─────────────────────────────────────────────────────────

interface PersonFieldProps {
  column: DataColumn;
  personRef?: PersonRef;
  editable: boolean;
  autoOpen?: boolean;
  onCommit: (value: unknown) => void;
}

/**
 * Person editor (plan Phase 4, personSource decision 2026-08-23).
 *
 * "person" source searches the People extension via /api/people/search —
 * the maintained owner-scoped search, not a bespoke list. "user" source is
 * declared-but-read-only in v1: a mostly-single-user instance has no user
 * roster to pick from, and the plan's value lives in the contact graph.
 */
function PersonField({
  column,
  personRef,
  editable,
  autoOpen = false,
  onCommit,
}: PersonFieldProps) {
  const source = column.config.personSource ?? "person";
  const canPick = editable && source === "person";
  const [picking, setPicking] = useState(autoOpen && canPick);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<
    Array<{ id: string; name: string }> | null
  >(null);

  // Owner-scoped people search; person entries only (groups are not
  // assignable). Re-runs as the query changes while the picker is open.
  useEffect(() => {
    if (!picking) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/people/search?q=${encodeURIComponent(query)}&limit=25`,
          { credentials: "include" }
        );
        const json = await res.json();
        if (cancelled || !json?.success) return;
        const people = (
          json.data.results as Array<{
            treeNodeKind: string;
            personId?: string;
            label: string;
          }>
        )
          .filter((r) => r.treeNodeKind === "person" && r.personId)
          .map((r) => ({ id: r.personId!, name: r.label }));
        setOptions(people);
      } catch {
        if (!cancelled) setOptions([]);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [picking, query]);

  return (
    <div className="border-b border-border/40 py-2.5 last:border-b-0">
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {column.name}
      </label>

      <div className="flex flex-wrap items-center gap-1">
        {personRef && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
              personRef.restricted
                ? "bg-muted italic text-muted-foreground"
                : "bg-muted text-foreground"
            )}
          >
            {personRef.restricted ? "Restricted" : personRef.name}
            {editable && (
              <button
                type="button"
                onClick={() => onCommit(undefined)}
                aria-label="Clear person"
                className="rounded-full hover:bg-muted-foreground/20"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        )}
        {canPick && !personRef && (
          <button
            type="button"
            aria-label="Assign person"
            title="Assign person"
            onClick={() => setPicking((p) => !p)}
            className="flex items-center rounded-full border border-dashed border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        )}
        {!canPick && !personRef && (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {picking && canPick && (
        <div className="mt-2 rounded-md border border-border p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your People…"
            className={cn(fieldClass, "mb-1")}
          />
          <div className="max-h-36 overflow-y-auto">
            {options === null && (
              <p className="px-1 py-1 text-[11px] text-muted-foreground">Loading…</p>
            )}
            {options !== null && options.length === 0 && (
              <p className="px-1 py-1 text-[11px] text-muted-foreground">
                No people found.
              </p>
            )}
            {(options ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPicking(false);
                  onCommit(p.id);
                }}
                className="block w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {source === "user" && (
        <p className="mt-1 text-[10px] italic leading-snug text-muted-foreground">
          App-user assignment arrives with multi-user; this column stores
          account ids.
        </p>
      )}
      {column.description && (
        <p className="mt-1 text-[10px] italic leading-snug text-muted-foreground">
          {column.description}
        </p>
      )}
    </div>
  );
}
