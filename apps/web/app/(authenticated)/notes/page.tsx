/**
 * Notes Page - Main entry point
 *
 * Renders the main panel with editor/viewer.
 */

// app/(authenticated)/notes/page.tsx
import { MainPanelHeader } from "@/components/notes/headers/MainPanelHeader";
import { MainPanelContent } from "@/components/notes/content/MainPanelContent";
import { EditorSkeleton } from "@/components/notes/skeletons/EditorSkeleton";
import { Suspense } from "react";

export default function NotesPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Header renders immediately */}
      <MainPanelHeader />

      {/* Content loads progressively */}
      <Suspense fallback={<EditorSkeleton />}>
        <MainPanelContent />
      </Suspense>
    </div>
  );
}
