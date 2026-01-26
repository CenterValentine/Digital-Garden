/**
 * Panel Layout - Obsidian-inspired IDE layout
 *
 * Uses Allotment for resizable panels with Glass-UI styling.
 */

"use client";

import { useEffect, useState } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { usePanelStore } from "@/state/panel-store";
import { cn } from "@/lib/core/utils";
import { getSurfaceStyles } from "@/lib/design-system";

interface PanelLayoutProps {
  leftSidebar: React.ReactNode;
  mainContent: React.ReactNode;
  rightSidebar: React.ReactNode;
  statusBar: React.ReactNode;
}

export function PanelLayout({
  leftSidebar,
  mainContent,
  rightSidebar,
  statusBar,
}: PanelLayoutProps) {
  const {
    leftSidebarVisible,
    leftSidebarWidth,
    rightSidebarVisible,
    rightSidebarWidth,
    statusBarVisible,
    setLeftSidebarWidth,
    setRightSidebarWidth,
  } = usePanelStore();

  // Track if component is fully mounted
  const [isMounted, setIsMounted] = useState(false);

  // Mark as mounted after initial render (only once)
  useEffect(() => {
    // Small delay to ensure Allotment has initialized
    const timer = setTimeout(() => {
      setIsMounted(true);
      console.log("[PanelLayout] Mounted with widths:", {
        left: leftSidebarWidth,
        right: rightSidebarWidth,
      });
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const glass0 = getSurfaceStyles("glass-0");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Main panel area */}
      <div className="flex-1 overflow-hidden">
        <Allotment
          onDragEnd={(sizes) => {
            // Only save on drag end, not during initialization
            if (!isMounted) {
              console.log("[PanelLayout] Ignoring drag end - not mounted yet");
              return;
            }

            if (leftSidebarVisible && sizes[0] !== leftSidebarWidth) {
              console.log(
                "[PanelLayout] Saving left width on drag end:",
                sizes[0]
              );
              setLeftSidebarWidth(sizes[0]);
            }
          }}
        >
          {/* Left sidebar */}
          {leftSidebarVisible && (
            <Allotment.Pane
              minSize={200}
              maxSize={600}
              preferredSize={leftSidebarWidth}
            >
              <div
                className={cn(
                  "h-full overflow-hidden border-r border-white/10"
                )}
                style={{
                  background: glass0.background,
                  backdropFilter: glass0.backdropFilter,
                }}
              >
                {leftSidebar}
              </div>
            </Allotment.Pane>
          )}

          {/* Main content area */}
          <Allotment.Pane>
            <Allotment
              vertical={false}
              onDragEnd={(sizes) => {
                // Only save on drag end, not during initialization
                if (!isMounted) {
                  console.log(
                    "[PanelLayout] Ignoring right drag end - not mounted yet"
                  );
                  return;
                }

                if (rightSidebarVisible) {
                  const rightIndex = leftSidebarVisible ? 1 : 0;
                  const newWidth = sizes[rightIndex];
                  if (newWidth !== rightSidebarWidth) {
                    console.log(
                      "[PanelLayout] Saving right width on drag end:",
                      newWidth
                    );
                    setRightSidebarWidth(newWidth);
                  }
                }
              }}
            >
              <Allotment.Pane>{mainContent}</Allotment.Pane>

              {/* Right sidebar */}
              {rightSidebarVisible && (
                <Allotment.Pane
                  minSize={200}
                  maxSize={600}
                  preferredSize={rightSidebarWidth}
                >
                  <div
                    className={cn(
                      "h-full overflow-hidden border-l border-white/10"
                    )}
                    style={{
                      background: glass0.background,
                      backdropFilter: glass0.backdropFilter,
                    }}
                  >
                    {rightSidebar}
                  </div>
                </Allotment.Pane>
              )}
            </Allotment>
          </Allotment.Pane>
        </Allotment>
      </div>

      {/* Status bar */}
      {statusBarVisible && (
        <div
          className={cn("h-6 border-t border-white/10 px-4 py-1 text-xs")}
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          {statusBar}
        </div>
      )}
    </div>
  );
}
