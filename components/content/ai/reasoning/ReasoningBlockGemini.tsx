/**
 * Google-style reasoning block.
 *
 * Bulleted trace with sub-headings. We treat "## " / "**Heading**" /
 * leading-capitalized-short-lines as sub-headings; the rest become
 * bullet points under whichever heading came before them. Falls back
 * to a flat bullet list if no headings are detectable.
 */

"use client";

import { useMemo } from "react";
import { Lightbulb, ChevronDown, ChevronRight } from "lucide-react";
import type { ReasoningBlockProps } from "./types";
import {
  useReasoningDisclosure,
  formatReasoningElapsed,
} from "./reasoning-disclosure";

interface Section {
  heading: string | null;
  bullets: string[];
}

function parseSections(text: string): Section[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: Section[] = [];
  let current: Section = { heading: null, bullets: [] };
  const flush = () => {
    if (current.heading || current.bullets.length > 0) sections.push(current);
  };
  for (const line of lines) {
    // Markdown heading
    const md = /^#{1,4}\s+(.+)$/.exec(line);
    if (md) {
      flush();
      current = { heading: md[1].trim(), bullets: [] };
      continue;
    }
    // Bold one-liner heading
    const bold = /^\*\*(.+?)\*\*[:.]?$/.exec(line);
    if (bold) {
      flush();
      current = { heading: bold[1].trim(), bullets: [] };
      continue;
    }
    // Bullet
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    if (bullet) {
      current.bullets.push(bullet[1].trim());
      continue;
    }
    current.bullets.push(line);
  }
  flush();
  return sections;
}

export function ReasoningBlockGemini({ text, streaming }: ReasoningBlockProps) {
  const { open, toggle, headerRef, elapsed } = useReasoningDisclosure(streaming);
  const elapsedLabel = formatReasoningElapsed(elapsed, streaming);

  const sections = useMemo(() => parseSections(text), [text]);

  return (
    <div
      className="my-1.5"
    >
      <button
        ref={headerRef}
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-[12px] font-medium text-[#1967D2] dark:text-[#4285F4] hover:opacity-80 transition-opacity"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-70" />
        )}
        <Lightbulb
          className={`h-3 w-3 ${streaming ? "animate-pulse opacity-90" : "opacity-70"}`}
        />
        <span className={streaming ? "animate-pulse" : undefined}>
          {streaming ? "Thinking process…" : "Thinking process"}
        </span>
        {elapsedLabel && (
          <span className="tabular-nums text-[10px] font-normal opacity-60">
            {elapsedLabel}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2.5 pl-6 pb-1 pt-1 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <div className="mb-1 text-[11px] font-semibold text-[#1967D2]/90 dark:text-[#4285F4]/90">
                  {s.heading}
                </div>
              )}
              {s.bullets.length > 0 && (
                <ul className="ml-3 list-disc space-y-0.5 marker:text-[#4285F4]/50">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="whitespace-pre-wrap">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {streaming && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#1967D2]/80 dark:text-[#4285F4]/70">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#4285F4]" />
              <span>continuing</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
