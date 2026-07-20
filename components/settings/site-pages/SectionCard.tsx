"use client";

/**
 * SectionCard — one config section in the composer (S3 scope).
 *
 * S3 delivers structure editing: section add/remove/reorder, kicker/sort for
 * record lists, inline titles, and row/entry/category removal. Deep row
 * editing (inherited/override chips, emphasis tiers, facts) is Sprint 5; the
 * content picker that fills `bind`/`ref` is Sprint 4 — bound sources render
 * as read-only chips here until then.
 */

import { useState } from "react";
import type {
  PageSection,
  RecordListSection,
  DirectoryIndexSection,
  GardenCategoriesSection,
} from "@/lib/domain/page-layout/schema";
import { SECTION_TYPE_LABELS } from "./defaults";
import { Emphasis } from "@/components/common/Emphasis";
import { RecordRowEditor, GardenItemEditor, type InheritedValues } from "./RowEditor";

/** Resolves a `publicItem:<slug>` ref to the values it inherits. */
export type InheritedLookup = (ref: string | undefined) => InheritedValues | undefined;

/** What the composer should open the content picker for. */
export type PickerTarget =
  | { mode: "recordList" }
  | { mode: "directoryIndex" }
  | { mode: "gardenCategory"; categoryIndex: number };

const inputCls =
  "rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm min-w-0";
const monoChip =
  "inline-flex items-center rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/50";
const connectCls =
  "rounded-md border border-dashed border-amber-600/60 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10";

function SourceChip({ bind, onUnbind }: { bind?: string; onUnbind?: () => void }) {
  if (!bind) return null;
  const path = bind.replace("publicPath:", "");
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400"
      title={`Every published page in ${path} appears here, and new ones are added automatically`}
    >
      ↻ Keeping in sync with <span className="font-mono">{path}</span>
      {onUnbind && (
        <button
          type="button"
          aria-label={`Stop syncing with ${path}`}
          className="text-emerald-400/60 hover:text-rose-400"
          onClick={onUnbind}
        >
          ✕
        </button>
      )}
    </span>
  );
}

function RecordListBody({
  section,
  onChange,
  onConnect,
  inheritedFor,
}: {
  section: RecordListSection;
  onChange: (next: RecordListSection) => void;
  onConnect: (target: PickerTarget) => void;
  inheritedFor: InheritedLookup;
}) {
  const [openRow, setOpenRow] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-mono text-[10px] uppercase tracking-wider text-white/40">
          Kicker
        </label>
        <input
          className={`${inputCls} font-mono`}
          value={section.label}
          onChange={(e) => onChange({ ...section, label: e.target.value })}
        />
        <label className="ml-3 font-mono text-[10px] uppercase tracking-wider text-white/40">
          Sort
        </label>
        <select
          className={inputCls}
          value={section.sort}
          onChange={(e) =>
            onChange({ ...section, sort: e.target.value as RecordListSection["sort"] })
          }
        >
          <option value="date-desc">newest first</option>
          <option value="date-asc">oldest first</option>
          <option value="manual">manual order</option>
        </select>
        <SourceChip
          bind={section.bind}
          onUnbind={() => onChange({ ...section, bind: undefined })}
        />
      </div>

      <ul className="divide-y divide-white/5 rounded-md border border-white/5">
        {section.items.map((item, i) => {
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
                <span className="hidden font-mono text-[11px] text-white/40 sm:inline">
                  {item.type ?? ""} {item.year ? `· ${item.year}` : ""}
                </span>
                {item.ref ? (
                  <span
                    className="inline-flex items-center rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400/80"
                    title={`Connected to the published page ${item.ref.replace("publicItem:", "")}`}
                  >
                    connected
                  </span>
                ) : (
                  <span className={monoChip}>manual</span>
                )}
                <button
                  type="button"
                  aria-label="Remove row"
                  className="text-white/30 hover:text-rose-400"
                  onClick={() => {
                    const items = section.items.filter((_, j) => j !== i);
                    onChange({ ...section, items });
                    setOpenRow(null);
                  }}
                >
                  ✕
                </button>
              </div>
              {open && (
                <RecordRowEditor
                  item={item}
                  inherited={inherited}
                  onChange={(next) => {
                    const items = section.items.slice();
                    items[i] = next;
                    onChange({ ...section, items });
                  }}
                />
              )}
            </li>
          );
        })}
        {section.items.length === 0 && !section.bind && (
          <li className="px-3 py-5 text-center text-xs text-white/35">
            Nothing in this section yet. Connect content to pull in published
            pages — or add rows by hand.
          </li>
        )}
        {section.bind && (
          <li className="px-3 py-2 text-center text-[11px] text-emerald-400/70">
            Published pages from {section.bind.replace("publicPath:", "")} show up
            here on their own — you don&apos;t need to add them.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={connectCls} onClick={() => onConnect({ mode: "recordList" })}>
          ⚡ Connect content…
        </button>
        <button
          type="button"
          className="rounded-md border border-dashed border-white/20 px-3 py-1.5 text-xs text-white/50 hover:border-amber-500/50 hover:text-amber-400"
          onClick={() =>
            onChange({
              ...section,
              items: [...section.items, { title: "New row", status: "done" }],
            })
          }
        >
          + Add manual row
        </button>
      </div>
    </div>
  );
}

function DirectoryIndexBody({
  section,
  onChange,
  onConnect,
}: {
  section: DirectoryIndexSection;
  onChange: (next: DirectoryIndexSection) => void;
  onConnect: (target: PickerTarget) => void;
}) {
  return (
    <ul className="space-y-2">
      {section.entries.map((entry, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-white/5 px-3 py-2">
          <SourceChip bind={entry.bind} />
          <input
            className={`${inputCls} flex-1`}
            value={entry.title}
            placeholder="Title"
            onChange={(e) => {
              const entries = section.entries.slice();
              entries[i] = { ...entry, title: e.target.value };
              onChange({ ...section, entries });
            }}
          />
          <input
            className={`${inputCls} flex-[2]`}
            value={entry.subtitle ?? ""}
            placeholder="Subtitle"
            onChange={(e) => {
              const entries = section.entries.slice();
              entries[i] = { ...entry, subtitle: e.target.value || undefined };
              onChange({ ...section, entries });
            }}
          />
          <button
            type="button"
            aria-label="Remove entry"
            className="text-white/30 hover:text-rose-400"
            onClick={() =>
              onChange({ ...section, entries: section.entries.filter((_, j) => j !== i) })
            }
          >
            ✕
          </button>
        </li>
      ))}
      {section.entries.length === 0 && (
        <li className="rounded-md border border-white/5 px-3 py-4 text-center text-xs text-white/35">
          No directories yet — connect one to list it here.
        </li>
      )}
      <li>
        <button
          type="button"
          className={connectCls}
          onClick={() => onConnect({ mode: "directoryIndex" })}
        >
          ⚡ Connect content…
        </button>
      </li>
    </ul>
  );
}

function GardenCategoriesBody({
  section,
  onChange,
  onConnect,
  inheritedFor,
}: {
  section: GardenCategoriesSection;
  onChange: (next: GardenCategoriesSection) => void;
  onConnect: (target: PickerTarget) => void;
  inheritedFor: InheritedLookup;
}) {
  const [openItem, setOpenItem] = useState<string | null>(null);
  return (
    <ul className="space-y-2">
      {section.categories.map((cat, i) => (
        <li key={cat.key || i} className="rounded-md border border-white/5 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-amber-400">
              {String(i + 1).padStart(2, "0")}
            </span>
            <input
              className={`${inputCls} w-36`}
              value={cat.label}
              placeholder="Label"
              onChange={(e) => {
                const categories = section.categories.slice();
                categories[i] = { ...cat, label: e.target.value };
                onChange({ ...section, categories });
              }}
            />
            <input
              className={`${inputCls} flex-1`}
              value={cat.intro ?? ""}
              placeholder="Intro line"
              onChange={(e) => {
                const categories = section.categories.slice();
                categories[i] = { ...cat, intro: e.target.value || undefined };
                onChange({ ...section, categories });
              }}
            />
            <SourceChip
              bind={cat.bind}
              onUnbind={() => {
                const categories = section.categories.slice();
                categories[i] = { ...cat, bind: undefined };
                onChange({ ...section, categories });
              }}
            />
            <span className={monoChip}>{cat.items.length} authored</span>
            <button
              type="button"
              className="rounded-md border border-dashed border-amber-600/60 px-2 py-1 text-[11px] text-amber-400 hover:bg-amber-500/10"
              onClick={() => onConnect({ mode: "gardenCategory", categoryIndex: i })}
            >
              ⚡ Connect
            </button>
            <button
              type="button"
              aria-label="Remove category"
              className="text-white/30 hover:text-rose-400"
              onClick={() =>
                onChange({
                  ...section,
                  categories: section.categories.filter((_, j) => j !== i),
                })
              }
            >
              ✕
            </button>
          </div>

          {cat.items.length > 0 && (
            <ul className="mt-2 divide-y divide-white/5 rounded-md border border-white/5">
              {cat.items.map((it, k) => {
                const key = `${i}:${k}`;
                const inherited = inheritedFor(it.ref);
                const open = openItem === key;
                return (
                  <li key={k} className={it.hidden ? "opacity-45" : undefined}>
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenItem(open ? null : key)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="w-3 text-white/35">{open ? "▾" : "▸"}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {it.title ?? inherited?.title ?? "(untitled)"}
                        </span>
                      </button>
                      <span className={monoChip}>
                        {(it.sub?.length ?? 0)} rungs
                      </span>
                      <button
                        type="button"
                        aria-label="Remove item"
                        className="text-white/30 hover:text-rose-400"
                        onClick={() => {
                          const categories = section.categories.slice();
                          categories[i] = {
                            ...cat,
                            items: cat.items.filter((_, j) => j !== k),
                          };
                          onChange({ ...section, categories });
                          setOpenItem(null);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    {open && (
                      <GardenItemEditor
                        item={it}
                        inherited={inherited}
                        onChange={(next) => {
                          const categories = section.categories.slice();
                          const items = cat.items.slice();
                          items[k] = next;
                          categories[i] = { ...cat, items };
                          onChange({ ...section, categories });
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
      {section.categories.length === 0 && (
        <li className="rounded-md border border-white/5 px-3 py-4 text-center text-xs text-white/35">
          No categories yet — add one, then connect directories via the picker
          (next sprint).
        </li>
      )}
      <button
        type="button"
        className="rounded-md border border-dashed border-white/20 px-3 py-1.5 text-xs text-white/50 hover:border-amber-500/50 hover:text-amber-400"
        onClick={() =>
          onChange({
            ...section,
            categories: [
              ...section.categories,
              {
                key: `category-${section.categories.length + 1}`,
                label: "New category",
                title: "New category",
                kind: "shoot",
                items: [],
              },
            ],
          })
        }
      >
        + Add category
      </button>
    </ul>
  );
}

export function SectionCard({
  section,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  onConnect,
  inheritedFor,
}: {
  section: PageSection;
  index: number;
  total: number;
  onChange: (next: PageSection) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onConnect: (target: PickerTarget) => void;
  inheritedFor: InheritedLookup;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={monoChip}>{SECTION_TYPE_LABELS[section.type]}</span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Move section up"
          disabled={index === 0}
          className="px-1 text-white/40 hover:text-white/80 disabled:opacity-20"
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move section down"
          disabled={index === total - 1}
          className="px-1 text-white/40 hover:text-white/80 disabled:opacity-20"
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label="Remove section"
          className="px-1 text-white/30 hover:text-rose-400"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>

      {section.type === "recordList" && (
        <RecordListBody
          section={section}
          onChange={onChange}
          onConnect={onConnect}
          inheritedFor={inheritedFor}
        />
      )}
      {section.type === "directoryIndex" && (
        <DirectoryIndexBody section={section} onChange={onChange} onConnect={onConnect} />
      )}
      {section.type === "gardenCategories" && (
        <GardenCategoriesBody
          section={section}
          onChange={onChange}
          onConnect={onConnect}
          inheritedFor={inheritedFor}
        />
      )}
    </section>
  );
}
