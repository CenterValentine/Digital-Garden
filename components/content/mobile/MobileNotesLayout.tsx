"use client";

import { useEffect, type ReactNode } from "react";
import { useMobileUiStore } from "@/state/mobile-ui-store";
import { useLeftPanelCollapseStore } from "@/state/left-panel-collapse-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useContentStore } from "@/state/content-store";
import { useIsPhone, useIsLandscape } from "@/components/common/useViewport";
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

  // Phones support only `single` and ONE 2-pane split, oriented to the device:
  // portrait → stacked (dual-horizontal), landscape → side-by-side
  // (dual-vertical). `quad` is never phone-appropriate. Coerce incompatible
  // layouts through the store's own setLayoutMode (same path the layout picker
  // uses, so tab redistribution is handled). Only phones — narrow desktop
  // windows keep whatever layout the user chose. No loop: once coerced, the
  // layout is compatible and the guards fall through.
  const isPhone = useIsPhone();
  const isLandscape = useIsLandscape();
  const layoutMode = useContentStore((s) => s.layoutMode);
  const setLayoutMode = useContentStore((s) => s.setLayoutMode);
  useEffect(() => {
    if (!isPhone) return;
    const desiredDual = isLandscape ? "dual-vertical" : "dual-horizontal";
    if (layoutMode === "quad") setLayoutMode(desiredDual);
    else if (layoutMode === "dual-vertical" && !isLandscape) setLayoutMode("dual-horizontal");
    else if (layoutMode === "dual-horizontal" && isLandscape) setLayoutMode("dual-vertical");
  }, [isPhone, isLandscape, layoutMode, setLayoutMode]);

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
