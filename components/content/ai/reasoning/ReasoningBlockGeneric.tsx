/**
 * Generic reasoning block — fallback when the message provider doesn't
 * match one of the big-three branded renderers (xAI, Mistral, Groq, etc).
 * Neutral muted styling, collapsible, same UX skeleton as the others
 * so the surface feels consistent regardless of provider.
 */

"use client";

import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import type { ReasoningBlockProps } from "./types";
import {
  useReasoningDisclosure,
  formatReasoningElapsed,
} from "./reasoning-disclosure";

export function ReasoningBlockGeneric({ text, streaming }: ReasoningBlockProps) {
  const { open, toggle, headerRef, elapsed } = useReasoningDisclosure(streaming);
  const elapsedLabel = formatReasoningElapsed(elapsed, streaming);

  return (
    <div className="my-2 rounded-lg border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
      <button
        ref={headerRef}
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors rounded-lg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-70" />
        )}
        <Brain
          className={`h-3 w-3 ${streaming ? "animate-pulse opacity-90" : "opacity-70"}`}
        />
        <span className={streaming ? "animate-pulse" : undefined}>
          {streaming ? "Thinking…" : "Reasoning"}
        </span>
        {elapsedLabel && (
          <span className="ml-auto tabular-nums text-[10px] font-normal opacity-60">
            {elapsedLabel}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3.5 pb-2.5 pt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
          {text}
          {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
        </div>
      )}
    </div>
  );
}
