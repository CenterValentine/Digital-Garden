/**
 * Document Templates — the user's own .docx files marked as templates.
 *
 * A listing, not a store: files are marked from the file tree (right-click
 * a .docx → Mark as Document Template) and stay in their folders; this
 * card shows what is marked, lets the user unmark, and edits the per-field
 * notes the AI reads alongside the derived contract (what "summary" should
 * hold, how long). Principle 1: no parallel template library.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import type { DocxTemplateRecord, TemplateFieldNote } from "@/lib/domain/ai/docx-templates/record";
import type { TemplateField, TemplateSection } from "@/lib/domain/ai/docx-templates/renderer-client";

interface TemplateSummary {
  contentId: string;
  title: string;
  fileName: string;
  markedAt: string;
  fieldCount: number;
  sectionCount: number;
}

interface FieldRow {
  path: string;
  required: boolean;
  rich: boolean;
  list?: "strings" | "objects";
  depth: number;
}

/** Flatten fields + sections into display rows; section rows carry `list`. */
function flattenRecord(record: DocxTemplateRecord): FieldRow[] {
  const rows: FieldRow[] = [];
  const field = (f: TemplateField, prefix: string, depth: number) =>
    rows.push({ path: prefix + f.path, required: f.required, rich: f.rich, depth });
  const section = (s: TemplateSection, prefix: string, depth: number) => {
    rows.push({
      path: prefix + s.path,
      required: true,
      rich: false,
      list: s.itemIsValue ? "strings" : "objects",
      depth,
    });
    for (const f of s.fields) field(f, `${prefix}${s.path}.`, depth + 1);
    for (const sub of s.sections) section(sub, `${prefix}${s.path}.`, depth + 1);
  };
  for (const f of record.fields) field(f, "", 0);
  for (const s of record.sections) section(s, "", 0);
  return rows;
}

function TemplateDetails({
  contentId,
  onUnmarked,
}: {
  contentId: string;
  onUnmarked: () => void;
}) {
  const [record, setRecord] = useState<DocxTemplateRecord | null>(null);
  const [notes, setNotes] = useState<Record<string, TemplateFieldNote>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/content/docx-templates?contentId=${encodeURIComponent(contentId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          success?: boolean;
          data?: { record: DocxTemplateRecord };
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setError(body.error?.message ?? "Could not load the template");
          return;
        }
        setRecord(body.data.record);
        setNotes(body.data.record.notes ?? {});
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the template");
      });
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const saveNotes = useCallback(
    async (next: Record<string, TemplateFieldNote>) => {
      try {
        const res = await fetch("/api/content/docx-templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ contentId, notes: next }),
        });
        if (!res.ok) throw new Error("save failed");
      } catch {
        toast.error("Could not save the field notes");
      }
    },
    [contentId],
  );

  const updateNote = (path: string, patch: Partial<TemplateFieldNote>) => {
    setNotes((prev) => {
      const current = { ...(prev[path] ?? {}), ...patch };
      if (!current.description?.trim()) delete current.description;
      if (!current.maxLength || current.maxLength <= 0) delete current.maxLength;
      const next = { ...prev };
      if (Object.keys(current).length === 0) delete next[path];
      else next[path] = current;
      return next;
    });
  };

  if (error) return <p className="px-4 py-2 text-xs text-red-500">{error}</p>;
  if (!record) return <p className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">Loading fields…</p>;

  const rows = flattenRecord(record);
  return (
    <div className="border-t border-black/[0.04] dark:border-white/5 px-4 py-2 space-y-1.5">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Notes are read by the AI next to each field — what it should hold, how long. Saved on blur.
      </p>
      {rows.map((row) => (
        <div key={row.path} className="flex items-start gap-2 text-xs" style={{ paddingLeft: row.depth * 14 }}>
          <div className="w-44 shrink-0 pt-1 font-mono text-[11px] text-gray-700 dark:text-gray-300 truncate" title={row.path}>
            {row.path.split(".").pop()}
            {row.list && <span className="ml-1 text-gray-500">[] {row.list}</span>}
            {!row.required && <span className="ml-1 text-gray-500">optional</span>}
            {row.rich && <span className="ml-1 text-gray-500">link</span>}
          </div>
          {!row.list && (
            <>
              <input
                type="text"
                placeholder="Description"
                value={notes[row.path]?.description ?? ""}
                onChange={(e) => updateNote(row.path, { description: e.target.value })}
                onBlur={() => saveNotes(notes)}
                className="flex-1 px-2 py-1 bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="number"
                min={1}
                placeholder="max chars"
                value={notes[row.path]?.maxLength ?? ""}
                onChange={(e) =>
                  updateNote(row.path, { maxLength: e.target.value ? Number(e.target.value) : undefined })
                }
                onBlur={() => saveNotes(notes)}
                className="w-24 px-2 py-1 bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </>
          )}
          {row.list && (
            <input
              type="text"
              placeholder="What each item is"
              value={notes[row.path]?.description ?? ""}
              onChange={(e) => updateNote(row.path, { description: e.target.value })}
              onBlur={() => saveNotes(notes)}
              className="flex-1 px-2 py-1 bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
        </div>
      ))}
      {record.warnings.length > 0 && (
        <p className="text-[11px] text-yellow-600 dark:text-yellow-400">{record.warnings.join(" ")}</p>
      )}
      <div className="pt-1">
        <button
          type="button"
          onClick={onUnmarked}
          className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-red-500"
        >
          <Trash2 className="h-3 w-3" /> Unmark template
        </button>
      </div>
    </div>
  );
}

export function DocxTemplateManager() {
  const glass0 = getSurfaceStyles("glass-0");
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/content/docx-templates", { credentials: "include" });
      if (res.status === 503) {
        setUnavailable(true);
        return;
      }
      const body = (await res.json()) as { success?: boolean; data?: TemplateSummary[] };
      if (!res.ok || !body.success) throw new Error("fetch failed");
      setTemplates(body.data ?? []);
    } catch {
      toast.error("Failed to load document templates");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const unmark = async (contentId: string, title: string) => {
    try {
      const res = await fetch(`/api/content/docx-templates?contentId=${encodeURIComponent(contentId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("request failed");
      toast.success(`"${title}" is no longer a document template`);
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      setExpanded(null);
      fetchTemplates();
    } catch {
      toast.error("Failed to unmark the template");
    }
  };

  return (
    <div
      className="border border-black/10 dark:border-white/10 rounded-lg p-6"
      style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
    >
      <h3 className="text-lg font-semibold mb-1">Document Templates</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Your own Word files with <code className="text-xs">{"{{ fields }}"}</code>, kept where they are. The AI fills them
        through <span className="font-mono text-xs">fill_docx_template</span>, preserving the layout. Mark one by
        right-clicking a .docx in the file tree.
      </p>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      ) : unavailable ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
          The document renderer is not configured on this deployment.
        </p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
          No document templates yet. Right-click a .docx in the file tree → Mark as Document Template.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <div key={tpl.contentId} className="border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 p-2 bg-black/[0.025] dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === tpl.contentId ? null : tpl.contentId)}
                  className="p-0.5 rounded hover:bg-black/[0.05] dark:hover:bg-white/10 text-gray-600 dark:text-gray-400"
                  aria-label={expanded === tpl.contentId ? "Collapse" : "Expand"}
                >
                  {expanded === tpl.contentId ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <FileText className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 shrink-0" />
                <span className="flex-1 text-sm font-medium truncate" title={tpl.fileName}>
                  {tpl.title}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {tpl.fieldCount} field{tpl.fieldCount !== 1 ? "s" : ""} · {tpl.sectionCount} section
                  {tpl.sectionCount !== 1 ? "s" : ""}
                </span>
              </div>
              {expanded === tpl.contentId && (
                <TemplateDetails contentId={tpl.contentId} onUnmarked={() => unmark(tpl.contentId, tpl.title)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
