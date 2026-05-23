/**
 * Suggested follow-ups strip (Session 7).
 *
 * Renders 2-3 chip buttons below the last assistant message. Clicking
 * a chip loads its text into the composer (the parent wires onPick to
 * `setInput`). A small × at the trailing end dismisses the whole strip
 * for the current turn.
 *
 * The chips are decorative — when the engine returns no follow-ups
 * (toggle off, generator failed, fewer than 2 results) this renders
 * nothing.
 */

"use client";

import { Sparkles, X } from "lucide-react";

interface FollowUpsStripProps {
  followUps: string[];
  onPick: (text: string) => void;
  onDismiss?: () => void;
}

export function FollowUpsStrip({
  followUps,
  onPick,
  onDismiss,
}: FollowUpsStripProps) {
  if (followUps.length === 0) return null;

  return (
    <div
      className="border-t border-black/10 dark:border-white/10 bg-black/10 px-2 py-2"
      role="region"
      aria-label="Suggested follow-up prompts"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 shrink-0 text-amber-300/70" aria-hidden />
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {followUps.map((text, i) => (
            <button
              key={`${i}:${text.slice(0, 24)}`}
              type="button"
              onClick={() => onPick(text)}
              className="text-left text-[11px] leading-snug rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/10 hover:border-white/20 px-2 py-1 text-gray-300 transition-colors max-w-[280px] truncate"
              title={text}
            >
              {text}
            </button>
          ))}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss follow-up suggestions"
            className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
