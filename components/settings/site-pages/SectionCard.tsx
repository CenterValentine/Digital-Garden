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

import type {
  PageSection,
  RecordListSection,
  DirectoryIndexSection,
  GardenCategoriesSection,
} from "@/lib/domain/page-layout/schema";
import { SECTION_TYPE_LABELS } from "./defaults";

const inputCls =
  "rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm min-w-0";
const monoChip =
  "inline-flex items-center rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/50";

function SourceChip({ bind }: { bind?: string }) {
  if (!bind) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
      auto · {bind.replace("publicPath:", "")}
    </span>
  );
}

function RecordListBody({
  section,
  onChange,
}: {
  section: RecordListSection;
  onChange: (next: RecordListSection) => void;
}) {
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
        <SourceChip bind={section.bind} />
      </div>

      <ul className="divide-y divide-white/5 rounded-md border border-white/5">
        {section.items.map((item, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2">
            <input
              className={`${inputCls} flex-1 font-serif`}
              value={item.title ?? ""}
              placeholder={item.ref ? "(title inherited from publication)" : "Row title"}
              onChange={(e) => {
                const items = section.items.slice();
                items[i] = { ...item, title: e.target.value || undefined };
                onChange({ ...section, items });
              }}
            />
            <span className="hidden font-mono text-[11px] text-white/40 sm:inline">
              {item.type ?? ""} {item.year ? `· ${item.year}` : ""}
            </span>
            <span className={monoChip}>
              {item.ref ? item.ref.replace("publicItem:", "item: ") : "manual"}
            </span>
            <button
              type="button"
              aria-label="Remove row"
              className="text-white/30 hover:text-rose-400"
              onClick={() => {
                const items = section.items.filter((_, j) => j !== i);
                onChange({ ...section, items });
              }}
            >
              ✕
            </button>
          </li>
        ))}
        {section.items.length === 0 && !section.bind && (
          <li className="px-3 py-4 text-center text-xs text-white/35">
            No rows yet — add one below, or connect a directory (picker arrives
            with the next sprint).
          </li>
        )}
      </ul>

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
  );
}

function DirectoryIndexBody({
  section,
  onChange,
}: {
  section: DirectoryIndexSection;
  onChange: (next: DirectoryIndexSection) => void;
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
          No directories yet — the content picker (next sprint) adds them.
        </li>
      )}
    </ul>
  );
}

function GardenCategoriesBody({
  section,
  onChange,
}: {
  section: GardenCategoriesSection;
  onChange: (next: GardenCategoriesSection) => void;
}) {
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
            <SourceChip bind={cat.bind} />
            <span className={monoChip}>{cat.items.length} authored</span>
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
}: {
  section: PageSection;
  index: number;
  total: number;
  onChange: (next: PageSection) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
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
        <RecordListBody section={section} onChange={onChange} />
      )}
      {section.type === "directoryIndex" && (
        <DirectoryIndexBody section={section} onChange={onChange} />
      )}
      {section.type === "gardenCategories" && (
        <GardenCategoriesBody section={section} onChange={onChange} />
      )}
    </section>
  );
}
