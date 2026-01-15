/**
 * Left Sidebar - File Tree Navigation (Server Component Wrapper)
 *
 * Renders header immediately, content loads progressively with Suspense.
 */

import { Suspense } from "react";
import { LeftSidebarHeader } from "./headers/LeftSidebarHeader";
import { LeftSidebarContent } from "./content/LeftSidebarContent";
import { FileTreeSkeleton } from "./skeletons/FileTreeSkeleton";

export function LeftSidebar() {
  return (
    <div className="flex h-full flex-col">
      {/* Header - Renders immediately (Server Component) */}
      <LeftSidebarHeader />

      {/* Content - Progressive with Suspense (Client Component) */}
      <Suspense fallback={<FileTreeSkeleton />}>
        <LeftSidebarContent />
      </Suspense>
    </div>
  );
}
