/**
 * OpenAI-style reasoning block.
 *
 * Stepped breadcrumb cards. Treats double-newline-separated paragraphs
 * as discrete "steps" — closest approximation to ChatGPT's vertical
 * step rail given we get one reasoning blob from the SDK rather than
 * structured step objects.
 */

"use client";

import { useMemo, useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import type { ReasoningBlockProps } from "./types";

export function ReasoningBlockChatGPT({ text, streaming }: ReasoningBlockProps) {
  const [userPref, setUserPref] = useState<boolean | null>(null);
  const open = userPref ?? Boolean(streaming);

  // Split into "steps" on blank lines. If there's only one block of text
  // (common during early streaming) we just render it as a single step.
  const steps = useMemo(() => {
    const parts = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [text];
  }, [text]);

  return (
    <div className="my-2 rounded-lg border border-[#10A37F]/25 bg-[#10A37F]/[0.04]">
      <button
        type="button"
        onClick={() => setUserPref(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#10A37F] hover:bg-[#10A37F]/[0.08] transition-colors rounded-lg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-70" />
        )}
        <Brain className="h-3 w-3 opacity-70" />
        <span>{streaming ? "Reasoning…" : "Reasoning"}</span>
        {!streaming && (
          <span className="ml-auto text-[10px] font-normal opacity-60">
            {steps.length} step{steps.length === 1 ? "" : "s"}
          </span>
        )}
      </button>
      {open && (
        <ol className="space-y-1.5 px-3 pb-3 pt-1">
          {steps.map((step, i) => (
            <li
              key={i}
              className="flex gap-2.5 rounded-md border border-[#10A37F]/15 bg-black/20 px-2.5 py-1.5"
            >
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#10A37F]/25 text-[10px] font-bold text-[#10A37F]">
                {i + 1}
              </span>
              <span className="text-xs leading-relaxed text-gray-300 whitespace-pre-wrap">
                {step}
              </span>
            </li>
          ))}
          {streaming && (
            <li className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-[#10A37F]/70">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#10A37F]" />
              <span>working through next step</span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
