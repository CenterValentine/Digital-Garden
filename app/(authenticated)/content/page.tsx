/**
 * Notes Page - Main entry point
 *
 * Renders the main panel with editor/viewer.
 */

// app/(authenticated)/content/page.tsx
import { MainPanelWorkspace } from "@/components/content/MainPanelWorkspace";
import { EditorSkeleton } from "@/components/content/skeletons/EditorSkeleton";
import { Suspense } from "react";

export default function NotesPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Workspace loads progressively */}
      <Suspense fallback={<EditorSkeleton />}>
        <MainPanelWorkspace />
      </Suspense>
    </div>
  );
}
