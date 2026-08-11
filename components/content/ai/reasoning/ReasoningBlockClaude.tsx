/**
 * Anthropic-style reasoning block.
 *
 * Beige collapsible. Italic, dim text. Default state is expanded *while*
 * streaming (so the user watches the thought emerge) and collapses to a
 * subtle "Thought for…" pill once the stream finishes — matching
 * Claude.ai's UX.
 */

"use client";

import { Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import type { ReasoningBlockProps } from "./types";
import {
  useReasoningDisclosure,
  formatReasoningElapsed,
} from "./reasoning-disclosure";

export function ReasoningBlockClaude({ text, streaming }: ReasoningBlockProps) {
  // Shared disclosure (2026-08-08): one toggle expands/collapses EVERY
  // reasoning block, scroll-anchored; auto-open while streaming until the
  // user states a preference. Elapsed timer keeps long thinks legible.
  const { open, toggle, headerRef, elapsed } = useReasoningDisclosure(streaming);
  const elapsedLabel = formatReasoningElapsed(elapsed, streaming);

  return (
    <div
      className="my-2 rounded-lg border border-[#D4A574]/25 bg-[#D4A574]/[0.06]"
      style={{ color: "#D4A574" }}
    >
      <button
        ref={headerRef}
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide hover:bg-[#D4A574]/[0.08] transition-colors rounded-lg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-70" />
        )}
        <Sparkles
          className={`h-3 w-3 ${streaming ? "animate-pulse opacity-90" : "opacity-70"}`}
        />
        <span className={streaming ? "animate-pulse opacity-90" : "opacity-90"}>
          {streaming ? "Thinking…" : "Thought"}
        </span>
        {elapsedLabel && (
          <span className="ml-auto tabular-nums text-[10px] font-normal opacity-60">
            {elapsedLabel}
          </span>
        )}
      </button>
      {open && (
        <div
          className="px-3.5 pb-2.5 pt-1 text-xs italic leading-relaxed whitespace-pre-wrap"
          style={{ color: "rgba(212, 165, 116, 0.85)" }}
        >
          {text}
          {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
        </div>
      )}
    </div>
  );
}
