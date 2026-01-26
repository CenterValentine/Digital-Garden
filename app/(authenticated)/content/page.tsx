/**
 * Notes Page - Main entry point
 *
 * Renders the main panel with editor/viewer.
 */

// app/(authenticated)/content/page.tsx
import { MainPanelHeader } from "@/components/content/headers/MainPanelHeader";
import { MainPanelContent } from "@/components/content/content/MainPanelContent";
import { EditorSkeleton } from "@/components/content/skeletons/EditorSkeleton";
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
