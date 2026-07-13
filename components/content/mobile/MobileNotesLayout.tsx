"use client";

import type { ReactNode } from "react";
import { useMobileUiStore } from "@/state/mobile-ui-store";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileDrawer } from "./MobileDrawer";

/**
 * MobileNotesLayout — the single-pane content-IDE layout for phone widths.
 *
 * Replaces the three-pane Allotment layout below the `md` breakpoint: the
 * editor fills the screen, a bottom tab bar provides navigation, and the left
 * (file tree / search) and right (outline / backlinks / AI) panels become
 * slide-over drawers. Rendered only when `useIsMobile()` is true, so desktop
 * is completely untouched.
 *
 * The root is `relative` so the drawers' `absolute` overlays are scoped to the
 * shell area (below the 56px navbar), not the whole page.
 */
interface MobileNotesLayoutProps {
  /** The main editor / content pane (the route's children). */
  children: ReactNode;
  /** Left sidebar (file tree, search, tags) — mounted inside the left drawer. */
  leftSidebar: ReactNode;
  /** Right panel (outline, backlinks, AI) — mounted inside the right drawer. */
  rightPanel: ReactNode;
}

export function MobileNotesLayout({
  children,
  leftSidebar,
  rightPanel,
}: MobileNotesLayoutProps) {
  const openDrawer = useMobileUiStore((s) => s.openDrawer);
  const closeDrawer = useMobileUiStore((s) => s.closeDrawer);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Editor / main pane fills the available space above the tab bar. */}
      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">{children}</div>

      <MobileBottomNav />

      <MobileDrawer
        side="left"
        open={openDrawer === "left"}
        onClose={closeDrawer}
        label="Files and search"
      >
        {leftSidebar}
      </MobileDrawer>

      <MobileDrawer
        side="right"
        open={openDrawer === "right"}
        onClose={closeDrawer}
        label="Outline, backlinks and AI"
      >
        {rightPanel}
      </MobileDrawer>
    </div>
  );
}
