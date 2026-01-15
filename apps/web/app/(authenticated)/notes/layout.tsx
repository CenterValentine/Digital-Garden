/**
 * Notes Layout (Server Component)
 *
 * Renders panel structure immediately, before JavaScript loads.
 * ResizablePanels handles only the interactive resizing.
 */

import { getSurfaceStyles } from "@/lib/design-system";
import { ResizablePanels } from "@/components/notes/ResizablePanels";
import { LeftSidebar } from "@/components/notes/LeftSidebar";
import { RightSidebar } from "@/components/notes/RightSidebar";
import { StatusBar } from "@/components/notes/StatusBar";

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const glass0 = getSurfaceStyles("glass-0");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Main panel area */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanels
          leftPanel={
            <div
              className="h-full overflow-hidden border-r border-white/10"
              style={{
                background: glass0.background,
                backdropFilter: glass0.backdropFilter,
              }}
            >
              <LeftSidebar />
            </div>
          }
          mainPanel={children}
          rightPanel={
            <div
              className="h-full overflow-hidden border-l border-white/10"
              style={{
                background: glass0.background,
                backdropFilter: glass0.backdropFilter,
              }}
            >
              <RightSidebar />
            </div>
          }
        />
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
  );
}
