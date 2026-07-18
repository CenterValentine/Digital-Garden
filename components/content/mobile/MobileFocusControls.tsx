"use client";

import { Maximize2 } from "lucide-react";
import { useMobileUiStore } from "@/state/mobile-ui-store";
import { useIsPhone, useIsLandscape } from "@/components/common/useViewport";

/**
 * MobileFocusControls — the enter/break affordances for focus mode + the
 * landscape nav auto-hide. Rendered inside MobileNotesLayout (which is
 * `relative`), so both controls are scoped to the mobile shell.
 *
 * The unified rule: whenever the top chrome is hidden — either because focus
 * mode is on, or because a phone is landscape (nav auto-hide) — a single grab
 * handle appears at the top edge. Tapping it "breaks":
 *   • in focus mode → exit focus (all chrome returns)
 *   • landscape auto-hide → peek the nav back without leaving landscape
 *
 * A floating focus button (shown when not in focus) enters focus mode.
 */
export function MobileFocusControls() {
  const focusMode = useMobileUiStore((s) => s.focusMode);
  const toggleFocusMode = useMobileUiStore((s) => s.toggleFocusMode);
  const chromePeek = useMobileUiStore((s) => s.chromePeek);
  const setChromePeek = useMobileUiStore((s) => s.setChromePeek);
  const isPhone = useIsPhone();
  const isLandscape = useIsLandscape();

  // Top chrome CAN be hidden in focus mode, or when a phone is landscape.
  const chromeHideable = focusMode || (isPhone && isLandscape);

  const onHandleTap = () => {
    if (focusMode) {
      toggleFocusMode(); // break focus → chrome returns
    } else {
      setChromePeek(!chromePeek); // landscape: toggle the nav peek
    }
  };

  return (
    <>
      {/* Grab handle: present whenever the top chrome is hideable, so the user
          can both reveal (peek) and re-hide the nav in landscape, or break out
          of focus. Sits at the shell's top edge — just under the nav when it's
          showing, at the very top when hidden. */}
      {chromeHideable && (
        <button
          type="button"
          onClick={onHandleTap}
          aria-label={
            focusMode
              ? "Exit focus mode"
              : chromePeek
                ? "Hide navigation"
                : "Show navigation"
          }
          className="absolute left-1/2 top-1 z-[60] flex h-6 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm transition-colors active:bg-black/45"
        >
          <span className="h-1 w-8 rounded-full bg-white/70" />
        </button>
      )}

      {!focusMode && (
        <button
          type="button"
          onClick={() => toggleFocusMode()}
          aria-label="Focus on document"
          className="absolute bottom-16 right-3 z-[55] flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition-colors active:bg-black/85"
        >
          <Maximize2 className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
