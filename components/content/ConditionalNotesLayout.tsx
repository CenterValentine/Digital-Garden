/**
 * Conditional Notes Layout (Client Component)
 *
 * Checks the pathname and either renders:
 * - Full three-panel layout (normal content pages)
 * - Just children directly (fullscreen visualization pages)
 */

"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { ResizablePanels } from "./ResizablePanels";
import { LeftSidebar } from "./LeftSidebar";
import { CollapsibleRightPanel } from "./CollapsibleRightPanel";
import { RightSidebar } from "./RightSidebar";
import { StatusBar } from "./StatusBar";
import { DndWrapper } from "./DndWrapper";
import { MobileNotesLayout } from "./mobile/MobileNotesLayout";
import NotesNavBar from "@/components/client/nav/NotesNavBar";
import { ExtensionGlobalDialogs } from "@/lib/extensions/ExtensionGlobalDialogs";
import { AuthSessionSync } from "./AuthSessionSync";
import { useIsMobile } from "@/components/common/useIsMobile";
import { useIsPhone, useIsLandscape } from "@/components/common/useViewport";
import { useMobileUiStore } from "@/state/mobile-ui-store";

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
  // Engage the single-pane mobile layout for narrow viewports (responsive
  // desktop windows) AND for phones in any orientation — a landscape phone is
  // ~844px wide, so the width-only check alone would drop it into the desktop
  // 3-pane layout. Tablets (shorter side >= 768) stay on desktop.
  // Both hooks must run unconditionally (rules-of-hooks) — no `||` short-circuit.
  const isMobileWidth = useIsMobile();
  const isPhone = useIsPhone();
  const isMobile = isMobileWidth || isPhone;
  const isLandscape = useIsLandscape();
  const focusMode = useMobileUiStore((s) => s.focusMode);
  const chromePeek = useMobileUiStore((s) => s.chromePeek);
  // The 56px top nav auto-hides on mobile in focus mode or when a phone is
  // landscape (reclaiming vertical space); the grab handle peeks it back.
  const navHidden = isMobile && (focusMode || (isPhone && isLandscape)) && !chromePeek;
  const isFullscreen = pathname?.includes("/fullscreen");
  const isFocusMode = pathname?.includes("/content/focus/");

  // Fullscreen mode: just render children directly
  if (isFullscreen) {
    return (
      <>
        <Suspense fallback={null}>
          <AuthSessionSync />
        </Suspense>
        {children}
      </>
    );
  }

  if (isFocusMode) {
    return (
      <>
        <div
          data-notes-layout
          className="fixed inset-x-0 top-0 h-dvh flex overflow-hidden"
        >
          <DndWrapper>
            <div className="flex h-full w-full overflow-hidden">
              <div className="relative z-0 flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                {children}
              </div>
              <CollapsibleRightPanel />
            </div>
          </DndWrapper>
        </div>
      </>
    );
  }

  // Normal mode: render full panel structure
  return (
    <>
      <Suspense fallback={null}>
        <AuthSessionSync />
      </Suspense>
      {/* Notes-specific navbar — auto-hides on mobile focus / landscape phone. */}
      {!navHidden && <NotesNavBar />}

      {/* Main content area. When the nav is hidden the shell reclaims its 56px
          so the document owns the full dynamic viewport. */}
      <div
        data-notes-layout
        className={`fixed left-0 right-0 flex flex-col overflow-hidden ${
          navHidden ? "top-0 h-dvh" : "top-[56px] h-[calc(100dvh-56px)]"
        }`}
      >
        <DndWrapper>
          {isMobile ? (
            /* Phone width: single editor pane + bottom nav + slide-over drawers.
               The three-pane Allotment layout below is desktop-only. */
            <MobileNotesLayout
              leftSidebar={<LeftSidebar />}
              rightPanel={<RightSidebar />}
            >
              {children}
            </MobileNotesLayout>
          ) : (
            <>
              <div className="flex-1 overflow-hidden">
                <ResizablePanels>
                  {/* Left Panel */}
                  <div
                    className="relative z-20 flex h-full flex-col overflow-hidden border-r border-white/10"
                    style={{
                      background: glass0.background,
                      backdropFilter: glass0.backdropFilter,
                    }}
                  >
                    <LeftSidebar />
                  </div>

                  {/* Main Panel */}
                  <div className="relative z-0 flex h-full min-h-0 flex-col overflow-hidden">
                    {children}
                  </div>

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
            </>
          )}
        </DndWrapper>
      </div>
      <ExtensionGlobalDialogs />
    </>
  );
}
