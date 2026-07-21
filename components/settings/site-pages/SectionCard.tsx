"use client";

/**
 * SectionCard — one section in the composer (v1.1 unified model).
 *
 * A section is a list. Each item is:
 *   • a directory  (ref = publicPath) — shown as a "keeping in sync" chip; it
 *     expands into its published pages on the live page, so it isn't edited here.
 *   • a single page (ref = publicItem) — expandable; fields inherit from the
 *     published page, editable as overrides.
 *   • manual       — expandable; fully authored.
 *
 * Directories and single pages sit side by side. Which item fields show is
 * decided by the page `kind` (handled inside ItemEditor).
 */

import { useState } from "react";
import type { ListSection, ListItem } from "@/lib/domain/page-layout/schema";
import { isDirectoryRef } from "@/lib/domain/page-layout/schema";
import type { PageKind } from "./defaults";
import { Emphasis } from "@/components/common/Emphasis";
import { ItemEditor, type InheritedValues } from "./RowEditor";

/** Resolves a `publicItem:<slug>` ref to the values it inherits. */
export type InheritedLookup = (ref: string | undefined) => InheritedValues | undefined;

const inputCls = "rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm min-w-0";
const monoChip =
  "inline-flex items-center rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/50";

function DirectoryRow({
  path,
  canSnapshot,
  onUnsync,
  onRemove,
}: {
  path: string;
  /** True when we know the directory's current pages (so we can snapshot). */
  canSnapshot: boolean;
  onUnsync: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="w-3" />
      <span
        className="inline-flex flex-1 items-center gap-1.5 text-[13px] text-emerald-400"
        title={`Every published page in ${path} appears here, and new ones are added automatically`}
      >
        ↻ Keeping in sync with <span className="font-mono">{path}</span>
      </span>
      <label
        className="flex items-center gap-1.5 text-[11px] text-white/55"
        title={
          canSnapshot
            ? "On: new pages appear automatically. Turn off to freeze the current pages as a fixed list."
            : "Sync info still loading…"
        }
      >
        <input
          type="checkbox"
          checked
          disabled={!canSnapshot}
          onChange={onUnsync}
        />
        Keep in sync
      </label>
      <button
        type="button"
        aria-label={`Remove ${path}`}
        className="text-white/30 hover:text-rose-400"
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}

export function SectionCard({
  section,
  index,
  total,
  pageKind,
  onChange,
  onRemove,
  onMove,
  onConnect,
  onAddManual,
  inheritedFor,
  expandDirectory,
}: {
  section: ListSection;
  index: number;
  total: number;
  pageKind: PageKind;
  onChange: (next: ListSection) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onConnect: () => void;
  onAddManual: () => void;
  inheritedFor: InheritedLookup;
  /** Given a `publicPath:` ref, the directory's current page refs. */
  expandDirectory: (pathRef: string) => string[];
}) {
  const [openRow, setOpenRow] = useState<number | null>(null);

  const setItem = (i: number, next: ListItem) => {
    const items = section.items.slice();
    items[i] = next;
    onChange({ ...section, items });
  };
  const removeItem = (i: number) => {
    onChange({ ...section, items: section.items.filter((_, j) => j !== i) });
    setOpenRow(null);
  };

  const sectionNoun = pageKind === "garden" ? "category" : "section";

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      {/* section header: label, sort, reorder/remove */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          aria-label={`${sectionNoun} heading`}
          className={`${inputCls} font-mono`}
          value={section.label}
          placeholder={pageKind === "garden" ? "Category name" : "— Section heading"}
          onChange={(e) => onChange({ ...section, label: e.target.value })}
        />
        <label className="ml-1 font-mono text-[10px] uppercase tracking-wider text-white/40">Order</label>
        <select
          aria-label="Sort"
          className={inputCls}
          value={section.sort}
          onChange={(e) => onChange({ ...section, sort: e.target.value as ListSection["sort"] })}
        >
          <option value="date-desc">newest first</option>
          <option value="date-asc">oldest first</option>
          <option value="manual">as listed</option>
        </select>
        <span className="flex-1" />
        <button type="button" aria-label="Move up" disabled={index === 0} className="px-1 text-white/40 hover:text-white/80 disabled:opacity-20" onClick={() => onMove(-1)}>↑</button>
        <button type="button" aria-label="Move down" disabled={index === total - 1} className="px-1 text-white/40 hover:text-white/80 disabled:opacity-20" onClick={() => onMove(1)}>↓</button>
        <button type="button" aria-label={`Remove ${sectionNoun}`} className="px-1 text-white/30 hover:text-rose-400" onClick={onRemove}>✕</button>
      </div>

      {pageKind === "garden" && (
        <input
          aria-label="Category intro"
          className={`${inputCls} mb-3 w-full`}
          value={section.intro ?? ""}
          placeholder="Category intro line (optional)"
          onChange={(e) => onChange({ ...section, intro: e.target.value || undefined })}
        />
      )}

      {/* items */}
      <ul className="divide-y divide-white/5 rounded-md border border-white/5">
        {section.items.map((item, i) => {
          if (isDirectoryRef(item.ref)) {
            const dirRefs = expandDirectory(item.ref!);
            return (
              <li key={i}>
                <DirectoryRow
                  path={item.ref!.replace("publicPath:", "")}
                  canSnapshot={dirRefs.length > 0}
                  onUnsync={() => {
                    // Replace this directory item with its current pages, pinned.
                    const items = section.items.slice();
                    items.splice(
                      i,
                      1,
                      ...dirRefs.map((ref): ListItem => ({ ref, status: "done" })),
                    );
                    onChange({ ...section, items });
                  }}
                  onRemove={() => removeItem(i)}
                />
              </li>
            );
          }
          const inherited = inheritedFor(item.ref);
          const shownTitle = item.title ?? inherited?.title ?? "(untitled)";
          const open = openRow === i;
          return (
            <li key={i} className={item.hidden ? "opacity-45" : undefined}>
              <div className="flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenRow(open ? null : i)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="w-3 text-white/35">{open ? "▾" : "▸"}</span>
                  <span className="min-w-0 flex-1 truncate font-serif text-sm [&_em]:not-italic [&_em]:text-amber-400 [&_strong]:text-amber-400">
                    <Emphasis text={shownTitle} />
                  </span>
                </button>
                {pageKind === "record" && (
                  <span className="hidden font-mono text-[11px] text-white/40 sm:inline">
                    {item.type ?? ""} {item.year ? `· ${item.year}` : ""}
                  </span>
                )}
                {item.ref ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400/80" title={`Connected to ${item.ref.replace("publicItem:", "")}`}>
                    connected
                  </span>
                ) : (
                  <span className={monoChip}>manual</span>
                )}
                <button type="button" aria-label="Remove item" className="text-white/30 hover:text-rose-400" onClick={() => removeItem(i)}>✕</button>
              </div>
              {open && (
                <ItemEditor item={item} pageKind={pageKind} inherited={inherited} onChange={(next) => setItem(i, next)} />
              )}
            </li>
          );
        })}
        {section.items.length === 0 && (
          <li className="px-3 py-5 text-center text-xs text-white/35">
            Nothing here yet. Add published pages or a whole directory — or a manual row.
          </li>
        )}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-dashed border-amber-600/60 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10"
          onClick={onConnect}
        >
          ⚡ Add published content…
        </button>
        <button
          type="button"
          className="rounded-md border border-dashed border-white/20 px-3 py-1.5 text-xs text-white/50 hover:border-amber-500/50 hover:text-amber-400"
          onClick={onAddManual}
        >
          + Add manual row
        </button>
      </div>
    </section>
  );
}
