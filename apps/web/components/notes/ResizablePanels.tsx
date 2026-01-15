/**
 * Resizable Panels (Client Component)
 *
 * Handles ONLY the resizing logic with Allotment.
 * Does not render content - that's done by the server layout.
 */

"use client";

import { useEffect, useState } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { usePanelStore } from "@/stores/panel-store";

interface ResizablePanelsProps {
  leftPanel: React.ReactNode;
  mainPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

export function ResizablePanels({
  leftPanel,
  mainPanel,
  rightPanel,
}: ResizablePanelsProps) {
  const {
    leftSidebarVisible,
    leftSidebarWidth,
    rightSidebarVisible,
    rightSidebarWidth,
    setLeftSidebarWidth,
    setRightSidebarWidth,
  } = usePanelStore();

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
      console.log("[ResizablePanels] Mounted with widths:", {
        left: leftSidebarWidth,
        right: rightSidebarWidth,
      });
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Allotment
      onDragEnd={(sizes) => {
        if (!isMounted) {
          console.log("[ResizablePanels] Ignoring drag end - not mounted yet");
          return;
        }

        if (leftSidebarVisible && sizes[0] !== leftSidebarWidth) {
          console.log(
            "[ResizablePanels] Saving left width on drag end:",
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
          {leftPanel}
        </Allotment.Pane>
      )}

      {/* Main content area */}
      <Allotment.Pane>
        <Allotment
          vertical={false}
          onDragEnd={(sizes) => {
            if (!isMounted) {
              console.log(
                "[ResizablePanels] Ignoring right drag end - not mounted yet"
              );
              return;
            }

            if (rightSidebarVisible) {
              const rightIndex = leftSidebarVisible ? 1 : 0;
              const newWidth = sizes[rightIndex];
              if (newWidth !== rightSidebarWidth) {
                console.log(
                  "[ResizablePanels] Saving right width on drag end:",
                  newWidth
                );
                setRightSidebarWidth(newWidth);
              }
            }
          }}
        >
          <Allotment.Pane>{mainPanel}</Allotment.Pane>

          {/* Right sidebar */}
          {rightSidebarVisible && (
            <Allotment.Pane
              minSize={200}
              maxSize={600}
              preferredSize={rightSidebarWidth}
            >
              {rightPanel}
            </Allotment.Pane>
          )}
        </Allotment>
      </Allotment.Pane>
    </Allotment>
  );
}

