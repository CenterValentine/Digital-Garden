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
import { PanelRight } from "lucide-react";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { RightSidebar } from "./RightSidebar";
import { getSurfaceStyles } from "@/lib/design/system";

export function CollapsibleRightPanel() {
  const { isCollapsed, toggleCollapsed, setCollapsed } = useRightPanelCollapseStore();
  const glass0 = getSurfaceStyles("glass-0");
  const pathname = usePathname();

  // Check if we're in fullscreen mode (hide panel completely)
  const isFullscreenMode = pathname?.includes("/fullscreen");

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

      {/* Collapsed Tab - U-shaped protrusion when panel is hidden */}
      {isCollapsed && (
        <div
          className="
            fixed right-0 top-[72px] z-50
            flex items-center justify-center
            h-12 w-8
            bg-gray-900/90 backdrop-blur-sm
            border-l border-t border-b border-white/10
            rounded-l-lg
            cursor-pointer
            transition-colors duration-200
            hover:bg-gray-800/90 hover:border-gold-primary/50
          "
          onClick={toggleCollapsed}
          title="Expand sidebar (Cmd+.)"
        >
          <PanelRight className="h-4 w-4 text-gray-400 hover:text-gold-primary" />
        </div>
      )}
    </>
  );
}
