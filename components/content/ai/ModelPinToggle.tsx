/**
 * ModelPinToggle (AI 3.4; re-skinned "Lock-in model" 2026-09-04) — the
 * explicit lock-in control, hosted in the ChatControlPanel.
 *
 * Locking in the model makes the currently-selected model win over any
 * charter phase directive for this conversation. It is an EXPLICIT toggle
 * (not a side effect of picking a model) so it's discoverable in every
 * flow — including rooted "run this charter" chats, where there is no
 * client-side attached-charter state to gate on.
 *
 * Icon semantics (owner): locked-in = closed lock; off = open lock
 * (lucide ships no slashed lock — the open lock is the off state).
 */

"use client";

import { Lock, LockOpen } from "lucide-react";

export function ModelPinToggle({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!pinned)}
      aria-pressed={pinned}
      title={
        pinned
          ? "Model locked — the selected model overrides charter per-phase routing. Click to unlock."
          : "Lock the selected model so it overrides any charter per-phase model routing."
      }
      className={
        pinned
          ? "ml-1 inline-flex shrink-0 items-center rounded px-1 py-0.5 text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 dark:text-amber-300"
          : "ml-1 inline-flex shrink-0 items-center rounded px-1 py-0.5 text-gray-400 hover:text-gray-600 hover:bg-black/[0.04] dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-white/5"
      }
    >
      {pinned ? (
        <Lock className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <LockOpen className="h-3.5 w-3.5 shrink-0" />
      )}
    </button>
  );
}
