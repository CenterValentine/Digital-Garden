/**
 * Live folder-mention gate chips (FOLDER-CONTEXT-CAPSULE-PLAN → Phase 4,
 * D13 chips & traceability).
 *
 * Rendered in the composer row while folder mentions sit in the draft:
 *   ○ checking → ◐ updating → ● fresh / ◍ stale ⚠ / ✗ none / ⃠ off
 * On send the snapshot rides the message as a durable `data-folder-context`
 * part (rendered by ChatMessage) and these chips clear.
 */

"use client";

import { FolderSearch, Loader2, ShieldOff, TriangleAlert, X } from "lucide-react";
import type { FolderContextMentionData } from "@/lib/domain/ai-context/mention-part";

const STATUS_TEXT: Record<FolderContextMentionData["status"], string> = {
  checking: "updating context…",
  fresh: "context fresh",
  stale: "context stale — serving best available",
  none: "no context available",
  optedOut: "AI context disabled",
};

export function FolderContextChips({
  gates,
}: {
  gates: Record<string, FolderContextMentionData>;
}) {
  const entries = Object.values(gates);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-1">
      {entries.map((gate) => {
        const detail =
          gate.status === "fresh" && gate.refreshedNodes > 0
            ? ` · ${gate.refreshedNodes} nodes refreshed`
            : gate.reason && gate.status !== "fresh" && gate.status !== "checking"
              ? ` · ${gate.reason}`
              : "";
        return (
          <span
            key={gate.folderId}
            title={`${gate.title}: ${STATUS_TEXT[gate.status]}${detail}${
              gate.generationCalls > 0
                ? ` (${gate.generationCalls} generation calls)`
                : ""
            }`}
            className={[
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
              gate.status === "checking"
                ? "border-gold-primary/40 text-gold-primary"
                : gate.status === "fresh"
                  ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : gate.status === "stale"
                    ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                    : "border-black/15 text-gray-500 dark:border-white/20 dark:text-gray-400",
            ].join(" ")}
          >
            {gate.status === "checking" ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : gate.status === "stale" ? (
              <TriangleAlert className="h-3 w-3 shrink-0" />
            ) : gate.status === "none" ? (
              <X className="h-3 w-3 shrink-0" />
            ) : gate.status === "optedOut" ? (
              <ShieldOff className="h-3 w-3 shrink-0" />
            ) : (
              <FolderSearch className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{gate.title}</span>
            <span className="shrink-0 opacity-70">
              {STATUS_TEXT[gate.status]}
            </span>
          </span>
        );
      })}
    </div>
  );
}
