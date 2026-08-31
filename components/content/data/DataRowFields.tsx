"use client";

/**
 * The row field stack — every column as a labelled, editable field.
 *
 * Extracted from DataRowPeek (Phase 6a) so the same editors serve three
 * surfaces without forking: the peek, the split view's right pane, and the
 * property header above a promoted row's page. Column descriptions
 * (plan D9) render as inline help under the field they describe.
 *
 * Fields are UNCONTROLLED (defaultValue + commit on blur), remounted per
 * row via the key. No draft state to sync — the same poll-clobbers-typing
 * hazard the grid cells dodge, dodged the same way.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import { editDraftFor } from "./DataGridRow";
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

/** File-column link picker: folders + notes are for NAVIGATING (editor
 * attachments live under notes), files are what's pickable — the `add`
 * guard turns a folder/note pick into a teaching toast. */
const FILE_LINK_ELIGIBLE_TYPES: ReadonlySet<string> = new Set([
  "folder",
  "note",
  "file",
]);

interface DataRowFieldsProps {
  /** The table's contentId — relation link writes go through its API. */
  tableId: string;
  row: DataRow;
  columns: DataColumn[];
  editable: boolean;
  /** Auto-open this column's link picker on mount (the grid's +). */
  focusColumnId?: string | null;
  /** Bumped per grid-"+" click so auto-open re-fires on an open peek. */
  focusToken?: number;
  /** Owner-only: create a select/status/multiSelect option inline. */
  onCreateOption?: (
    column: DataColumn,
    label: string
  ) => Promise<{ id: string; label: string } | null>;
  onOpenContent: (ref: ContentRef) => void;
  onCommitCell: (rowId: string, columnKey: string, value: unknown) => void;
  /** Link/unlink happened — the parent reloads so hydration refreshes. */
  onRefresh: () => void;
}

/**
 * Auto-open that responds to every grid-"+" click, not just to mount: the
 * peek may ALREADY be open on this row with focus already naming this
 * column, where an initializer-only read does nothing — the reported
 * "clicked + and had to click the + in the peek again" failure. React's
 * sanctioned adjust-state-while-rendering pattern; no effect, and the
 * extra render happens before paint.
 */
function useAutoOpenOnToken(
  autoOpen: boolean,
  token: number | undefined,
  enabled: boolean,
  open: () => void
) {
  const [consumed, setConsumed] = useState<number | undefined>(undefined);
  if (autoOpen && enabled && token !== undefined && consumed !== token) {
    setConsumed(token);
    open();
  }
}

/**
 * The other half of the grid-"+" handoff: scroll the TARGET field into
 * view. Without this, a + aimed at a field below the peek's fold opened
 * its picker against an off-screen anchor — portal-positioned outside the
 * viewport, reading as "nothing happened" (owner, 2026-08-31). The
 * pickers reposition on scroll, so scrolling after mount is enough; the
 * token re-fires it per click, like auto-open itself.
 */
function useScrollIntoViewOnFocus(
  active: boolean,
  token: number | undefined
) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active) return;
    ref.current?.scrollIntoView({ block: "center" });
  }, [active, token]);
  return ref;
}

export function DataRowFields({
  tableId,
  row,
  columns,
  editable,
  focusColumnId,
  focusToken,
  onCreateOption,
  onOpenContent,
  onCommitCell,
  onRefresh,
}: DataRowFieldsProps) {
  return (
    <>
      {columns.map((column) =>
        column.type === "person" ? (
          <PersonField
            key={`${row.id}:${column.id}`}
            column={column}
            personRef={row.personRefs?.[column.id]}
            editable={editable}
            autoOpen={focusColumnId === column.id}
            autoOpenToken={focusToken}
            onCommit={(v) => onCommitCell(row.id, column.key, v)}
          />
        ) : column.type === "contentLink" || column.type === "file" ? (
          <ContentLinkField
            key={`${row.id}:${column.id}`}
            tableId={tableId}
            column={column}
            refs={row.contentRefs?.[column.id] ?? []}
            value={row.data[column.key]}
            editable={editable}
            autoOpen={focusColumnId === column.id}
            autoOpenToken={focusToken}
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
            autoOpenToken={focusToken}
            onRefresh={onRefresh}
          />
        ) : (
          <PeekField
            key={`${row.id}:${column.id}`}
            column={column}
            value={row.data[column.key]}
            editable={editable}
            onCreateOption={
              onCreateOption ? (label) => onCreateOption(column, label) : undefined
            }
            onCommit={(v) => onCommitCell(row.id, column.key, v)}
          />
        )
      )}
    </>
  );
}

// ── Fields ───────────────────────────────────────────────────────────────


interface PeekFieldProps {
  column: DataColumn;
  value: CellValue | undefined;
  editable: boolean;
  /** Column-bound option creation (owner-only; absent = affordance hidden). */
  onCreateOption?: (label: string) => Promise<{ id: string; label: string } | null>;
  onCommit: (value: unknown) => void;
}

function PeekField({ column, value, editable, onCreateOption, onCommit }: PeekFieldProps) {
  return (
    <div className="border-b border-border/40 py-2.5 last:border-b-0">
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {column.name}
      </label>
      <FieldInput
        column={column}
        value={value}
        onCreateOption={onCreateOption}
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

function FieldInput({
  column,
  value,
  editable,
  onCreateOption,
  onCommit,
}: PeekFieldProps) {
  // Same seeding the grid uses — datetime cells convert UTC ISO to the
  // local string a datetime-local input understands.
  const asText = editDraftFor(column, value);

  // Inline option creation (select/multiSelect/status): type it where you
  // needed it, instead of a detour through the column menu. Hooks live
  // above the switch per rules-of-hooks.
  const [addingOption, setAddingOption] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const submitNewOption = async (commitWith: (id: string) => void) => {
    if (!onCreateOption) return;
    const label = newOptionLabel.trim();
    if (!label) return;
    const created = await onCreateOption(label);
    if (created) commitWith(created.id);
    setNewOptionLabel("");
    setAddingOption(false);
  };

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
      const canCreate = editable && Boolean(onCreateOption);
      if (addingOption && canCreate) {
        return (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newOptionLabel}
              onChange={(e) => setNewOptionLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  // New single-select option is also the cell's new value —
                  // you typed it because you wanted it picked.
                  void submitNewOption((id) => onCommit(id));
                } else if (e.key === "Escape") {
                  setAddingOption(false);
                  setNewOptionLabel("");
                }
              }}
              placeholder="New option label"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => void submitNewOption((id) => onCommit(id))}
              disabled={!newOptionLabel.trim()}
              className="shrink-0 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
            >
              Add
            </button>
          </div>
        );
      }
      return (
        <select
          value={typeof value === "string" ? value : ""}
          disabled={!editable}
          onChange={(e) => {
            if (e.target.value === "__create__") {
              setAddingOption(true);
              return;
            }
            onCommit(e.target.value || undefined);
          }}
          className={fieldClass}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          {canCreate && <option value="__create__">+ New option…</option>}
        </select>
      );
    }

    case "multiSelect": {
      const chosen = new Set(Array.isArray(value) ? value : []);
      const options = column.config.options ?? [];
      const canCreate = editable && Boolean(onCreateOption);
      if (options.length === 0 && !canCreate) {
        return <p className="text-xs text-muted-foreground">No options yet — add them from the column&apos;s header menu.</p>;
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
          {canCreate &&
            (addingOption ? (
              <div className="mt-0.5 flex items-center gap-1">
                <input
                  autoFocus
                  value={newOptionLabel}
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // A freshly created option starts SELECTED — you
                      // typed it here because this row wears it.
                      void submitNewOption((id) =>
                        onCommit([
                          ...(Array.isArray(value) ? value : []),
                          id,
                        ])
                      );
                    } else if (e.key === "Escape") {
                      setAddingOption(false);
                      setNewOptionLabel("");
                    }
                  }}
                  placeholder="New option label"
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={() =>
                    void submitNewOption((id) =>
                      onCommit([...(Array.isArray(value) ? value : []), id])
                    )
                  }
                  disabled={!newOptionLabel.trim()}
                  className="shrink-0 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingOption(true)}
                className="mt-0.5 flex items-center gap-1 self-start rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                New option
              </button>
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
          maxLength={column.config.maxLength}
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
                ? column.config.includeTime
                  ? "datetime-local"
                  : "date"
                : column.type === "email"
                  ? "email"
                  : "text"
          }
          inputMode={column.type === "url" ? "url" : undefined}
          maxLength={
            column.type === "text" ? column.config.maxLength : undefined
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
  /** Changes per grid-"+" click; re-opens the picker on an open peek. */
  autoOpenToken?: number;
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
  autoOpenToken,
  onRefresh,
}: RelationFieldProps) {
  const [picking, setPicking] = useState(autoOpen && editable);
  useAutoOpenOnToken(autoOpen, autoOpenToken, editable, () => setPicking(true));
  const fieldRef = useScrollIntoViewOnFocus(autoOpen, autoOpenToken);
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
    <div
      ref={fieldRef}
      className="border-b border-border/40 py-2.5 last:border-b-0"
    >
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
  /** The table's contentId — uploaded attachments nest under it. */
  tableId: string;
  column: DataColumn;
  refs: ContentRef[];
  value: CellValue | undefined;
  editable: boolean;
  autoOpen?: boolean;
  /** Changes per grid-"+" click; re-opens the picker on an open peek. */
  autoOpenToken?: number;
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
  tableId,
  column,
  refs,
  value,
  editable,
  autoOpen = false,
  autoOpenToken,
  onOpenContent,
  onCommit,
}: ContentLinkFieldProps) {
  const [picking, setPicking] = useState(autoOpen && editable);
  useAutoOpenOnToken(autoOpen, autoOpenToken, editable, () => setPicking(true));
  const fieldRef = useScrollIntoViewOnFocus(autoOpen, autoOpenToken);

  // File columns: the + UPLOADS (what a File cell's + should mean); a
  // secondary 🔗 links something already in the tree. contentLink keeps
  // its single + → picker. Uploads land as real file nodes UNDER the
  // database node — deliberate placement, never root litter.
  const isFile = column.type === "file";
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    (target: { id: string; contentType?: string }) => {
      // File cells hold uploaded attachments — the server rejects non-file
      // ids (writeCells), so teach at pick time instead of failing after.
      if (isFile && target.contentType !== "file") {
        toast.info(
          "File cells hold uploaded files — pick a file, or upload with +"
        );
        return;
      }
      setPicking(false);
      if (ids.includes(target.id)) return;
      onCommit([...ids, target.id]);
    },
    [ids, onCommit, isFile]
  );

  const remove = useCallback(
    (id: string) => {
      const next = ids.filter((x) => x !== id);
      onCommit(next.length > 0 ? next : undefined);
    },
    [ids, onCommit]
  );

  const uploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      try {
        const added: string[] = [];
        for (const file of Array.from(files)) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("parentId", tableId);
          const res = await fetch("/api/content/content/upload/simple", {
            method: "POST",
            credentials: "include",
            body: fd,
          });
          const json = await res.json().catch(() => null);
          const id = json?.data?.contentId as string | undefined;
          if (res.ok && id && !ids.includes(id) && !added.includes(id)) {
            added.push(id);
          }
        }
        if (added.length > 0) {
          onCommit([...ids, ...added]);
          window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
        }
      } finally {
        setUploading(false);
      }
    },
    [ids, onCommit, tableId]
  );

  return (
    <div
      ref={fieldRef}
      className="border-b border-border/40 py-2.5 last:border-b-0"
    >
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
        {editable && isFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void uploadFiles(e.target.files);
                // Same file re-selectable next time.
                e.target.value = "";
              }}
            />
            <button
              type="button"
              aria-label="Upload files"
              title="Upload files"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center rounded-full border border-dashed border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Plus className="h-2.5 w-2.5" />
              )}
            </button>
          </>
        )}
        {editable && (
          <button
            ref={setAnchorEl}
            type="button"
            aria-label={isFile ? "Link an existing file" : "Link content"}
            title={isFile ? "Link an existing file" : "Link content"}
            onClick={() => setPicking((p) => !p)}
            className="flex items-center rounded-full border border-dashed border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            {isFile ? (
              <Link2 className="h-2.5 w-2.5" />
            ) : (
              <Plus className="h-2.5 w-2.5" />
            )}
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
          searchPlaceholder={
            isFile ? "Link a file already in the app…" : "Link notes, files, folders…"
          }
          views={views}
          defaultViewId={defaultViewId}
          // File columns browse a narrowed tree: folders + notes for
          // navigation (attachments live under notes), files to pick.
          eligibleTypes={isFile ? FILE_LINK_ELIGIBLE_TYPES : undefined}
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
  /** Changes per grid-"+" click; re-opens the picker on an open peek. */
  autoOpenToken?: number;
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
  autoOpenToken,
  onCommit,
}: PersonFieldProps) {
  const source = column.config.personSource ?? "person";
  const canPick = editable && source === "person";
  const [picking, setPicking] = useState(autoOpen && canPick);
  useAutoOpenOnToken(autoOpen, autoOpenToken, canPick, () => setPicking(true));
  const fieldRef = useScrollIntoViewOnFocus(autoOpen, autoOpenToken);
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
    <div
      ref={fieldRef}
      className="border-b border-border/40 py-2.5 last:border-b-0"
    >
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
