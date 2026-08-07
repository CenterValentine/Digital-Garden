/**
 * Collapsible Right Panel Wrapper (Client Component)
 *
 * Handles the collapsed/expanded state with smooth transitions.
 * When collapsed: panel slides off-screen, leaving only a U-shaped tab.
 * When expanded: panel slides in from the right.
 *
 * Smart defaults applied based on content type.
 */

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { RightSidebar } from "./RightSidebar";
import { MovableCollapseHandle } from "./MovableCollapseHandle";
import { getSurfaceStyles } from "@/lib/design/system";

export function CollapsibleRightPanel() {
  const { isCollapsed, toggleCollapsed, setCollapsed } = useRightPanelCollapseStore();
  const glass0 = getSurfaceStyles("glass-0");
  const pathname = usePathname();

  // Check if we're in fullscreen mode (hide panel completely)
  const isFullscreenMode = pathname?.includes("/fullscreen");
  const isFocusMode = pathname?.includes("/content/focus/");

  // Default to collapsed on visualization pages only
  useEffect(() => {
    const isVisualizationPage = pathname?.includes("/visualization");
    if (isVisualizationPage && !isCollapsed) {
      setCollapsed(true);
    }
  }, [pathname, isCollapsed, setCollapsed]);

  // Don't render anything in fullscreen mode
  if (isFullscreenMode) {
    return null;
  }

  if (isFocusMode) {
    return (
      <>
        <div
          className={`
            fixed right-0 top-0 bottom-0 z-40 w-[360px]
            flex flex-col overflow-hidden border-l border-white/10
            transition-transform duration-300 ease-in-out
            ${isCollapsed ? "translate-x-full" : "translate-x-0"}
          `}
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <RightSidebar />
        </div>

        {isCollapsed && (
          <MovableCollapseHandle
            edge="right"
            onExpand={toggleCollapsed}
            positionKey="dg-app-right-handle-pos"
          />
        )}
      </>
    );
  }

  return (
    <>
      {/* Right Panel - slides in/out with transition */}
      <div
        className={`
          flex h-full flex-col overflow-hidden border-l border-white/10
          transition-transform duration-300 ease-in-out
          ${isCollapsed ? "translate-x-full" : "translate-x-0"}
        `}
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <RightSidebar />
      </div>

      {/* Collapsed handle — the movable rounded tab (drag vertically to keep it
          clear of the toolbar tabs / the ×). Click expands. */}
      {isCollapsed && (
        <MovableCollapseHandle
          edge="right"
          onExpand={toggleCollapsed}
          positionKey="dg-app-right-handle-pos"
        />
      )}
    </>
  );
}
