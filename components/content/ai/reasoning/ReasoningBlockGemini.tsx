/**
 * Google-style reasoning block.
 *
 * Bulleted trace with sub-headings. We treat "## " / "**Heading**" /
 * leading-capitalized-short-lines as sub-headings; the rest become
 * bullet points under whichever heading came before them. Falls back
 * to a flat bullet list if no headings are detectable.
 */

"use client";

import { useMemo, useState } from "react";
import { Lightbulb, ChevronDown, ChevronRight } from "lucide-react";
import type { ReasoningBlockProps } from "./types";

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
  const [userPref, setUserPref] = useState<boolean | null>(null);
  const open = userPref ?? Boolean(streaming);

  const sections = useMemo(() => parseSections(text), [text]);

  return (
    <div
      className="my-2 rounded-lg border bg-gradient-to-br"
      style={{
        borderColor: "rgba(66, 133, 244, 0.25)",
        backgroundImage:
          "linear-gradient(135deg, rgba(66,133,244,0.06), rgba(124,77,255,0.04))",
      }}
    >
      <button
        type="button"
        onClick={() => setUserPref(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[#4285F4] hover:bg-white/[0.04] transition-colors rounded-lg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-70" />
        )}
        <Lightbulb className="h-3 w-3 opacity-70" />
        <span>{streaming ? "Thinking process…" : "Thinking process"}</span>
      </button>
      {open && (
        <div className="space-y-2.5 px-3.5 pb-3 pt-1 text-xs leading-relaxed text-gray-300">
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <div className="mb-1 text-[11px] font-semibold text-[#4285F4]/90">
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
            <div className="flex items-center gap-1.5 text-[11px] text-[#4285F4]/70">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#4285F4]" />
              <span>continuing</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
