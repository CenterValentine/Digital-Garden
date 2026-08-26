"use client";

/**
 * Query editor for `mode: "query"` tables (plan Phase 3).
 *
 * Replaces the Filter/Sort bar — for a query table the QUERY is the filter.
 * Tags are ALL-of (comma-separated slugs), types are ANY-of. Saving runs
 * through the table-level PATCH, which re-parses and clamps server-side and
 * marks AI context dirty (the query IS the table's semantics).
 */

import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { ContentQuery } from "@/lib/domain/data";
import { PanelPortal } from "./PanelPortal";

const QUERYABLE = [
  ["note", "Notes"],
  ["file", "Files"],
  ["external", "Bookmarks"],
  ["html", "HTML"],
  ["code", "Code"],
  ["template", "Templates"],
] as const;

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-2 py-1.5",
  "text-xs outline-none focus:ring-2 focus:ring-primary"
);

interface DataQueryBarProps {
  query: ContentQuery;
  total: number;
  canEdit: boolean;
  onSave: (query: ContentQuery) => Promise<void>;
}

export function DataQueryBar({ query, total, canEdit, onSave }: DataQueryBarProps) {
  const [open, setOpen] = useState(false);
  const [tagsDraft, setTagsDraft] = useState<string | null>(null);
  const [typesDraft, setTypesDraft] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const tags = tagsDraft ?? query.tags.join(", ");
  const types = typesDraft ?? query.contentTypes;
  const dirty = tagsDraft !== null || typesDraft !== null;

  const close = useCallback(() => {
    setOpen(false);
    setTagsDraft(null);
    setTypesDraft(null);
  }, []);

  const apply = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({
        tags: tags
          .split(",")
          .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
          .filter(Boolean),
        contentTypes: types,
      });
      close();
    } finally {
      setBusy(false);
    }
  }, [busy, tags, types, onSave, close]);

  const summary =
    query.tags.length > 0
      ? query.tags.map((t) => `#${t}`).join(" ")
      : "everything";

  return (
    <div className="relative flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs",
          "bg-primary/10 font-medium text-primary"
        )}
      >
        <Search className="h-3.5 w-3.5" />
        Query · {summary}
      </button>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {total} {total === 1 ? "match" : "matches"}
      </span>
      <span className="ml-auto text-[10px] text-muted-foreground">
        Read-only — rows are your actual content
      </span>

      <PanelPortal open={open} onDismiss={close} className="w-80">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tags — item must carry ALL of these
        </label>
        <input
          autoFocus
          value={tags}
          disabled={!canEdit}
          onChange={(e) => setTagsDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void apply();
          }}
          placeholder="book, research"
          className={fieldClass}
        />
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          Comma-separated tag slugs. Leave empty to match every item of the
          chosen types.
        </p>

        <div className="mb-1 mt-3 flex items-baseline justify-between">
          <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Include types
          </label>
          {/* One toggle, two meanings: anything unchecked → All; all
              checked → None. Compact, and always one click from either
              extreme (owner, 2026-08-25). */}
          <button
            type="button"
            disabled={!canEdit}
            onClick={() =>
              setTypesDraft(
                types.length === QUERYABLE.length
                  ? []
                  : QUERYABLE.map(([value]) => value)
              )
            }
            className="text-[10px] font-medium text-primary hover:underline disabled:opacity-40"
          >
            {types.length === QUERYABLE.length ? "None" : "All"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {QUERYABLE.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={types.includes(value)}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...types, value]
                    : types.filter((t) => t !== value);
                  setTypesDraft(next);
                }}
                className="h-3.5 w-3.5 accent-current"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canEdit || !dirty || busy || types.length === 0}
            onClick={() => void apply()}
            className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </PanelPortal>
    </div>
  );
}
