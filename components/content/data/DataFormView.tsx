"use client";

/**
 * Form view — private intake forms (plan O13, confirmed in scope for
 * Phase 2; built 2026-08-27).
 *
 * One vertical form per view: fill the fields, submit, the row lands in the
 * table, the form clears for the next entry. Field presentation resolves
 * through `resolveFormField` (plan Phase 2 groundwork): per-VIEW overrides
 * for label/help/required/hidden/placeholder, falling back to the column's
 * own name and description — two forms over one table can read completely
 * differently without touching column storage.
 *
 * v1 boundaries, both deliberate:
 * - Only self-contained field types are offered (text, numbers, dates,
 *   checkbox, options). Relation / content-link / person cells need pickers
 *   with their own fetch flows — those edit in the peek after submission,
 *   and the form says so instead of half-rendering them.
 * - PUBLISHED forms are a separate scoping pass (O13: anonymous writes need
 *   createdBy semantics, rate limiting, spam handling). This surface is for
 *   the signed-in owner.
 */

import { useCallback, useState } from "react";
import { cn } from "@/lib/core/utils";
import {
  resolveFormField,
  sortStatusOptions,
  type DataColumn,
  type DataView,
} from "@/lib/domain/data";

/** Types the form can render as plain inputs, no async pickers involved. */
const FORM_TYPES = new Set([
  "text",
  "longText",
  "number",
  "checkbox",
  "date",
  "select",
  "multiSelect",
  "status",
  "url",
  "email",
]);

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5",
  "text-sm outline-none focus:ring-2 focus:ring-primary"
);

interface DataFormViewProps {
  columns: DataColumn[];
  view: DataView | null;
  canWrite: boolean;
  /** Encode + create the row. Resolves true on success (form then clears). */
  onSubmit: (cells: Record<string, unknown>) => Promise<boolean>;
}

export function DataFormView({
  columns,
  view,
  canWrite,
  onSubmit,
}: DataFormViewProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);

  const overrides = view?.config.fields;
  const fields = columns
    .filter((c) => !c.deletedAt && FORM_TYPES.has(c.type))
    .map((c) => ({ column: c, form: resolveFormField(c, overrides?.[c.id]) }))
    .filter((f) => !f.form.hidden);
  const deferred = columns.filter(
    (c) => !c.deletedAt && !FORM_TYPES.has(c.type)
  );

  const set = useCallback((key: string, value: unknown) => {
    setDraft((d) => {
      const next = { ...d };
      if (value === undefined || value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    const gaps = new Set<string>();
    for (const f of fields) {
      if (f.form.required && draft[f.column.key] === undefined) {
        gaps.add(f.column.key);
      }
    }
    setMissing(gaps);
    if (gaps.size > 0) return;
    setBusy(true);
    try {
      const ok = await onSubmit(draft);
      if (ok) {
        setDraft({});
        setAdded((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, fields, draft, onSubmit]);

  if (!canWrite) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        This form adds rows, and you don&apos;t have write access here.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {fields.map(({ column, form }) => {
        const value = draft[column.key];
        const invalid = missing.has(column.key);
        const options =
          column.type === "status"
            ? sortStatusOptions(column.config.options ?? [])
            : (column.config.options ?? []);
        return (
          <div key={column.id} className="mb-4">
            <label className="mb-1 block text-xs font-medium">
              {form.label}
              {form.required && <span className="text-destructive"> *</span>}
            </label>

            {column.type === "longText" ? (
              <textarea
                value={typeof value === "string" ? value : ""}
                onChange={(e) => set(column.key, e.target.value)}
                rows={3}
                placeholder={form.placeholder ?? undefined}
                className={cn(fieldClass, "resize-none", invalid && "ring-2 ring-destructive")}
              />
            ) : column.type === "checkbox" ? (
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => set(column.key, e.target.checked || undefined)}
                className="h-4 w-4 accent-current"
              />
            ) : column.type === "select" || column.type === "status" ? (
              <select
                value={typeof value === "string" ? value : ""}
                onChange={(e) => set(column.key, e.target.value || undefined)}
                className={cn(fieldClass, invalid && "ring-2 ring-destructive")}
              >
                <option value="">—</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : column.type === "multiSelect" ? (
              <div className="flex flex-col gap-1">
                {options.length === 0 && (
                  <p className="text-[11px] italic text-muted-foreground">
                    No options yet — add them from the column&apos;s header menu.
                  </p>
                )}
                {options.map((o) => {
                  const chosen = new Set(Array.isArray(value) ? value : []);
                  return (
                    <label key={o.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={chosen.has(o.id)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(o.id);
                          else next.delete(o.id);
                          const ids = options
                            .filter((x) => next.has(x.id))
                            .map((x) => x.id);
                          set(column.key, ids.length > 0 ? ids : undefined);
                        }}
                        className="h-3.5 w-3.5 accent-current"
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            ) : (
              <input
                type={
                  column.type === "number"
                    ? "number"
                    : column.type === "date"
                      ? "date"
                      : column.type === "email"
                        ? "email"
                        : "text"
                }
                value={
                  typeof value === "number"
                    ? String(value)
                    : typeof value === "string"
                      ? value
                      : ""
                }
                onChange={(e) => {
                  if (column.type === "number") {
                    set(
                      column.key,
                      e.target.value === "" ? undefined : Number(e.target.value)
                    );
                  } else {
                    set(column.key, e.target.value);
                  }
                }}
                placeholder={form.placeholder ?? undefined}
                className={cn(fieldClass, invalid && "ring-2 ring-destructive")}
              />
            )}

            {form.help && (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {form.help}
              </p>
            )}
            {invalid && (
              <p className="mt-1 text-[11px] text-destructive">
                This field is required.
              </p>
            )}
          </div>
        );
      })}

      {deferred.length > 0 && (
        <p className="mb-4 rounded-md bg-muted/60 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          {deferred.map((c) => c.name).join(", ")} —{" "}
          {deferred.length === 1 ? "this field links" : "these fields link"} to
          other content and {deferred.length === 1 ? "is" : "are"} filled in
          from the row after it&apos;s added.
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {added > 0 &&
            `${added} row${added === 1 ? "" : "s"} added this session`}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add row"}
        </button>
      </div>
    </div>
  );
}
