/**
 * Notes Layout (Server Component)
 *
 * Renders panel structure immediately, before JavaScript loads.
 * ResizablePanels handles only the interactive resizing.
 */

// app/(authenticated)/content/layout.tsx
import { getSurfaceStyles } from "@/lib/design-system";
import { ResizablePanels } from "@/components/content/ResizablePanels";
import { LeftSidebar } from "@/components/content/LeftSidebar";
import { RightSidebar } from "@/components/content/RightSidebar";
import { StatusBar } from "@/components/content/StatusBar";
import NotesNavBar from "@/components/client/nav/NotesNavBar";
import { NotesLayoutMarker } from "@/components/content/NotesLayoutMarker";

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const glass0 = getSurfaceStyles("glass-0");

  return (
    <>
      {/* Inline style to immediately hide default navbar before CSS loads */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .notes-route-hides-default-nav { display: none !important; }
          .notes-route-no-padding { padding-top: 0 !important; }
        `
      }} />

      <div className="notes-layout-page">
        {/* Mark body element to trigger CSS for hiding default navbar */}
        <NotesLayoutMarker />

      {/* Notes-specific navbar */}
      <NotesNavBar />

      {/* Main content area */}
      <div data-notes-layout className="fixed top-[56px] left-0 right-0 bottom-0 flex flex-col overflow-hidden">
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

          {/* Right Panel */}
          <div
            className="flex h-full flex-col overflow-hidden border-l border-white/10"
            style={{
              background: glass0.background,
              backdropFilter: glass0.backdropFilter,
            }}
          >
            <RightSidebar />
          </div>
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
      </div>
    </>
  );
}
