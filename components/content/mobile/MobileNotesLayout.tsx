"use client";

import { useEffect, type ReactNode } from "react";
import { useMobileUiStore } from "@/state/mobile-ui-store";
import { useLeftPanelCollapseStore } from "@/state/left-panel-collapse-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileDrawer } from "./MobileDrawer";
import { MobileFocusControls } from "./MobileFocusControls";

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
  const focusMode = useMobileUiStore((s) => s.focusMode);
  const collapseMode = useLeftPanelCollapseStore((s) => s.mode);
  const setCollapseMode = useLeftPanelCollapseStore((s) => s.setMode);
  const rightCollapsed = useRightPanelCollapseStore((s) => s.isCollapsed);
  const setRightCollapsed = useRightPanelCollapseStore((s) => s.setCollapsed);

  // The sidebars' collapse toggles mean "shrink to icon bar" (left) / "slide
  // off-screen" (right) on desktop, but inside a slide-over drawer that just
  // leaves a hollow shell. On mobile, treat collapsing as "dismiss": close the
  // drawer and restore the expanded state so the next open shows real content.
  // (MobileBottomNav also resets before opening, so these are belt-and-braces.)
  useEffect(() => {
    if (openDrawer === "left" && collapseMode === "hidden") {
      closeDrawer();
      setCollapseMode("full");
    }
  }, [openDrawer, collapseMode, closeDrawer, setCollapseMode]);

  useEffect(() => {
    if (openDrawer === "right" && rightCollapsed) {
      closeDrawer();
      setRightCollapsed(false);
    }
  }, [openDrawer, rightCollapsed, closeDrawer, setRightCollapsed]);

  // Phone orientation adaptation now happens in useProjectedLayout (consumed
  // by MainPanelWorkspace): side-by-side renders stacked in portrait and vice
  // versa, quad passes through (owner decision D2). The setLayoutMode coercion
  // effect that used to live here was ghost-writer #1 in the layout-intent
  // spec — a rendering constraint mutating synced intent (a phone glancing at
  // a quad workspace destroyed the desktop quad). Deleted; projection is
  // render-only by construction.

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Editor / main pane fills the available space above the tab bar. */}
      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">{children}</div>

      {/* Bottom nav hides in focus mode; the grab handle brings it back. */}
      {!focusMode && <MobileBottomNav />}

      <MobileFocusControls />

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
