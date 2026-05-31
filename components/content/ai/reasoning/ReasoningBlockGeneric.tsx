/**
 * Generic reasoning block — fallback when the message provider doesn't
 * match one of the big-three branded renderers (xAI, Mistral, Groq, etc).
 * Neutral muted styling, collapsible, same UX skeleton as the others
 * so the surface feels consistent regardless of provider.
 */

"use client";

import { useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import type { ReasoningBlockProps } from "./types";

export function ReasoningBlockGeneric({ text, streaming }: ReasoningBlockProps) {
  const [userPref, setUserPref] = useState<boolean | null>(null);
  const open = userPref ?? Boolean(streaming);

  return (
    <div className="my-2 rounded-lg border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setUserPref(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 hover:bg-white/[0.04] transition-colors rounded-lg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-70" />
        )}
        <Brain className="h-3 w-3 opacity-70" />
        <span>{streaming ? "Thinking…" : "Reasoning"}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-2.5 pt-1 text-xs leading-relaxed text-gray-400 whitespace-pre-wrap">
          {text}
          {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
        </div>
      )}
    </div>
  );
}
