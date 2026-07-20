"use client";

/**
 * ContentPicker — the "Connect content" slide-over.
 *
 * Grouped list + search over the tenant's published content. Two targets, both
 * first-class:
 *   • "Add all + keep in sync" → sets `bind: "publicPath:/path"` on the
 *     section, so the Path's posts flow in automatically and newly published
 *     ones appear without reopening this.
 *   • "Add this one" → appends `{ ref: "publicItem:<slug>" }`, a single row
 *     whose display fields you can override.
 *
 * Copy note: the user-facing noun is "Path", matching the publishing UI. The
 * buttons name the OUTCOME rather than the mechanism ("bind") — the ongoing
 * sync is the thing that distinguishes the two actions.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  ContentIndexDirectory,
} from "@/app/api/site-pages/content-index/route";

export function ContentPicker({
  tenantId,
  sectionLabel,
  onBindDirectory,
  onAddItem,
  onClose,
}: {
  tenantId: string;
  sectionLabel: string;
  /** Add a whole directory as an item (ref = publicPath:/x). */
  onBindDirectory: (ref: string, dir: ContentIndexDirectory) => void;
  /** Add a single published page as an item (ref = publicItem:slug). */
  onAddItem: (ref: string, title: string) => void;
  onClose: () => void;
}) {
  const [dirs, setDirs] = useState<ContentIndexDirectory[] | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/site-pages/content-index?tenantId=${encodeURIComponent(tenantId)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { directories: ContentIndexDirectory[] };
        setDirs(data.directories);
        // Expand directories that have content, so items are visible up front.
        setExpanded(
          new Set(data.directories.filter((d) => d.publishedCount > 0).map((d) => d.path)),
        );
      } catch (err) {
        toast.error("Failed to load published content", {
          description: err instanceof Error ? err.message : "Please try again",
        });
        setDirs([]);
      }
    })();
  }, [tenantId]);

  // Search matches directory titles/paths and item titles; a directory stays
  // visible when any of its items match.
  const filtered = useMemo(() => {
    if (!dirs) return null;
    const q = query.trim().toLowerCase();
    if (!q) return dirs;
    return dirs
      .map((d) => {
        const dirHit =
          d.title.toLowerCase().includes(q) || d.path.toLowerCase().includes(q);
        const items = d.items.filter((i) => i.title.toLowerCase().includes(q));
        return dirHit ? d : items.length > 0 ? { ...d, items } : null;
      })
      .filter((d): d is ContentIndexDirectory => d !== null);
  }, [dirs, query]);

  return (
    <>
      {/* Scrim and panel start below NotesNavBar (56px, matching the settings
          layout's `fixed top-[56px]`) so the app nav stays visible and usable. */}
      <div
        className="fixed inset-x-0 bottom-0 top-[56px] z-40 bg-black/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed bottom-0 right-0 top-[56px] z-40 flex w-[min(430px,92vw)] flex-col border-l border-white/15 bg-[var(--background,#101418)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Connect content"
      >
        <header className="border-b border-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Connect content</h2>
              <p className="mt-1 text-xs text-white/50">
                Choose what appears in{" "}
                <b className="text-white/70">{sectionLabel}</b>. Add a whole Path
                and it keeps itself up to date — anything you publish there shows
                up here automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-white/40 hover:text-white/80"
            >
              ✕
            </button>
          </div>
          <input
            autoFocus
            className="mt-3 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="Search paths and pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered === null && (
            <p className="py-8 text-center text-sm text-white/40">Loading…</p>
          )}
          {filtered?.length === 0 && (
            <p className="py-8 text-center text-sm text-white/40">
              {query
                ? "Nothing matches that search."
                : "No published content yet. Publish a note first, then connect it here."}
            </p>
          )}

          {filtered && filtered.length > 0 && (
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-white/40">
              Published paths
            </p>
          )}

          <ul className="space-y-2">
            {filtered?.map((d) => {
              const open = expanded.has(d.path) || query.trim().length > 0;
              return (
                <li
                  key={d.path}
                  className={`rounded-lg border ${
                    d.publishedCount === 0 ? "border-white/5" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={open ? "Collapse" : "Expand"}
                      className="w-4 text-white/40 hover:text-white/80"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.path)) next.delete(d.path);
                          else next.add(d.path);
                          return next;
                        })
                      }
                    >
                      {open ? "▾" : "▸"}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-medium ${
                          d.publishedCount === 0 ? "text-white/45" : ""
                        }`}
                      >
                        {d.title}
                      </span>
                      <span className="block font-mono text-[10px] text-white/40">
                        {d.path}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-white/45">
                      {d.publishedCount} published
                    </span>
                    <button
                      type="button"
                      title={`Show every published page in ${d.path} here, and keep it updated as you publish more`}
                      className="whitespace-nowrap rounded-md border border-amber-600/60 px-2.5 py-1 text-[11px] text-amber-400 hover:bg-amber-500/10"
                      onClick={() => {
                        onBindDirectory(d.ref, d);
                        toast.success(`${d.title} added — new pages will appear automatically`);
                        onClose();
                      }}
                    >
                      Add all + keep in sync
                    </button>
                  </div>

                  {open && d.items.length > 0 && (
                    <ul className="border-t border-white/5">
                      {d.items.map((it) => (
                        <li
                          key={it.slug}
                          className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-b-0"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px]">{it.title}</span>
                            <span className="block font-mono text-[10px] text-white/35">
                              {it.payloadType}
                              {it.firstPublishedAt
                                ? ` · ${it.firstPublishedAt.slice(0, 10)}`
                                : ""}
                            </span>
                          </span>
                          <button
                            type="button"
                            title="Add just this page as one row"
                            className="whitespace-nowrap rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/60 hover:border-amber-600/60 hover:text-amber-400"
                            onClick={() => {
                              onAddItem(it.ref, it.title);
                              toast.success(`Added ${it.title}`);
                              onClose();
                            }}
                          >
                            Add this one
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}
