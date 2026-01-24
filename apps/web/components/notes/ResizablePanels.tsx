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
import { usePanelStore } from "@/stores/panel-store";
import { useSearchStore } from "@/stores/search-store";
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

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
      console.log("[ResizablePanels] Mounted");
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Global keyboard shortcut: Cmd+/ to toggle search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+/ (Mac) or Ctrl+/ (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        toggleSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSearch]);

  const [leftPanel, mainPanel, rightPanel] = children;

  return (
    <>
    <Allotment
      onDragEnd={(sizes) => {
        if (!isMounted) return;
        if (leftSidebarVisible && sizes[0] !== leftSidebarWidth) {
          setLeftSidebarWidth(sizes[0]);
        }
      }}
    >
      {leftSidebarVisible && (
        <Allotment.Pane
          minSize={200}
          maxSize={600}
          preferredSize={leftSidebarWidth}
        >
          {leftPanel}
        </Allotment.Pane>
      )}

      <Allotment.Pane>
        <Allotment
          vertical={false}
          onDragEnd={(sizes) => {
            if (!isMounted) return;
            if (rightSidebarVisible) {
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

    {/* Global context menu */}
    <ContextMenu
      actionProviders={{
        "file-tree": fileTreeActionProvider,
      }}
    />
  </>
  );
}
