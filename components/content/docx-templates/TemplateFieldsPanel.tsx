/**
 * Template Fields — right-sidebar rail for a document filled from a template.
 *
 * Shows the values the document was rendered from (in the template's
 * contract order), lets the user edit them, and re-renders WITHOUT a model
 * turn: same template, same node id, same judge. Provenance per field is
 * shown as a count. A refused re-render leaves the file untouched and lists
 * the problems here.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { readFillRecord, type DocxFillRecord, type DocxTemplateRecord } from "@/lib/domain/ai/docx-templates/record";
import type { TemplateField, TemplateSection } from "@/lib/domain/ai/docx-templates/renderer-client";

type Values = Record<string, unknown>;

function getAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object" || Array.isArray(acc)) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function setAt(obj: Values, path: string, value: unknown): Values {
  const [head, ...rest] = path.split(".");
  const next = { ...obj };
  if (rest.length === 0) {
    next[head] = value;
    return next;
  }
  const child = next[head];
  next[head] = setAt(child && typeof child === "object" && !Array.isArray(child) ? (child as Values) : {}, rest.join("."), value);
  return next;
}

const inputClass =
  "w-full px-2 py-1 bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500";

function ScalarInput({
  field,
  value,
  onChange,
  cited,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
  cited: number;
}) {
  const label = field.path.split(".").pop();
  const isLink = field.rich && value && typeof value === "object" && "url" in (value as Record<string, unknown>);
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
        {label}
        {!field.required && <span>· optional</span>}
        {cited > 0 && <span title="cited sources">· {cited} source{cited === 1 ? "" : "s"}</span>}
      </span>
      {field.rich ? (
        <div className="flex gap-1">
          <input
            className={inputClass}
            placeholder="text"
            value={isLink ? String((value as { text?: unknown }).text ?? "") : typeof value === "string" ? value : ""}
            onChange={(e) =>
              onChange(isLink ? { ...(value as Record<string, unknown>), text: e.target.value } : e.target.value)
            }
          />
          <input
            className={inputClass}
            placeholder="https://…"
            value={isLink ? String((value as { url?: unknown }).url ?? "") : ""}
            onChange={(e) =>
              onChange({ text: isLink ? (value as { text?: unknown }).text : value, url: e.target.value })
            }
          />
        </div>
      ) : typeof value === "string" && value.length > 80 ? (
        <textarea className={`${inputClass} min-h-[60px]`} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          className={inputClass}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function SectionEditor({
  section,
  value,
  onChange,
  provenance,
  pathPrefix,
}: {
  section: TemplateSection;
  value: unknown;
  onChange: (v: unknown[]) => void;
  provenance: Record<string, string[]>;
  pathPrefix: string;
}) {
  const items = Array.isArray(value) ? value : [];
  const key = pathPrefix + section.path;
  if (section.itemIsValue) {
    const cited = items.filter((_, i) => (provenance[`${key}[${i}]`]?.length ?? 0) > 0 || (provenance[key]?.length ?? 0) > 0).length;
    return (
      <label className="block">
        <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
          {section.path} <span>· one per line · {items.length} item{items.length === 1 ? "" : "s"}</span>
          {cited > 0 && <span>· {cited} cited</span>}
        </span>
        <textarea
          className={`${inputClass} min-h-[80px] font-normal`}
          value={items.map((v) => (v === null || v === undefined ? "" : String(v))).join("\n")}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          onBlur={(e) => onChange(e.target.value.split("\n").filter((l) => l.trim() !== ""))}
        />
      </label>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
        <span>
          {section.path} · {items.length} item{items.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => onChange([...items, {}])}
        >
          + add
        </button>
      </div>
      {items.map((item, index) => {
        const itemObj = item && typeof item === "object" && !Array.isArray(item) ? (item as Values) : {};
        const itemKey = `${key}[${index}]`;
        return (
          <div key={index} className="rounded border border-black/[0.08] dark:border-white/10 p-2 space-y-1.5">
            <div className="flex justify-end">
              <button
                type="button"
                className="text-[11px] text-gray-500 hover:text-red-500"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                remove
              </button>
            </div>
            {section.fields.map((f) => (
              <ScalarInput
                key={f.path}
                field={f}
                value={getAt(itemObj, f.path)}
                cited={provenance[`${itemKey}.${f.path}`]?.length ?? 0}
                onChange={(v) => {
                  const next = [...items];
                  next[index] = setAt(itemObj, f.path, v);
                  onChange(next);
                }}
              />
            ))}
            {section.sections.map((sub) => (
              <SectionEditor
                key={sub.path}
                section={sub}
                value={getAt(itemObj, sub.path)}
                provenance={provenance}
                pathPrefix={`${itemKey}.`}
                onChange={(v) => {
                  const next = [...items];
                  next[index] = setAt(itemObj, sub.path, v);
                  onChange(next);
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function TemplateFieldsPanel({ contentId }: { contentId: string }) {
  const [fill, setFill] = useState<DocxFillRecord | null>(null);
  const [template, setTemplate] = useState<{ title: string; record: DocxTemplateRecord } | null>(null);
  const [values, setValues] = useState<Values>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/content/content/${contentId}`, { credentials: "include" });
      const body = (await res.json()) as { data?: { file?: { storageMetadata?: unknown } } };
      const record = readFillRecord(body.data?.file?.storageMetadata);
      if (!record) {
        setError("This file was not produced from a template.");
        return;
      }
      setFill(record);
      setValues(record.values);
      setDirty(false);
      const tplRes = await fetch(`/api/content/docx-templates?contentId=${encodeURIComponent(record.templateId)}`, {
        credentials: "include",
      });
      const tplBody = (await tplRes.json()) as {
        success?: boolean;
        data?: { title: string; record: DocxTemplateRecord };
        error?: { message?: string };
      };
      if (!tplRes.ok || !tplBody.success || !tplBody.data) {
        setError(tplBody.error?.message ?? "The template this document came from is not available.");
        return;
      }
      setTemplate(tplBody.data);
    } catch {
      setError("Could not load the document's fields.");
    }
  }, [contentId]);

  useEffect(() => {
    load();
  }, [load]);

  const provenance = useMemo(() => fill?.provenance ?? {}, [fill]);

  const update = (path: string, v: unknown) => {
    setValues((prev) => setAt(prev, path, v));
    setDirty(true);
    setProblems([]);
  };

  const rerender = async () => {
    setBusy(true);
    setProblems([]);
    try {
      const res = await fetch("/api/content/docx-templates/rerender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ contentId, values, provenance: fill?.provenance }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        data?: { report?: { filled?: string; overLength?: string[]; uncited?: string[] }; templateChanged?: boolean };
        error?: { message?: string; problems?: string[] };
      };
      if (!res.ok || !body.success) {
        setProblems(body.error?.problems?.length ? body.error.problems : [body.error?.message ?? "Re-render refused"]);
        toast.error(body.error?.message ?? "Re-render refused — the document was not changed");
        return;
      }
      setDirty(false);
      const r = body.data?.report;
      toast.success("Document re-rendered", {
        description: [r?.filled, r?.overLength?.length ? `${r.overLength.length} over length` : "", body.data?.templateChanged ? "template had changed — refreshed" : ""]
          .filter(Boolean)
          .join(" · "),
      });
      // Same id, new bytes: the open viewer refetches on a non-title update.
      window.dispatchEvent(new CustomEvent("content-updated", { detail: { contentId, updates: { overwritten: true } } }));
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      await load();
    } catch {
      toast.error("Re-render failed");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="p-3 text-xs text-gray-500 dark:text-gray-400">{error}</p>;
  if (!fill || !template) return <p className="p-3 text-xs text-gray-500 dark:text-gray-400">Loading fields…</p>;

  const { record } = template;
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
        From template <span className="font-medium text-gray-700 dark:text-gray-300">{template.title}</span>
        {fill.renderedAt && <> · rendered {new Date(fill.renderedAt).toLocaleString()}</>}
        {fill.report?.filled && <> · {fill.report.filled}</>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 space-y-3">
        {record.fields.map((f) => (
          <ScalarInput
            key={f.path}
            field={f}
            value={getAt(values, f.path)}
            cited={provenance[f.path]?.length ?? 0}
            onChange={(v) => update(f.path, v)}
          />
        ))}
        {record.sections.map((s) => (
          <SectionEditor
            key={s.path}
            section={s}
            value={getAt(values, s.path)}
            provenance={provenance}
            pathPrefix=""
            onChange={(v) => update(s.path, v)}
          />
        ))}
        {fill.report?.uncited && fill.report.uncited.length > 0 && (
          <p className="text-[11px] text-yellow-600 dark:text-yellow-400">
            Uncited: {fill.report.uncited.join(", ")}
          </p>
        )}
        {problems.length > 0 && (
          <ul className="rounded border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-600 dark:text-red-400 space-y-0.5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-black/10 dark:border-white/10 p-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={rerender}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Re-rendering…" : "Re-render document"}
        </button>
        {dirty && !busy && (
          <button
            type="button"
            onClick={() => {
              setValues(fill.values);
              setDirty(false);
              setProblems([]);
            }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
          >
            Discard edits
          </button>
        )}
        <span className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">No AI call · same file</span>
      </div>
    </div>
  );
}
