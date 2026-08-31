/**
 * Suggested follow-ups — collapsed-sparkle form (owner's call, 2026-08-31;
 * the previous three-chip band took a message's worth of vertical space).
 *
 * Zero standing footprint: when the engine has suggestions, a small ✨
 * button floats over the bottom-right corner of the message list, just
 * above the composer. Clicking it opens a popover with all suggestions;
 * picking one loads it into the composer. "Don't suggest again" inside
 * the popover is the session-wide dismissal (parent wires onDismiss to
 * the engine's dismissFollowUps).
 *
 * When the engine returns no follow-ups (toggle off, generator failed,
 * post-proposal quiet zone, dismissed session) this renders nothing.
 */

"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click-away closes the popover (the ✨ button itself toggles).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (followUps.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      // h-0: the affordance floats over the message list's bottom corner
      // and reserves NO layout space between messages and composer.
      className="relative h-0"
      role="region"
      aria-label="Suggested follow-up prompts"
    >
      {open && (
        <div className="absolute bottom-9 right-2 z-30 w-72 overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#1a1a1a]">
          <div className="flex flex-col py-1">
            {followUps.map((text, i) => (
              <button
                key={`${i}:${text.slice(0, 24)}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(text);
                }}
                className="px-3 py-1.5 text-left text-[11px] leading-snug text-gray-700 transition-colors hover:bg-black/[0.04] dark:text-gray-300 dark:hover:bg-white/5"
                title={text}
              >
                {text}
              </button>
            ))}
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDismiss();
              }}
              className="flex w-full items-center gap-1 border-t border-black/5 px-3 py-1 text-left text-[10px] text-gray-500 transition-colors hover:bg-black/[0.04] hover:text-gray-700 dark:border-white/5 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              <X className="h-2.5 w-2.5" aria-hidden />
              Don&apos;t suggest again in this chat
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${followUps.length} suggested follow-ups`}
        title="Suggested follow-ups"
        className="absolute bottom-1.5 right-2 z-20 rounded-full border border-black/10 bg-white/80 p-1.5 text-amber-600/80 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-amber-600 dark:border-white/10 dark:bg-black/40 dark:text-amber-300/80 dark:hover:bg-black/60 dark:hover:text-amber-300"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
