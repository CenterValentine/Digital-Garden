/**
 * Main Panel - Tab-based document interface (Server Component Wrapper)
 *
 * Renders tab bar immediately, editor loads progressively with Suspense.
 */

import { Suspense } from "react";
import { MainPanelHeader } from "./headers/MainPanelHeader";
import { MainPanelContent } from "./content/MainPanelContent";
import { EditorSkeleton } from "./skeletons/EditorSkeleton";

export function MainPanel() {
  return (
    <div className="flex h-full flex-col">
      {/* Tab bar - Renders immediately (Server Component) */}
      <MainPanelHeader />

      {/* Editor - Progressive with Suspense (Client Component) */}
      <Suspense fallback={<EditorSkeleton />}>
        <MainPanelContent />
      </Suspense>
    </div>
  );
}
