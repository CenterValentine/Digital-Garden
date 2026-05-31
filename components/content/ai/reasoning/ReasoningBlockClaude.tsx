/**
 * Anthropic-style reasoning block.
 *
 * Beige collapsible. Italic, dim text. Default state is expanded *while*
 * streaming (so the user watches the thought emerge) and collapses to a
 * subtle "Thought for…" pill once the stream finishes — matching
 * Claude.ai's UX.
 */

"use client";

import { useState } from "react";
import { Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import type { ReasoningBlockProps } from "./types";

export function ReasoningBlockClaude({ text, streaming }: ReasoningBlockProps) {
  // Expanded while streaming; auto-collapse once finished. A manual
  // toggle pins `userPref`; until then `open` is derived from streaming.
  // Derived (not effect-synced) so the React Compiler stays happy.
  const [userPref, setUserPref] = useState<boolean | null>(null);
  const open = userPref ?? Boolean(streaming);

  return (
    <div
      className="my-2 rounded-lg border border-[#D4A574]/25 bg-[#D4A574]/[0.06]"
      style={{ color: "#D4A574" }}
    >
      <button
        type="button"
        onClick={() => setUserPref(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide hover:bg-[#D4A574]/[0.08] transition-colors rounded-lg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-70" />
        )}
        <Sparkles className="h-3 w-3 opacity-70" />
        <span className="opacity-90">
          {streaming ? "Thinking…" : "Thought"}
        </span>
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
