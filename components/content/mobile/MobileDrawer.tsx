"use client";

import { useEffect, type ReactNode } from "react";

/**
 * MobileDrawer — a slide-over panel for the phone layout.
 *
 * Rendered as an `absolute` overlay inside the (relative) mobile layout
 * container, so it covers the editor + bottom nav but stays below the 56px
 * top navbar. Slides in from the left or right; a dimmed backdrop closes it
 * on tap. Kept mounted while closed (translated off-screen) so the sidebar it
 * wraps preserves its state instead of remounting on every open.
 */
interface MobileDrawerProps {
  side: MobileDrawerSideProp;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible name for the dialog (screen readers). */
  label: string;
}

type MobileDrawerSideProp = "left" | "right";

export function MobileDrawer({
  side,
  open,
  onClose,
  children,
  label,
}: MobileDrawerProps) {
  // Escape closes the drawer (hardware keyboards / external keyboards on tablets).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isLeft = side === "left";
  const closedTransform = isLeft ? "-translate-x-full" : "translate-x-full";

  return (
    <>
      {/* Dimmed backdrop — tap to dismiss. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sliding panel. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        className={`absolute top-0 bottom-0 z-50 flex w-[85%] max-w-sm flex-col overflow-hidden bg-[var(--background)] shadow-2xl transition-transform duration-200 ease-out ${
          isLeft ? "left-0 border-r border-white/10" : "right-0 border-l border-white/10"
        } ${open ? "translate-x-0" : `${closedTransform} pointer-events-none`}`}
      >
        <div className="h-full min-h-0 overflow-hidden">{children}</div>
      </div>
    </>
  );
}
