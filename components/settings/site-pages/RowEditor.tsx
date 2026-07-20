"use client";

/**
 * RowEditor — the expanded detail for one row (S5).
 *
 * Two kinds of row share this editor:
 *   • Manual — every field is authored here.
 *   • Connected (has `ref`) — title/date/blurb are INHERITED from the published
 *     page. Typing in a field turns it into an OVERRIDE (kept in the page
 *     config); clearing it reverts to inherited. The published note is never
 *     modified either way.
 */

import type { RecordItem, GardenItem } from "@/lib/domain/page-layout/schema";
import { EmphasisInput } from "./EmphasisInput";

/** Inherited values for a connected row, resolved from the content index. */
export interface InheritedValues {
  title?: string;
  date?: string;
  blurb?: string;
}

const inputCls =
  "w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm";

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
      <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
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
              title="Go back to the published page's value"
            >
              revert
            </button>
          )}
        </>
      )}
    </span>
  );
}

/** A text field that shows an inherited placeholder until overridden. */
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

/** [label, value] pairs — the expand-drawer facts on a record row. */
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
      <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
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

export function RecordRowEditor({
  item,
  inherited,
  onChange,
}: {
  item: RecordItem;
  inherited?: InheritedValues;
  onChange: (next: RecordItem) => void;
}) {
  const set = <K extends keyof RecordItem>(key: K, value: RecordItem[K]) =>
    onChange({ ...item, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-white/5 px-3 py-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FieldLabel
          label="Title"
          isOverride={item.title !== undefined}
          inherited={inherited?.title !== undefined}
          onRevert={
            inherited?.title !== undefined ? () => set("title", undefined) : undefined
          }
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
              placeholder="Row title"
              onChange={(next) => set("title", next === "" ? undefined : next)}
            />
          </div>
        )}
      </div>

      <OverridableText
        label="Type"
        value={item.type}
        placeholder="Essay · Tool / IDE · Engineering"
        onChange={(v) => set("type", v)}
      />
      <OverridableText
        label="Year (shown)"
        value={item.year}
        placeholder="2023 · 2021– · 2018–21"
        onChange={(v) => set("year", v)}
      />
      <OverridableText
        label="Date (sorts + timeline)"
        value={item.date}
        inheritedValue={inherited?.date}
        placeholder="YYYY-MM-DD"
        onChange={(v) => set("date", v)}
      />

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
          Status
        </span>
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

      <OverridableText
        label="Status label (text)"
        value={item.statusLabel}
        placeholder="Active · Stable · 18 min · Now"
        onChange={(v) => set("statusLabel", v)}
      />

      <div className="flex flex-col gap-1 sm:col-span-2">
        <FieldLabel
          label="Blurb"
          isOverride={item.blurb !== undefined}
          inherited={inherited?.blurb !== undefined}
          onRevert={
            inherited?.blurb !== undefined ? () => set("blurb", undefined) : undefined
          }
        />
        <textarea
          className={`${inputCls} min-h-[54px]`}
          value={item.blurb ?? ""}
          placeholder={inherited?.blurb ?? "Shown when the row is expanded"}
          onChange={(e) => set("blurb", e.target.value === "" ? undefined : e.target.value)}
        />
      </div>

      <div className="sm:col-span-2">
        <PairsEditor
          label="Facts (expand drawer)"
          addLabel="+ Add fact"
          pairs={(item.facts as [string, string][] | undefined) ?? []}
          onChange={(next) => set("facts", next)}
        />
      </div>

      <OverridableText
        label="Timeline note"
        value={item.timelineNote}
        placeholder="the growing tip"
        onChange={(v) => set("timelineNote", v)}
      />

      <div className="flex items-end">
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={item.hidden ?? false}
            onChange={(e) => set("hidden", e.target.checked ? true : undefined)}
          />
          Hide this row from the page
        </label>
      </div>
    </div>
  );
}

export function GardenItemEditor({
  item,
  inherited,
  onChange,
}: {
  item: GardenItem;
  inherited?: InheritedValues;
  onChange: (next: GardenItem) => void;
}) {
  const set = <K extends keyof GardenItem>(key: K, value: GardenItem[K]) =>
    onChange({ ...item, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-white/5 px-3 py-3 sm:grid-cols-2">
      <OverridableText
        label="Title"
        value={item.title}
        inheritedValue={inherited?.title}
        placeholder="Item title"
        onChange={(v) => set("title", v)}
      />
      <OverridableText
        label="Meta"
        value={item.meta}
        placeholder="essay · 12 min"
        onChange={(v) => set("meta", v)}
      />
      <div className="flex flex-col gap-1 sm:col-span-2">
        <FieldLabel
          label="Blurb"
          isOverride={item.blurb !== undefined}
          inherited={inherited?.blurb !== undefined}
          onRevert={
            inherited?.blurb !== undefined ? () => set("blurb", undefined) : undefined
          }
        />
        <textarea
          className={`${inputCls} min-h-[48px]`}
          value={item.blurb ?? ""}
          placeholder={inherited?.blurb ?? "Short description"}
          onChange={(e) => set("blurb", e.target.value === "" ? undefined : e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <PairsEditor
          label="DNA rungs (detail pairs)"
          addLabel="+ Add rung"
          pairs={(item.sub ?? []).map((s): [string, string] => [s.title, s.note])}
          onChange={(next) =>
            set(
              "sub",
              next ? next.map(([title, note]) => ({ title, note })) : undefined,
            )
          }
        />
      </div>
      <div className="flex items-end sm:col-span-2">
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={item.hidden ?? false}
            onChange={(e) => set("hidden", e.target.checked ? true : undefined)}
          />
          Hide this item
        </label>
      </div>
    </div>
  );
}
