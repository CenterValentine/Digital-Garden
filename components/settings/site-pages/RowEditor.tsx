"use client";

/**
 * ItemEditor — the expanded detail for one list item (v1.1 unified model).
 *
 * One item type; which fields show depends on the page `kind` (record ledger
 * vs garden vs simple list). Connected items (with a `ref`) show title/date/
 * blurb as INHERITED from the published page; editing flips a field to
 * OVERRIDE. The published note is never modified.
 *
 * Directory items (ref = publicPath) aren't edited here — they expand into
 * their published pages at render — so the section card doesn't open this for
 * them.
 */

import type { ListItem } from "@/lib/domain/page-layout/schema";
import type { PageKind } from "./defaults";
import { EmphasisInput } from "./EmphasisInput";

/** Inherited values for a connected item, resolved from the content index. */
export interface InheritedValues {
  title?: string;
  date?: string;
  blurb?: string;
}

const inputCls = "w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm";

function FieldLabel({
  label,
  isOverride,
  inherited,
  onRevert,
}: {
  label: string;
  isOverride: boolean;
  inherited: boolean;
  onRevert?: () => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      {inherited && !isOverride && (
        <span
          className="rounded bg-white/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-white/45"
          title="Coming from the published page"
        >
          Inherited
        </span>
      )}
      {isOverride && (
        <>
          <span
            className="rounded bg-amber-500/15 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-amber-400"
            title="Set here — overrides the published page for display only"
          >
            Override
          </span>
          {onRevert && (
            <button
              type="button"
              onClick={onRevert}
              className="text-[10px] text-white/35 underline decoration-dotted underline-offset-2 hover:text-white/70"
            >
              revert
            </button>
          )}
        </>
      )}
    </span>
  );
}

function OverridableText({
  label,
  value,
  inheritedValue,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | undefined;
  inheritedValue?: string;
  placeholder?: string;
  onChange: (next: string | undefined) => void;
}) {
  const isOverride = value !== undefined;
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel
        label={label}
        isOverride={isOverride}
        inherited={inheritedValue !== undefined}
        onRevert={inheritedValue !== undefined ? () => onChange(undefined) : undefined}
      />
      <input
        className={`${inputCls} ${!isOverride && inheritedValue ? "text-white/45" : ""}`}
        value={value ?? ""}
        placeholder={inheritedValue ?? placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
    </div>
  );
}

function PairsEditor({
  label,
  addLabel,
  pairs,
  onChange,
}: {
  label: string;
  addLabel: string;
  pairs: [string, string][];
  onChange: (next: [string, string][] | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      <ul className="space-y-1">
        {pairs.map(([k, v], i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              className={`${inputCls} flex-1`}
              value={k}
              placeholder="Label"
              onChange={(e) => {
                const next = pairs.map((p): [string, string] => [p[0], p[1]]);
                next[i] = [e.target.value, v];
                onChange(next);
              }}
            />
            <input
              className={`${inputCls} flex-[2]`}
              value={v}
              placeholder="Value"
              onChange={(e) => {
                const next = pairs.map((p): [string, string] => [p[0], p[1]]);
                next[i] = [k, e.target.value];
                onChange(next);
              }}
            />
            <button
              type="button"
              aria-label="Remove pair"
              className="text-white/30 hover:text-rose-400"
              onClick={() => {
                const next = pairs.filter((_, j) => j !== i);
                onChange(next.length ? next : undefined);
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="self-start rounded-md border border-dashed border-white/20 px-2 py-1 text-[11px] text-white/50 hover:border-amber-500/50 hover:text-amber-400"
        onClick={() => onChange([...pairs, ["", ""]])}
      >
        {addLabel}
      </button>
    </div>
  );
}

function TitleField({
  item,
  inherited,
  set,
}: {
  item: ListItem;
  inherited?: InheritedValues;
  set: <K extends keyof ListItem>(key: K, value: ListItem[K]) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <FieldLabel
        label="Title"
        isOverride={item.title !== undefined}
        inherited={inherited?.title !== undefined}
        onRevert={inherited?.title !== undefined ? () => set("title", undefined) : undefined}
      />
      {item.title === undefined && inherited?.title ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="flex-1 rounded-md border border-dashed border-white/10 px-2 py-1 font-serif text-sm text-white/45">
            {inherited.title}
          </span>
          <button
            type="button"
            className="whitespace-nowrap rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/60 hover:border-amber-600/60 hover:text-amber-400"
            onClick={() => set("title", inherited.title)}
          >
            Override title
          </button>
        </div>
      ) : (
        <div className="mt-1">
          <EmphasisInput
            value={item.title ?? ""}
            placeholder="Title"
            onChange={(next) => set("title", next === "" ? undefined : next)}
          />
        </div>
      )}
    </div>
  );
}

function BlurbField({
  item,
  inherited,
  set,
}: {
  item: ListItem;
  inherited?: InheritedValues;
  set: <K extends keyof ListItem>(key: K, value: ListItem[K]) => void;
}) {
  return (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <FieldLabel
        label="Blurb"
        isOverride={item.blurb !== undefined}
        inherited={inherited?.blurb !== undefined}
        onRevert={inherited?.blurb !== undefined ? () => set("blurb", undefined) : undefined}
      />
      <textarea
        className={`${inputCls} min-h-[52px]`}
        value={item.blurb ?? ""}
        placeholder={inherited?.blurb ?? "Shown when the row is expanded"}
        onChange={(e) => set("blurb", e.target.value === "" ? undefined : e.target.value)}
      />
    </div>
  );
}

function HiddenToggle({
  item,
  set,
}: {
  item: ListItem;
  set: <K extends keyof ListItem>(key: K, value: ListItem[K]) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/60">
      <input
        type="checkbox"
        checked={item.hidden ?? false}
        onChange={(e) => set("hidden", e.target.checked ? true : undefined)}
      />
      Hide from the page
    </label>
  );
}

export function ItemEditor({
  item,
  pageKind,
  inherited,
  onChange,
}: {
  item: ListItem;
  pageKind: PageKind;
  inherited?: InheritedValues;
  onChange: (next: ListItem) => void;
}) {
  const set = <K extends keyof ListItem>(key: K, value: ListItem[K]) =>
    onChange({ ...item, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-white/5 px-3 py-3 sm:grid-cols-2">
      {/* Prose paragraphs have no title — the blurb IS the paragraph. */}
      {pageKind !== "prose" && <TitleField item={item} inherited={inherited} set={set} />}

      {pageKind === "record" && (
        <>
          <OverridableText label="Type" value={item.type} placeholder="Essay · Tool / IDE" onChange={(v) => set("type", v)} />
          <OverridableText label="Year (shown)" value={item.year} placeholder="2023 · 2021–" onChange={(v) => set("year", v)} />
          <OverridableText
            label="Date (sorts + timeline)"
            value={item.date}
            inheritedValue={inherited?.date}
            placeholder="YYYY-MM-DD"
            onChange={(v) => set("date", v)}
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Status</span>
            <div className="flex gap-1.5">
              {(["active", "done"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={item.status === s}
                  onClick={() => set("status", s)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] ${
                    item.status === s
                      ? "border-amber-600/60 bg-amber-500/10 text-amber-400"
                      : "border-white/15 text-white/60 hover:border-white/30"
                  }`}
                >
                  {s === "active" ? "Active" : "Done"}
                </button>
              ))}
            </div>
          </div>
          <OverridableText label="Status label" value={item.statusLabel} placeholder="Active · 18 min · Now" onChange={(v) => set("statusLabel", v)} />
          <BlurbField item={item} inherited={inherited} set={set} />
          <div className="sm:col-span-2">
            <PairsEditor
              label="Facts (expand drawer)"
              addLabel="+ Add fact"
              pairs={(item.facts as [string, string][] | undefined) ?? []}
              onChange={(next) => set("facts", next)}
            />
          </div>
          <OverridableText label="Timeline note" value={item.timelineNote} placeholder="the growing tip" onChange={(v) => set("timelineNote", v)} />
          <div className="flex items-end">
            <HiddenToggle item={item} set={set} />
          </div>
        </>
      )}

      {pageKind === "garden" && (
        <>
          <OverridableText label="Meta" value={item.meta} placeholder="essay · 12 min" onChange={(v) => set("meta", v)} />
          <div className="flex items-end">
            <HiddenToggle item={item} set={set} />
          </div>
          <BlurbField item={item} inherited={inherited} set={set} />
          <div className="sm:col-span-2">
            <PairsEditor
              label="DNA rungs (detail pairs)"
              addLabel="+ Add rung"
              pairs={(item.sub ?? []).map((s): [string, string] => [s.title, s.note])}
              onChange={(next) =>
                set("sub", next ? next.map(([title, note]) => ({ title, note })) : undefined)
              }
            />
          </div>
        </>
      )}

      {pageKind === "index" && (
        <>
          <OverridableText label="Subtitle" value={item.subtitle} placeholder="Optional secondary line" onChange={(v) => set("subtitle", v)} />
          <div className="flex items-end">
            <HiddenToggle item={item} set={set} />
          </div>
          <BlurbField item={item} inherited={inherited} set={set} />
        </>
      )}

      {pageKind === "prose" && (
        <>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
              Paragraph — wrap a phrase in **stars** to bold it
            </span>
            <textarea
              aria-label="Paragraph"
              className={`${inputCls} min-h-[80px] font-serif`}
              value={item.blurb ?? ""}
              placeholder="The paragraph text."
              onChange={(e) => set("blurb", e.target.value === "" ? undefined : e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <HiddenToggle item={item} set={set} />
          </div>
        </>
      )}
    </div>
  );
}
