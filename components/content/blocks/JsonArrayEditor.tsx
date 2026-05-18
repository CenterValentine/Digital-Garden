/**
 * JsonArrayEditor
 *
 * Visual editor for JSON array block fields (metrics, skills, logos, FAQ, etc.).
 * Renders each item as a card with labelled form controls.
 * Includes a "Raw JSON" toggle so power users can edit the underlying JSON directly.
 * Validates both the visual output and raw JSON, surfacing errors inline.
 *
 * Also exports StringArrayEditor for simple string[] fields (pricing features, tags).
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Code2, Upload, Link2, X, Loader2, Info } from "lucide-react";

// ─── Item field descriptor ────────────────────────────────────────────────────

export interface JsonArrayItemField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "url" | "image" | "textarea" | "date" | "icon";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  tooltip?: string;
}

// ─── Compact inline image field ───────────────────────────────────────────────

function ItemImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(!value);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
      onChange(json.url);
      setShowUrl(false);
    } catch {
      setShowUrl(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1">
      {value && (
        <div className="relative rounded overflow-hidden h-10 border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => { onChange(""); setShowUrl(true); }}
            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-white/15 bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {value ? "Replace" : "Upload"}
        </button>
        <button
          type="button"
          onClick={() => setShowUrl((v) => !v)}
          className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-white/15 bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors"
        >
          <Link2 className="w-3 h-3" /> URL
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      {showUrl && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="w-full px-2 py-1 text-[11px] rounded bg-white/8 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none font-mono"
        />
      )}
    </div>
  );
}

// ─── Single item field input ──────────────────────────────────────────────────

function ItemFieldInput({
  field,
  value,
  onChange,
}: {
  field: JsonArrayItemField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const baseClass =
    "w-full px-2 py-1 text-xs rounded bg-white/8 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none";

  if (field.type === "image") {
    return <ItemImageField value={(value as string) || ""} onChange={onChange} />;
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={baseClass}
        style={{ colorScheme: "dark" }}
      />
    );
  }

  if (field.type === "icon") {
    return (
      <div className="flex items-center gap-1.5">
        {value ? (
          <span className="text-lg leading-none">{value as string}</span>
        ) : (
          <span className="text-gray-600 text-xs">No emoji</span>
        )}
        <input
          type="text"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={field.placeholder ?? "e.g. ⚡"}
          className={`flex-1 ${baseClass}`}
          maxLength={4}
        />
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className={`${baseClass} resize-y font-sans leading-relaxed`}
      />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <select
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={baseClass}
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded"
        />
        <span className="text-xs text-gray-400">{field.placeholder || field.label}</span>
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        value={(value as number) ?? (field.default as number) ?? ""}
        min={field.min}
        max={field.max}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        placeholder={field.placeholder ?? String(field.default ?? "")}
        className={baseClass}
      />
    );
  }

  // text | url
  return (
    <input
      type={field.type === "url" ? "url" : "text"}
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={field.placeholder}
      className={baseClass}
    />
  );
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  schema,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  item: Record<string, unknown>;
  schema: JsonArrayItemField[];
  index: number;
  total: number;
  onChange: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  // Use a compact 2-col grid for simple fields (text/select/number/url); stack for complex (textarea/image)
  const hasComplex = schema.some((f) => f.type === "textarea" || f.type === "image");
  const gridCols = !hasComplex && schema.length >= 2 ? Math.min(schema.length, 2) : 1;

  const isEven = index % 2 === 0;
  return (
    <div className={`rounded-md border overflow-hidden ${isEven ? "border-white/10 bg-white/[0.03]" : "border-white/[0.07] bg-white/[0.06]"}`}>
      {/* Row header */}
      <div className={`flex items-center justify-between px-2 py-1 border-b ${isEven ? "border-white/[0.07] bg-white/[0.04]" : "border-white/10 bg-white/[0.08]"}`}>
        <span className="text-[10px] text-gray-500 font-mono font-medium">#{index + 1}</span>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-0.5 rounded text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"
            title="Move up"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="p-0.5 rounded text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"
            title="Move down"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-0.5 rounded text-gray-600 hover:text-rose-400 transition-colors"
            title="Remove item"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div
        className="p-2.5 gap-2"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        }}
      >
        {schema.map((field) => (
          <div
            key={field.key}
            style={field.type === "textarea" || field.type === "image" || field.type === "icon" ? { gridColumn: "1 / -1" } : undefined}
          >
            <label className="flex items-center gap-1 text-[10px] text-gray-500 mb-0.5">
              <span>
                {field.label}
                {field.required && <span className="text-rose-400 ml-0.5">*</span>}
              </span>
              {field.tooltip && (
                <span title={field.tooltip} className="cursor-help text-gray-600 hover:text-gray-400 transition-colors">
                  <Info className="w-2.5 h-2.5" />
                </span>
              )}
            </label>
            <ItemFieldInput
              field={field}
              value={item[field.key]}
              onChange={(v) => {
                const next = { ...item };
                if (v === undefined || v === "") {
                  delete next[field.key];
                } else {
                  next[field.key] = v;
                }
                onChange(next);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDefault(schema: JsonArrayItemField[]): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const f of schema) {
    if (f.default !== undefined) {
      item[f.key] = f.default;
    } else if (f.type === "boolean") {
      item[f.key] = false;
    } else if (f.type === "select" && f.options?.length) {
      item[f.key] = f.options[0].value;
    }
    // text/url/number/image/textarea: omit (empty = not present)
  }
  return item;
}

function parseJsonItems(raw: string): { items: Record<string, unknown>[]; error: string | null } {
  let parsed: unknown;
  try {
    parsed = raw.trim() ? JSON.parse(raw) : [];
  } catch (e) {
    return { items: [], error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(parsed)) {
    return { items: [], error: "Must be a JSON array — starts with [ and ends with ]" };
  }
  return { items: parsed as Record<string, unknown>[], error: null };
}

function validateItems(
  items: Record<string, unknown>[],
  schema: JsonArrayItemField[]
): string | null {
  for (let i = 0; i < items.length; i++) {
    if (typeof items[i] !== "object" || items[i] === null || Array.isArray(items[i])) {
      return `Item ${i + 1}: must be an object, not a primitive`;
    }
    for (const field of schema) {
      if (field.required) {
        const v = items[i][field.key];
        if (v === undefined || v === "" || v === null) {
          return `Item ${i + 1}: "${field.label}" is required`;
        }
      }
    }
  }
  return null;
}

// ─── JsonArrayEditor ──────────────────────────────────────────────────────────

export function JsonArrayEditor({
  value,
  onChange,
  itemSchema,
  addLabel = "Add item",
  emptyMessage = "No items yet",
}: {
  value: string;
  onChange: (json: string) => void;
  itemSchema: JsonArrayItemField[];
  addLabel?: string;
  emptyMessage?: string;
}) {
  // Parse initial value once
  const [items, setItems] = useState<Record<string, unknown>[]>(() => {
    const { items: parsed } = parseJsonItems(value || "[]");
    return parsed;
  });
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState(() => value || "[]");
  const [rawError, setRawError] = useState<string | null>(null);

  const commit = useCallback(
    (next: Record<string, unknown>[]) => {
      const valError = validateItems(next, itemSchema);
      const json = JSON.stringify(next);
      setItems(next);
      setRawText(json);
      setRawError(valError);
      onChange(json);
    },
    [onChange, itemSchema]
  );

  function handleRawChange(text: string) {
    setRawText(text);
    const { items: parsed, error: parseError } = parseJsonItems(text);
    if (parseError) {
      setRawError(parseError);
      return;
    }
    const valError = validateItems(parsed, itemSchema);
    setRawError(valError);
    setItems(parsed);
    onChange(JSON.stringify(parsed));
  }

  function enterRawMode() {
    // Pretty-print for human editing
    setRawText(JSON.stringify(items, null, 2));
    setRawError(validateItems(items, itemSchema));
    setShowRaw(true);
  }

  return (
    <div className="space-y-2">
      {/* Header: item count + mode toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
        <button
          type="button"
          onClick={() => (showRaw ? setShowRaw(false) : enterRawMode())}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Code2 className="w-3 h-3" />
          {showRaw ? "Visual editor" : "Raw JSON"}
        </button>
      </div>

      {showRaw ? (
        /* ── Raw JSON editor ── */
        <div className="space-y-1">
          <textarea
            value={rawText}
            onChange={(e) => handleRawChange(e.target.value)}
            rows={Math.min(Math.max(rawText.split("\n").length + 1, 5), 20)}
            spellCheck={false}
            className={`w-full px-2 py-1.5 text-[11px] rounded-md border bg-black/30 text-gray-200 focus:outline-none font-mono resize-y leading-relaxed ${
              rawError
                ? "border-rose-500/40 focus:border-rose-500/60"
                : "border-white/12 focus:border-blue-500/50"
            }`}
          />
          {rawError && (
            <p className="text-[10px] text-rose-400 flex items-start gap-1">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{rawError}</span>
            </p>
          )}
          {!rawError && items.length >= 0 && (
            <p className="text-[10px] text-emerald-500/80">✓ Valid JSON — {items.length} item{items.length !== 1 ? "s" : ""}</p>
          )}
        </div>
      ) : (
        /* ── Visual editor ── */
        <div className="space-y-1.5">
          {items.length === 0 && (
            <p className="text-xs text-gray-500/80 text-center py-3 border border-dashed border-white/10 rounded-md">
              {emptyMessage}
            </p>
          )}
          {items.map((item, i) => (
            <ItemRow
              key={i}
              item={item}
              schema={itemSchema}
              index={i}
              total={items.length}
              onChange={(patch) => commit(items.map((it, idx) => (idx === i ? patch : it)))}
              onRemove={() => commit(items.filter((_, idx) => idx !== i))}
              onMove={(dir) => {
                const next = [...items];
                const j = i + dir;
                if (j >= 0 && j < next.length) {
                  [next[i], next[j]] = [next[j], next[i]];
                  commit(next);
                }
              }}
            />
          ))}

          {/* Validation error summary (from visual edits) */}
          {rawError && (
            <p className="text-[10px] text-rose-400 flex items-start gap-1 px-1">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{rawError}</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => commit([...items, makeDefault(itemSchema)])}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-dashed border-white/12 bg-white/[0.02] text-xs text-gray-500 hover:border-white/25 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
          >
            <Plus className="w-3 h-3" />
            {addLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── StringArrayEditor ────────────────────────────────────────────────────────

export function StringArrayEditor({
  value,
  onChange,
  placeholder = "Enter text",
  addLabel = "Add item",
  emptyMessage = "No items yet",
}: {
  value: string;
  onChange: (json: string) => void;
  placeholder?: string;
  addLabel?: string;
  emptyMessage?: string;
}) {
  function parse(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      /* fall through */
    }
    return [];
  }

  const [items, setItems] = useState<string[]>(() => parse(value));
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState(() => value || "[]");
  const [rawError, setRawError] = useState<string | null>(null);

  const commit = useCallback(
    (next: string[]) => {
      const json = JSON.stringify(next);
      setItems(next);
      setRawText(json);
      onChange(json);
    },
    [onChange]
  );

  function handleRawChange(text: string) {
    setRawText(text);
    try {
      const parsed = JSON.parse(text || "[]");
      if (!Array.isArray(parsed)) { setRawError("Must be a JSON array"); return; }
      if (parsed.some((i) => typeof i !== "string")) { setRawError("All items must be strings"); return; }
      setRawError(null);
      setItems(parsed);
      onChange(JSON.stringify(parsed));
    } catch (e) {
      setRawError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
        <button
          type="button"
          onClick={() => {
            if (showRaw) {
              setShowRaw(false);
            } else {
              setRawText(JSON.stringify(items, null, 2));
              setShowRaw(true);
            }
          }}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Code2 className="w-3 h-3" />
          {showRaw ? "Visual editor" : "Raw JSON"}
        </button>
      </div>

      {showRaw ? (
        <div className="space-y-1">
          <textarea
            value={rawText}
            onChange={(e) => handleRawChange(e.target.value)}
            rows={Math.max(4, items.length + 2)}
            spellCheck={false}
            className={`w-full px-2 py-1.5 text-[11px] rounded-md border bg-black/30 text-gray-200 focus:outline-none font-mono resize-y leading-relaxed ${
              rawError
                ? "border-rose-500/40 focus:border-rose-500/60"
                : "border-white/12 focus:border-blue-500/50"
            }`}
          />
          {rawError && <p className="text-[10px] text-rose-400">⚠ {rawError}</p>}
          {!rawError && <p className="text-[10px] text-emerald-500/80">✓ Valid — {items.length} item{items.length !== 1 ? "s" : ""}</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.length === 0 && (
            <p className="text-xs text-gray-500/80 text-center py-3 border border-dashed border-white/10 rounded-md">
              {emptyMessage}
            </p>
          )}
          {items.map((item, i) => (
            <div key={i} className="flex gap-1 items-center">
              <input
                type="text"
                value={item}
                onChange={(e) =>
                  commit(items.map((v, idx) => (idx === i ? e.target.value : v)))
                }
                placeholder={placeholder}
                className="flex-1 px-2 py-1 text-xs rounded bg-white/8 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none"
              />
              <div className="flex gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (i === 0) return;
                    const n = [...items];
                    [n[i - 1], n[i]] = [n[i], n[i - 1]];
                    commit(n);
                  }}
                  disabled={i === 0}
                  className="p-0.5 rounded text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (i >= items.length - 1) return;
                    const n = [...items];
                    [n[i], n[i + 1]] = [n[i + 1], n[i]];
                    commit(n);
                  }}
                  disabled={i === items.length - 1}
                  className="p-0.5 rounded text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => commit(items.filter((_, idx) => idx !== i))}
                  className="p-0.5 rounded text-gray-600 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => commit([...items, ""])}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-dashed border-white/12 bg-white/[0.02] text-xs text-gray-500 hover:border-white/25 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
          >
            <Plus className="w-3 h-3" />
            {addLabel}
          </button>
        </div>
      )}
    </div>
  );
}
