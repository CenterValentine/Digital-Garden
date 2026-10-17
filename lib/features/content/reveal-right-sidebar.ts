/**
 * Open the right sidebar on a tab for a piece of content — from anywhere
 * (a viewer's button, a notification, a toolbelt action). ONE helper for
 * what used to be two store writes repeated per caller; on a phone the
 * sidebar lives in the right drawer, so that opens too.
 *
 * Programmatic opens never record the "last engaged" tab (owner rule,
 * 2026-10-08): only an explicit tab click does.
 */

import { useMobileUiStore } from "@/state/mobile-ui-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useRightSidebarStateStore, type RightSidebarTab } from "@/state/right-sidebar-state-store";

export function revealRightSidebarTab(contentId: string, tab: RightSidebarTab): void {
  useRightSidebarStateStore.getState().setActiveTab(contentId, tab);
  useRightPanelCollapseStore.getState().setCollapsed(false);
  if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
    useMobileUiStore.getState().setOpenDrawer("right");
  }
}
