/**
 * One studio tool tile + its expanding variant sheet.
 *
 * UI contract (plan → "Registry-driven visual modularity"): one tile per tool;
 * variants live in a sheet the tile opens, so adding a variant never reflows
 * the grid. The sheet expands INLINE below the tile row rather than floating —
 * the right sidebar sits under transformed ancestors where fixed-position
 * popovers misposition unless portaled, and the inline sheet also reads
 * naturally in the mobile bottom-sheet presentation.
 *
 * Phase 1: tiles are informational stubs. The sheet shows the description,
 * execution mode, resolved variants, and which phase wires the tool live.
 */

"use client";

import { createElement, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { resolveStudioToolVariants } from "../registry";
import type { StudioToolDefinition, StudioToolVariant } from "../types";
import { getStudioToolIcon } from "./studio-icons";

/** Which phase turns this tool live (plan → Phases). */
function phaseHint(tool: StudioToolDefinition): string {
  if (tool.stub) return "Planned — after v1";
  if (tool.shelf === "practice") return "Arrives in Phase 7";
  if (tool.execution === "job") return "Arrives in Phase 6";
  return "Arrives in Phase 4";
}

interface StudioToolTileProps {
  tool: StudioToolDefinition;
  open: boolean;
  onToggle: () => void;
}

export function StudioToolTile({ tool, open, onToggle }: StudioToolTileProps) {
  const [variants, setVariants] = useState<StudioToolVariant[]>([]);

  // Variants may be a runtime resolver (e.g. custom reports), so resolve on
  // first open rather than eagerly for every tile.
  useEffect(() => {
    if (!open || !tool.variants) return;
    let cancelled = false;
    resolveStudioToolVariants(tool).then((resolved) => {
      if (!cancelled) setVariants(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [open, tool]);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        open
          ? "border-gold-primary/40 bg-black/[0.04] dark:bg-white/[0.06]"
          : "border-black/10 bg-black/[0.02] hover:bg-black/[0.05] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        {createElement(getStudioToolIcon(tool.iconName), {
          className: "h-4 w-4 shrink-0 text-gold-primary/80",
        })}
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
          {tool.label}
        </span>
        {tool.stub && (
          <span className="shrink-0 rounded-full border border-black/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400 dark:border-white/15 dark:text-gray-500">
            Soon
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-black/[0.06] px-3 py-2.5 dark:border-white/[0.08]">
          {tool.description && (
            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {tool.description}
            </p>
          )}

          {variants.length > 0 && (
            <ul className="mt-2 space-y-1">
              {variants.map((variant) => (
                <li key={variant.id}>
                  <button
                    type="button"
                    disabled
                    className="flex min-h-[44px] w-full cursor-default items-center rounded-md px-2 text-left text-xs text-gray-500 opacity-70 dark:text-gray-400"
                    title={variant.description ?? phaseHint(tool)}
                  >
                    {variant.label}
                    {variant.custom && (
                      <span className="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                        (custom)
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
            <span className="rounded border border-black/10 px-1 py-px uppercase tracking-wide dark:border-white/15">
              {tool.execution === "chat" ? "Chat" : "Background job"}
            </span>
            {phaseHint(tool)}
          </p>
        </div>
      )}
    </div>
  );
}
