/**
 * ModelPinToggle (AI 3.4) — explicit pin control in the chat footer.
 *
 * Pinning the model makes the currently-selected model win over any playbook
 * phase directive for this conversation. It is an EXPLICIT toggle (not a side
 * effect of picking a model), always visible so it's discoverable in every
 * flow — including rooted "run this playbook" chats, where there is no
 * client-side attached-playbook state to gate on.
 */

"use client";

import { Pin, PinOff } from "lucide-react";

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
          ? "Model pinned — this model overrides playbook per-phase routing. Click to unpin."
          : "Pin this model so it overrides any playbook per-phase model routing."
      }
      className={
        pinned
          ? "ml-1 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-500/10 hover:bg-amber-500/20 dark:text-amber-300"
          : "ml-1 inline-flex shrink-0 items-center rounded px-1 py-0.5 text-gray-400 hover:text-gray-600 hover:bg-black/[0.04] dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-white/5"
      }
    >
      {pinned ? (
        <>
          <Pin className="h-3 w-3 shrink-0" />
          Pinned
        </>
      ) : (
        <PinOff className="h-3.5 w-3.5 shrink-0" />
      )}
    </button>
  );
}
