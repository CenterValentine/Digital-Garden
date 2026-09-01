/**
 * Suggested follow-ups — collapsed-sparkle form (owner's call, 2026-08-31).
 *
 * The ✨ button anchors bottom-right INSIDE the messages container (the
 * same proven positioning as "Jump to latest" beside it); the popover
 * portals through useAnchoredMenu — the repo's canonical anchored-menu
 * hook — so it is viewport-clamped and flips instead of overflowing the
 * panel (the first absolute/h-0 version painted over message content in
 * narrow side-chats). Width is measured from the hosting panel at open
 * time, so the menu scales with the sidebar instead of assuming 288px.
 *
 * Zero standing footprint: when the engine has no follow-ups (toggle
 * off, generator failed, post-proposal quiet zone, dismissed session)
 * this renders nothing.
 */

"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { useAnchoredMenu } from "@/lib/core/use-anchored-menu";

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
  // Scales with the panel: measured from the trigger's offsetParent (the
  // relative messages container) when the menu opens.
  const [menuWidth, setMenuWidth] = useState(288);
  // Destructured on purpose — the React Compiler's ref inference taints a
  // hook-return OBJECT once a field is passed as ref= (see
  // ContentPathBreadcrumb's note on the same hook).
  const { open, toggle, close, triggerRef, menuRef, menuStyle } =
    useAnchoredMenu({ width: menuWidth, maxHeight: 300 });

  if (followUps.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          const panel = e.currentTarget.offsetParent as HTMLElement | null;
          setMenuWidth(
            Math.min(340, Math.max(200, (panel?.clientWidth ?? 320) - 16))
          );
          toggle();
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${followUps.length} suggested follow-ups`}
        title="Suggested follow-ups"
        className="absolute bottom-2 right-2 z-20 rounded-full border border-black/10 bg-white/80 p-1.5 text-amber-600/80 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-amber-600 dark:border-white/10 dark:bg-black/40 dark:text-amber-300/80 dark:hover:bg-black/60 dark:hover:text-amber-300"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open &&
        menuStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={menuStyle}
            className="z-[130] flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white text-xs shadow-xl dark:border-white/10 dark:bg-[#1a1a1a]"
          >
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {followUps.map((text, i) => (
                <button
                  key={`${i}:${text.slice(0, 24)}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onPick(text);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[11px] leading-snug text-gray-700 transition-colors hover:bg-black/[0.04] dark:text-gray-300 dark:hover:bg-white/5"
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
                  close();
                  onDismiss();
                }}
                className="flex w-full items-center gap-1 border-t border-black/5 px-3 py-1 text-left text-[10px] text-gray-500 transition-colors hover:bg-black/[0.04] hover:text-gray-700 dark:border-white/5 dark:hover:bg-white/5 dark:hover:text-gray-300"
              >
                <X className="h-2.5 w-2.5" aria-hidden />
                Don&apos;t suggest again in this chat
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
