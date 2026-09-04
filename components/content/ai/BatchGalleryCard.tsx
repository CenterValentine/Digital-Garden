"use client";

/**
 * BatchGalleryCard — the §5 batch gallery (EXTRACTION-TO-DATABASE-PLAN,
 * owner shape confirmed 2026-09-03): each recorded batch collapses to ONE
 * card — header (batch #, item range, qualified count) + a gallery of that
 * batch's completed items (label · fit % · qualified badge · verdict
 * snippet · row status) — with per-item expansion revealing the raw
 * exchanges (the parts the model no longer carries after the checkpoint).
 *
 * Pure rendering over already-persisted parts, grouped between checkpoint
 * anchors by the ChatMessage grouping pass — no data-model change. The
 * collapsed view IS the model's retained view (§6.1): expansion is
 * user-initiated and costs no tokens. At the smoke scale (batch of 2) the
 * card looks slight; at the design scale (batch of ~10) it condenses ten
 * items' tool traffic into one unit.
 */

import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  X,
} from "lucide-react";

export interface BatchGalleryItem {
  label: string;
  url?: string;
  status?: string;
  fitPercent?: number;
  qualified?: boolean;
  verdict?: string;
  rowStatus?: "created" | "updated";
  captureFailed?: boolean;
  /** The raw parts digested into this item (reads + the record call). */
  rawParts: unknown[];
}

export interface BatchGalleryGroup {
  batchNumber: number | null;
  itemsRecordedSoFar: number | null;
  batchSummary: string | null;
  items: BatchGalleryItem[];
}

function rawText(part: unknown): { name: string; text: string } {
  const p = part as { type?: string; output?: unknown; input?: unknown; text?: unknown };
  if (typeof p.text === "string") return { name: "narration", text: p.text };
  const name = (p.type ?? "part").replace(/^tool-/, "");
  const out = p.output as { value?: unknown } | unknown;
  const v =
    out && typeof out === "object" && "value" in (out as object)
      ? (out as { value: unknown }).value
      : out;
  const text =
    typeof v === "string" ? v : JSON.stringify(v ?? p.input ?? null, null, 2);
  return { name, text: text ?? "" };
}

export function BatchGalleryCard({ group }: { group: BatchGalleryGroup }) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const items = group.items;
  const item = items[Math.min(index, items.length - 1)];
  const qualifiedCount = items.filter((it) => it.qualified === true).length;

  if (!item) return null;

  return (
    <div className="my-1.5 max-w-md overflow-hidden rounded-xl border border-black/10 bg-black/[0.02] text-sm dark:border-white/10 dark:bg-white/[0.03]">
      {/* Header — the checkpoint's digest, which IS what the model kept. */}
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-1.5 dark:border-white/[0.08]">
        <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
          {group.batchNumber != null
            ? `Batch ${group.batchNumber}`
            : "Final batch"}
          {" · "}
          {items.length} item{items.length === 1 ? "" : "s"}
          {qualifiedCount > 0 && ` · ${qualifiedCount} qualified`}
        </span>
        <span
          className="ml-auto text-[10px] text-gray-400 dark:text-gray-500"
          title="Folded at checkpoint — the collapsed view matches the model's retained context"
        >
          folded
        </span>
      </div>

      {/* Item panel — one item at a time, paged. */}
      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-gray-800 dark:text-gray-200">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 hover:underline"
                >
                  <span className="truncate">{item.label}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                </a>
              ) : (
                item.label
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
              {typeof item.fitPercent === "number" && (
                <span className="rounded bg-black/[0.05] px-1.5 py-px tabular-nums text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                  fit {Math.round(item.fitPercent)}%
                </span>
              )}
              {item.qualified === true && (
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-px text-emerald-600 dark:text-emerald-400">
                  <Check className="h-2.5 w-2.5" /> qualified
                </span>
              )}
              {item.qualified === false && (
                <span className="inline-flex items-center gap-0.5 rounded bg-black/[0.05] px-1.5 py-px text-gray-500 dark:bg-white/[0.08]">
                  <X className="h-2.5 w-2.5" /> not qualified
                </span>
              )}
              {item.rowStatus && (
                <span className="rounded bg-sky-500/10 px-1.5 py-px text-sky-600 dark:text-sky-400">
                  row {item.rowStatus}
                </span>
              )}
              {item.captureFailed && (
                <span className="rounded bg-red-500/10 px-1.5 py-px text-red-600 dark:text-red-400">
                  capture failed
                </span>
              )}
              {item.status && item.status !== "done" && (
                <span className="rounded bg-amber-500/10 px-1.5 py-px text-amber-600 dark:text-amber-400">
                  {item.status}
                </span>
              )}
            </div>
            {item.verdict && (
              <div className="mt-1 line-clamp-3 text-[11px] leading-snug text-gray-600 dark:text-gray-400">
                {item.verdict}
              </div>
            )}
          </div>

          {items.length > 1 && (
            <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setIndex((i) => Math.max(0, i - 1));
                  setExpanded(false);
                }}
                disabled={index === 0}
                className="rounded p-0.5 text-gray-400 hover:bg-black/[0.05] hover:text-gray-600 disabled:opacity-30 dark:hover:bg-white/[0.08] dark:hover:text-gray-300"
                aria-label="Previous item"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] tabular-nums text-gray-400">
                {index + 1}/{items.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIndex((i) => Math.min(items.length - 1, i + 1));
                  setExpanded(false);
                }}
                disabled={index === items.length - 1}
                className="rounded p-0.5 text-gray-400 hover:bg-black/[0.05] hover:text-gray-600 disabled:opacity-30 dark:hover:bg-white/[0.08] dark:hover:text-gray-300"
                aria-label="Next item"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Raw exchanges — what the model dropped; expanding is free. */}
        {item.rawParts.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
            raw exchanges ({item.rawParts.length})
          </button>
        )}
        {expanded &&
          item.rawParts.map((part, i) => {
            const { name, text } = rawText(part);
            if (!text) return null;
            return (
              <div key={i} className="mt-1">
                <div className="text-[10px] font-medium text-gray-400">
                  {name}
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-black/5 bg-black/[0.02] p-2 text-[10px] leading-snug text-gray-600 dark:border-white/5 dark:bg-white/[0.03] dark:text-gray-300">
                  {text.length > 8000 ? `${text.slice(0, 8000)}…` : text}
                </pre>
              </div>
            );
          })}
      </div>

      {/* Checkpoint digest line, when present. */}
      {group.batchSummary && (
        <div className="border-t border-black/[0.06] px-3 py-1.5 text-[10.5px] leading-snug text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
          {group.batchSummary.length > 280
            ? `${group.batchSummary.slice(0, 280)}…`
            : group.batchSummary}
        </div>
      )}
    </div>
  );
}
