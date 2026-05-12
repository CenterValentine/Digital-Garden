/**
 * PropertyFieldRenderer
 *
 * Shared form field component used by both:
 * - PropertiesPanel (in-editor block properties tab)
 * - BlockBuilderProperties (builder modal properties panel)
 *
 * Extracted from PropertiesPanel.tsx in Sprint 44b.
 * Updated Sprint 44b: icon selector integration.
 */

"use client";

import { useState, useRef } from "react";
import { Info, Upload, Link2, X, Loader2 } from "lucide-react";
import type { PropertiesField } from "@/lib/domain/blocks/types";
import { JsonArrayEditor, StringArrayEditor } from "@/components/content/blocks/JsonArrayEditor";
import { IconSelector } from "@/components/content/IconSelector";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/client/ui/tooltip";

// ─── Gallery Items Field ──────────────────────────────────────────────────────

interface GalleryItem { src: string; alt: string; caption?: string }

function parseGalleryItems(raw: string): GalleryItem[] {
  try { return JSON.parse(raw) as GalleryItem[]; } catch { return []; }
}

function GalleryItemsField({
  value,
  onChange,
}: {
  value: string;
  onChange: (json: string) => void;
}) {
  const [items, setItems] = useState<GalleryItem[]>(() => parseGalleryItems(value));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [pendingUrl, setPendingUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Accumulator for concurrent uploads — avoids stale-closure overwrite when
  // multiple files are selected at once (each upload fires before state settles).
  const pendingRef = useRef<GalleryItem[] | null>(null);
  const activeUploadsRef = useRef(0);

  function commit(next: GalleryItem[]) {
    setItems(next);
    onChange(JSON.stringify(next));
  }

  async function uploadFile(file: File) {
    activeUploadsRef.current++;
    if (pendingRef.current === null) pendingRef.current = [...items];
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
      // JS is single-threaded: each async continuation runs atomically,
      // so mutating the ref here is safe regardless of concurrency.
      pendingRef.current = [...pendingRef.current!, { src: json.url, alt: file.name.replace(/\.[^.]+$/, "") }];
      commit(pendingRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      activeUploadsRef.current--;
      if (activeUploadsRef.current === 0) {
        pendingRef.current = null;
        setUploading(false);
      }
    }
  }

  function addUrl() {
    if (!pendingUrl.trim()) return;
    commit([...items, { src: pendingUrl.trim(), alt: "" }]);
    setPendingUrl("");
    setShowUrlInput(false);
  }

  function updateItem(index: number, patch: Partial<GalleryItem>) {
    const next = items.map((item, i) => i === index ? { ...item, ...patch } : item);
    commit(next);
  }

  function removeItem(index: number) {
    commit(items.filter((_, i) => i !== index));
  }

  function moveItem(index: number, dir: -1 | 1) {
    const next = [...items];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    commit(next);
  }

  return (
    <div className="space-y-2">
      {/* Item list */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="rounded-md border border-white/10 overflow-hidden">
              {/* Thumbnail */}
              <div className="relative" style={{ height: 64 }}>
                {item.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.src} alt={item.alt} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs text-gray-500">
                    No image
                  </div>
                )}
                {/* Overlay actions */}
                <div className="absolute top-1 right-1 flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveItem(i, -1)}
                    disabled={i === 0}
                    className="p-0.5 rounded bg-black/60 text-white/70 hover:text-white disabled:opacity-30 text-[10px] leading-none"
                    title="Move up"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveItem(i, 1)}
                    disabled={i === items.length - 1}
                    className="p-0.5 rounded bg-black/60 text-white/70 hover:text-white disabled:opacity-30 text-[10px] leading-none"
                    title="Move down"
                  >↓</button>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="p-0.5 rounded bg-black/60 text-white/70 hover:text-white text-[10px] leading-none"
                    title="Remove"
                  ><X className="w-2.5 h-2.5" /></button>
                </div>
              </div>
              {/* Alt + caption inputs */}
              <div className="px-2 py-1.5 space-y-1 bg-white/3">
                <input
                  type="text"
                  value={item.alt}
                  onChange={(e) => updateItem(i, { alt: e.target.value })}
                  placeholder="Alt text"
                  className="w-full px-1.5 py-0.5 text-xs rounded bg-white/8 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50"
                />
                <input
                  type="text"
                  value={item.caption ?? ""}
                  onChange={(e) => updateItem(i, { caption: e.target.value || undefined })}
                  placeholder="Caption (optional)"
                  className="w-full px-1.5 py-0.5 text-xs rounded bg-white/8 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add actions */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-white/15 bg-white/5 text-xs text-gray-300 hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {uploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</> : <><Upload className="w-3 h-3" /> Add image</>}
        </button>
        <button
          type="button"
          onClick={() => setShowUrlInput((v) => !v)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-white/15 bg-white/5 text-xs text-gray-400 hover:bg-white/10 transition-colors"
          title="Add by URL"
        >
          <Link2 className="w-3 h-3" />
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          files.forEach((f) => void uploadFile(f));
          e.target.value = "";
        }}
      />

      {/* URL input */}
      {showUrlInput && (
        <div className="flex gap-1">
          <input
            type="url"
            value={pendingUrl}
            onChange={(e) => setPendingUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addUrl(); }}
            placeholder="https://…"
            autoFocus
            className="flex-1 px-2 py-1 text-xs rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none font-mono"
          />
          <button
            type="button"
            onClick={addUrl}
            className="px-2 py-1 rounded-md text-xs font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {error && <p className="text-[10px] text-rose-400">{error}</p>}
      {items.length > 0 && (
        <p className="text-[10px] text-gray-500">{items.length} image{items.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

// ─── Image Upload Field ───────────────────────────────────────────────────────

function ImageUploadField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(!value);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
      onChange(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const hasImage = !!value;

  return (
    <div className="space-y-1.5">
      {/* Preview */}
      {hasImage && (
        <div className="relative rounded-md overflow-hidden border border-white/10 bg-black/20" style={{ height: 80 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white/70 hover:text-white hover:bg-black/80 transition-colors"
            title="Remove image"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Upload button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-white/15 bg-white/5 text-xs text-gray-300 hover:bg-white/10 hover:border-white/25 transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</>
        ) : (
          <><Upload className="w-3 h-3" /> {hasImage ? "Replace image" : "Upload image"}</>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* URL input toggle */}
      <button
        type="button"
        onClick={() => setShowUrl((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        <Link2 className="w-3 h-3" />
        {showUrl ? "Hide URL" : "Paste URL"}
      </button>
      {showUrl && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="w-full px-2 py-1.5 text-xs rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none font-mono"
        />
      )}

      {error && <p className="text-[10px] text-rose-400">{error}</p>}
    </div>
  );
}

// ─── Field constants ──────────────────────────────────────────────────────────

const WORKDAY_CUTOFF_OPTIONS = [
  { value: 0, label: "12 AM (midnight)" },
  { value: 1, label: "1 AM" },
  { value: 2, label: "2 AM" },
  { value: 3, label: "3 AM" },
  { value: 4, label: "4 AM" },
];

const MOMENT_FORMAT_DOCS_URL = "https://momentjs.com/docs/#/displaying/format/";

/** Renders a single property field based on its fieldType */
export function PropertyField({
  field,
  onChange,
}: {
  field: PropertiesField;
  onChange: (value: unknown) => void;
}) {
  const [iconSelectorOpen, setIconSelectorOpen] = useState(false);
  const [iconTriggerPos, setIconTriggerPos] = useState({ x: 0, y: 0 });
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const showMomentDocsLink =
    field.key === "summaryDate" || field.key === "weekStartDate" || field.key === "customDateFormat";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <label className="text-xs font-medium text-gray-400">{field.label}</label>
        {field.tooltip ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-500 transition-colors hover:text-gray-300"
                  aria-label={`${field.label} help`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-56 text-xs leading-relaxed">
                <span>{field.tooltip}</span>
                {showMomentDocsLink ? (
                  <a
                    href={MOMENT_FORMAT_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-amber-300 underline-offset-2 hover:underline"
                  >
                    Moment format reference
                  </a>
                ) : null}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>

      {field.fieldType === "text" && (
        <input
          type="text"
          value={(field.value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none"
          placeholder={field.description}
        />
      )}

      {field.fieldType === "number" && field.key === "workdayCutoffHour" && (
        <select
          value={String(field.value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 focus:border-blue-500/50 focus:outline-none"
        >
          {WORKDAY_CUTOFF_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {field.fieldType === "number" && field.key !== "workdayCutoffHour" && (
        <input
          type="number"
          value={(field.value as number) ?? 0}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 focus:border-blue-500/50 focus:outline-none"
        />
      )}

      {field.fieldType === "boolean" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!field.value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs text-gray-400">
            {field.description || field.label}
          </span>
        </label>
      )}

      {field.fieldType === "select" && field.options && (
        <select
          value={(field.value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 focus:border-blue-500/50 focus:outline-none"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.fieldType === "color" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test((field.value as string) || "") ? (field.value as string) : "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 rounded cursor-pointer border border-white/15 bg-transparent p-0.5"
            title="Pick a color"
          />
          <input
            type="text"
            value={(field.value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#ffffff or rgb(255,255,255)"
            className="flex-1 px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none font-mono"
          />
          {field.value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="shrink-0 p-1 rounded text-gray-500 hover:text-gray-300 transition-colors"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {field.fieldType === "icon" && (
        <>
          <button
            ref={iconBtnRef}
            type="button"
            onClick={() => {
              if (iconBtnRef.current) {
                const rect = iconBtnRef.current.getBoundingClientRect();
                setIconTriggerPos({ x: rect.left, y: rect.bottom + 4 });
              }
              setIconSelectorOpen(true);
            }}
            className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 hover:border-blue-500/50 focus:outline-none text-left flex items-center gap-2"
          >
            {field.value ? (
              <span className="truncate">{String(field.value)}</span>
            ) : (
              <span className="text-gray-500">Choose icon...</span>
            )}
          </button>
          <IconSelector
            isOpen={iconSelectorOpen}
            onClose={() => setIconSelectorOpen(false)}
            onSelectIcon={(icon) => onChange(icon)}
            currentIcon={(field.value as string) || null}
            triggerPosition={iconTriggerPos}
          />
        </>
      )}

      {field.fieldType === "image-upload" && (
        <ImageUploadField
          value={(field.value as string) || ""}
          onChange={onChange}
        />
      )}

      {field.fieldType === "gallery-items" && (
        <GalleryItemsField
          value={(field.value as string) || "[]"}
          onChange={(json) => onChange(json)}
        />
      )}

      {field.fieldType === "json-array" && field.jsonArraySchema && (
        <JsonArrayEditor
          value={(field.value as string) || "[]"}
          onChange={(json) => onChange(json)}
          itemSchema={field.jsonArraySchema}
          addLabel={field.addLabel}
          emptyMessage={field.emptyMessage}
        />
      )}

      {field.fieldType === "string-array" && (
        <StringArrayEditor
          value={(field.value as string) || "[]"}
          onChange={(json) => onChange(json)}
          placeholder={field.placeholder}
          addLabel={field.addLabel}
          emptyMessage={field.emptyMessage}
        />
      )}

      {field.fieldType === "array" && (
        <textarea
          value={
            Array.isArray(field.value)
              ? (field.value as string[]).join("\n")
              : ""
          }
          onChange={(e) =>
            onChange(
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          rows={3}
          className="w-full px-2 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none font-mono"
          placeholder="One item per line"
        />
      )}
    </div>
  );
}
