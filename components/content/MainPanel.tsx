/**
 * Main Panel - Tab-based document interface (Server Component Wrapper)
 *
 * Renders tab bar immediately, editor loads progressively with Suspense.
 */

import { Suspense } from "react";
import { MainPanelWorkspace } from "./MainPanelWorkspace";
import { EditorSkeleton } from "./skeletons/EditorSkeleton";

export function MainPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Workspace - Progressive with Suspense */}
      <Suspense fallback={<EditorSkeleton />}>
        <MainPanelWorkspace />
      </Suspense>
    </div>
  );
}
