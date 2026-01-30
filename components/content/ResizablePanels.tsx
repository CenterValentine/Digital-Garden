/**
 * Resizable Panels (Client Component)
 *
 * Handles ONLY the resizing logic with Allotment.
 * Does not render content - that's done by the server layout.
 * M6: Added global Cmd+/ keyboard shortcut for search toggle.
 */

"use client";

import { useEffect, useState } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { usePanelStore } from "@/state/panel-store";
import { useSearchStore } from "@/state/search-store";
import { useLeftPanelCollapseStore } from "@/state/left-panel-collapse-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { ContextMenu } from "./context-menu/ContextMenu";
import { fileTreeActionProvider } from "./context-menu/file-tree-actions";

interface ResizablePanelsProps {
  children: [
    React.ReactElement, // left panel
    React.ReactElement, // main panel
    React.ReactElement, // right panel
  ];
}

export function ResizablePanels({ children }: ResizablePanelsProps) {
  const {
    leftSidebarVisible,
    leftSidebarWidth,
    rightSidebarVisible,
    rightSidebarWidth,
    setLeftSidebarWidth,
    setRightSidebarWidth,
  } = usePanelStore();

  const toggleSearch = useSearchStore((state) => state.toggleSearch);
  const { mode: panelMode, setMode: setPanelMode } = useLeftPanelCollapseStore();
  const togglePanelCollapse = useLeftPanelCollapseStore((state) => state.toggleMode);
  const { isCollapsed: isRightPanelCollapsed } = useRightPanelCollapseStore();

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
      console.log("[ResizablePanels] Mounted");
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Global keyboard shortcut: Cmd+/ to toggle search and expand panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+/ (Mac) or Ctrl+/ (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        // Ensure panel is expanded when toggling search
        if (panelMode === "hidden") {
          setPanelMode("full");
        }
        toggleSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSearch, panelMode, setPanelMode]);

  // Global keyboard shortcut: Cmd+B to toggle left panel collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+B (Mac) or Ctrl+B (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        togglePanelCollapse();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePanelCollapse]);

  const [leftPanel, mainPanel, rightPanel] = children;

  // Calculate left panel size based on collapse mode
  // Hidden mode: 48px (w-12), Full mode: saved width
  const effectiveLeftWidth = panelMode === "hidden" ? 48 : leftSidebarWidth;
  const leftPanelMinSize = panelMode === "hidden" ? 48 : 200;
  const leftPanelMaxSize = panelMode === "hidden" ? 48 : 600;

  return (
    <>
    <Allotment
      onDragEnd={(sizes) => {
        if (!isMounted) return;
        // Only save width changes when in full mode
        if (leftSidebarVisible && panelMode === "full" && sizes[0] !== leftSidebarWidth) {
          setLeftSidebarWidth(sizes[0]);
        }
      }}
    >
      {leftSidebarVisible && (
        <Allotment.Pane
          minSize={leftPanelMinSize}
          maxSize={leftPanelMaxSize}
          preferredSize={effectiveLeftWidth}
        >
          {leftPanel}
        </Allotment.Pane>
      )}

      <Allotment.Pane>
        <Allotment
          vertical={false}
          onDragEnd={(sizes) => {
            if (!isMounted) return;
            if (rightSidebarVisible && !isRightPanelCollapsed) {
              const rightIndex = leftSidebarVisible ? 1 : 0;
              const newWidth = sizes[rightIndex];
              if (newWidth !== rightSidebarWidth) {
                setRightSidebarWidth(newWidth);
              }
            }
          }}
        >
          <Allotment.Pane>{mainPanel}</Allotment.Pane>

          {rightSidebarVisible && (
            <Allotment.Pane
              minSize={isRightPanelCollapsed ? 0 : 200}
              maxSize={isRightPanelCollapsed ? 0 : 600}
              preferredSize={isRightPanelCollapsed ? 0 : rightSidebarWidth}
            >
              {rightPanel}
            </Allotment.Pane>
          )}
        </Allotment>
      </Allotment.Pane>
    </Allotment>

    {/* Global context menu */}
    <ContextMenu
      actionProviders={{
        "file-tree": fileTreeActionProvider,
      }}
    />
  </>
  );
}
