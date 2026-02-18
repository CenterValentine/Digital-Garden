/**
 * Conditional Notes Layout (Client Component)
 *
 * Checks the pathname and either renders:
 * - Full three-panel layout (normal content pages)
 * - Just children directly (fullscreen visualization pages)
 */

"use client";

import { usePathname } from "next/navigation";
import { ResizablePanels } from "./ResizablePanels";
import { LeftSidebar } from "./LeftSidebar";
import { CollapsibleRightPanel } from "./CollapsibleRightPanel";
import { StatusBar } from "./StatusBar";
import NotesNavBar from "@/components/client/nav/NotesNavBar";

interface ConditionalNotesLayoutProps {
  children: React.ReactNode;
  glass0: {
    background: string;
    backdropFilter: string;
  };
}

export function ConditionalNotesLayout({
  children,
  glass0,
}: ConditionalNotesLayoutProps) {
  const pathname = usePathname();
  const isFullscreen = pathname?.includes("/fullscreen");

  // Fullscreen mode: just render children directly
  if (isFullscreen) {
    return <>{children}</>;
  }

  // Normal mode: render full panel structure
  return (
    <>
      {/* Notes-specific navbar */}
      <NotesNavBar />

      {/* Main content area */}
      <div
        data-notes-layout
        className="fixed top-[56px] left-0 right-0 bottom-0 flex flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-hidden">
          <ResizablePanels>
            {/* Left Panel */}
            <div
              className="flex h-full flex-col overflow-hidden border-r border-white/10"
              style={{
                background: glass0.background,
                backdropFilter: glass0.backdropFilter,
              }}
            >
              <LeftSidebar />
            </div>

            {/* Main Panel */}
            <div className="h-full">{children}</div>

            {/* Right Panel - Collapsible with smooth transitions */}
            <CollapsibleRightPanel />
          </ResizablePanels>
        </div>

        {/* Status bar */}
        <div
          className="h-6 border-t border-white/10 px-4 py-1 text-xs"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <StatusBar />
        </div>
      </div>
    </>
  );
}
