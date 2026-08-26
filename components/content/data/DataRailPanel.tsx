"use client";

/**
 * The databases rail — a dedicated left-panel view (plan B8 surface 6).
 *
 * The file tree answers "where does this live"; the rail answers "show me my
 * tables". Every database, expandable to its views, one click from anywhere
 * — the navigation Notion structurally lacks (its sidebar never shows
 * views).
 *
 * Search filters database names and view names together, CLIENT-side over
 * the already-loaded list (plan B8): databases are few and views per
 * database are single digits, and views are virtual — a server content
 * search could never find them. Promoted-page titles join the same box when
 * promotion lands (Phase 5); quick-add via ContentTreePicker is a later
 * slice (it needs the shared picker to grow a create-kind param).
 *
 * Opening a view sets `?view=` BEFORE selecting the node (a fresh viewer
 * mount reads the URL), then dispatches `dg:data-open-view` (an already-
 * mounted viewer switches live) — the repo's CustomEvent seam, same shape
 * as dg:people-create-document.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Kanban,
  Search,
  Star,
  Table,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import { useContentStore } from "@/state/content-store";

interface RailView {
  id: string;
  name: string;
  mode: string;
  access: string;
}

interface RailDatabase {
  id: string;
  title: string;
  rowCount: number;
  defaultViewId: string | null;
  views: RailView[];
}

export function DataRailPanel() {
  const [databases, setDatabases] = useState<RailDatabase[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // Databases default COLLAPSED (owner, 2026-08-25) — the rail is a launcher,
  // and a wall of every view defeats the scan. Tracking the EXPANDED set
  // makes collapsed-by-default the empty state.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const setSelectedContentId = useContentStore((s) => s.setSelectedContentId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/data", { credentials: "include" });
        const json = await res.json();
        if (!cancelled && json?.success) setDatabases(json.data.databases);
      } catch {
        // The rail failing to load is not worth a toast — the tree still
        // reaches every database.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openView = useCallback(
    (db: RailDatabase, viewId: string | null) => {
      // URL first: a FRESH viewer mount reads ?view= on load.
      const url = new URL(window.location.href);
      if (viewId) url.searchParams.set("view", viewId);
      else url.searchParams.delete("view");
      window.history.replaceState(window.history.state, "", url.toString());

      setSelectedContentId(db.id, { contentType: "data", title: db.title });

      // Then the event: an ALREADY-mounted viewer switches live.
      if (viewId) {
        window.dispatchEvent(
          new CustomEvent("dg:data-open-view", {
            detail: { contentId: db.id, viewId },
          })
        );
      }
    },
    [setSelectedContentId]
  );

  const toggle = useCallback((dbId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId);
      else next.add(dbId);
      return next;
    });
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? databases
        .map((db) => {
          const dbHit = db.title.toLowerCase().includes(q);
          const views = db.views.filter((v) =>
            v.name.toLowerCase().includes(q)
          );
          // A database matches by its own name (all views shown) or through
          // its views (only the matching ones shown).
          if (dbHit) return db;
          if (views.length > 0) return { ...db, views };
          return null;
        })
        .filter((db): db is RailDatabase => db !== null)
    : databases;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 p-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search databases and views"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {loading && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
        )}
        {!loading && databases.length === 0 && (
          <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            No databases yet. Create one from the <b>+</b> menu.
          </p>
        )}
        {!loading && databases.length > 0 && filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Nothing matches “{query.trim()}”.
          </p>
        )}

        {filtered.map((db) => {
          // While searching, matches stay visible regardless of collapse —
          // a hit hidden inside a collapsed group reads as a miss. (Owner:
          // search behaviour confirmed good — do not change.)
          const isCollapsed = q ? false : !expanded.has(db.id);
          return (
            <div key={db.id} className="mb-0.5">
              <div className="group flex items-center">
                <button
                  type="button"
                  onClick={() => toggle(db.id)}
                  aria-label={isCollapsed ? "Expand" : "Collapse"}
                  className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => openView(db, db.defaultViewId)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5",
                    "text-left text-xs font-medium hover:bg-muted/60"
                  )}
                >
                  <Table className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{db.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {db.rowCount}
                  </span>
                </button>
              </div>

              {!isCollapsed &&
                db.views.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => openView(db, view.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md py-1 pl-9 pr-2",
                      "text-left text-xs text-muted-foreground",
                      "hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    {view.mode === "board" ? (
                      <Kanban className="h-3 w-3 shrink-0 opacity-70" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-1 w-1 shrink-0 rounded-full bg-current opacity-60"
                      />
                    )}
                    <span className="truncate">{view.name}</span>
                    {view.access === "personal" && (
                      <span className="shrink-0 text-[9px] uppercase tracking-wide opacity-60">
                        personal
                      </span>
                    )}
                    {view.id === db.defaultViewId && (
                      <Star className="ml-auto h-2.5 w-2.5 shrink-0 opacity-50" />
                    )}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
