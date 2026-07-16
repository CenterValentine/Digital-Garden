/**
 * Context sidebar tab — per-node agentic metadata (plan → Phase 1 stub).
 *
 * Shows the four metadata sections with their ownership contract so the
 * design can be pressure-tested in real chrome before Phase 2 wires the
 * AgenticMetadata table, the restricted TipTap editor, and the generator.
 * Section list and ownership come from the frozen contracts, not local data.
 */

"use client";

import { Sparkles } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import { METADATA_SECTION_OWNERS } from "../types";
import type { MetadataSectionKind, MetadataSectionOwner } from "../types";

const SECTION_ORDER: MetadataSectionKind[] = [
  "summary",
  "structure",
  "role-strategy",
  "directives",
];

const SECTION_LABELS: Record<MetadataSectionKind, string> = {
  summary: "Summary",
  structure: "Structure",
  "role-strategy": "Role & Strategy",
  directives: "Directives",
};

const SECTION_EMPTY_HINTS: Record<MetadataSectionKind, string> = {
  summary: "What this content is about, in the AI's words.",
  structure: "How the content is organized — headings, parts, flow.",
  "role-strategy":
    "The operation this content serves and how it relates to its siblings.",
  directives: "Your standing instructions — the AI reads these every time.",
};

const OWNER_BADGES: Record<MetadataSectionOwner, { label: string; className: string }> = {
  ai: {
    label: "AI",
    className:
      "border-gold-primary/30 text-gold-primary/90",
  },
  "ai-proposed": {
    label: "AI proposes",
    className:
      "border-blue-400/30 text-blue-500 dark:text-blue-400",
  },
  human: {
    label: "Yours",
    className:
      "border-black/15 text-gray-500 dark:border-white/20 dark:text-gray-400",
  },
};

export function ContextTab() {
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const selectedContentTitle = useContentStore((s) =>
    s.selectedContentId
      ? (s.tabs[`tab:${s.selectedContentId}`]?.title ?? null)
      : null
  );

  if (!selectedContentId) {
    return (
      <div className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500">
        Select content to see its context document.
      </div>
    );
  }

  return (
    <div className="scrollbar-hide h-full overflow-y-auto px-3 py-3">
      <p className="px-1 text-xs text-gray-400 dark:text-gray-500">
        Context for{" "}
        <span className="text-gray-600 dark:text-gray-300">
          {selectedContentTitle ?? "this content"}
        </span>{" "}
        — the AI&apos;s working knowledge of it. Grounds folder chat and every
        studio tool.
      </p>

      <div className="mt-3 space-y-2.5">
        {SECTION_ORDER.map((kind) => {
          const owner = METADATA_SECTION_OWNERS[kind];
          const badge = OWNER_BADGES[owner];
          return (
            <section
              key={kind}
              className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm text-gray-700 dark:text-gray-200">
                  {SECTION_LABELS[kind]}
                </h3>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
              <p className="mt-1.5 text-xs italic leading-relaxed text-gray-400 dark:text-gray-500">
                {SECTION_EMPTY_HINTS[kind]}
              </p>
            </section>
          );
        })}
      </div>

      <button
        type="button"
        disabled
        title="Metadata generation arrives in Phase 2"
        className="mt-3 flex min-h-[44px] w-full cursor-default items-center justify-center gap-2 rounded-md border border-dashed border-black/15 text-xs text-gray-400 dark:border-white/15 dark:text-gray-500"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Generate context — coming in Phase 2
      </button>
    </div>
  );
}
