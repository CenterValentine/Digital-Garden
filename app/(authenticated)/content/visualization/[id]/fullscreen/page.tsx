/**
 * Full-Screen Visualization Page
 *
 * Opens in NEW BROWSER TAB (not just route change)
 * - No app layouts (no sidebars, navigation, file tree)
 * - Status bar at bottom showing auto-save state
 * - Close button uses window.close() to close tab
 * - Toaster messages work in top-right corner
 * - Minimal UI for distraction-free editing
 *
 * Route: /content/visualization/[id]/fullscreen
 * Opened via: window.open() from viewer components
 */

import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { FullscreenVisualizationWrapper } from "@/components/content/viewer/FullscreenVisualizationWrapper";
import { FullscreenDiagramsNetViewer } from "@/components/content/viewer/FullscreenDiagramsNetViewer";
import { FullscreenExcalidrawViewer } from "@/components/content/viewer/FullscreenExcalidrawViewer";
import { FullscreenMermaidViewer } from "@/components/content/viewer/FullscreenMermaidViewer";

interface VisualizationFullscreenPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function VisualizationFullscreenPage({
  params,
}: VisualizationFullscreenPageProps) {
  const session = await requireAuth();
  const { id } = await params;

  // Fetch visualization data
  const viz = await prisma.contentNode.findUnique({
    where: {
      id: id,
      ownerId: session.user.id,
    },
    include: {
      visualizationPayload: true,
    },
  });

  if (!viz || !viz.visualizationPayload) {
    notFound();
  }

  const payload = viz.visualizationPayload;

  return (
    <FullscreenVisualizationWrapper title={viz.title} engine={payload.engine}>
      {payload.engine === "diagrams-net" && (
        <FullscreenDiagramsNetViewer
          contentId={viz.id}
          title={viz.title}
          config={payload.config as any}
          data={payload.data as any}
        />
      )}

      {payload.engine === "excalidraw" && (
        <FullscreenExcalidrawViewer
          contentId={viz.id}
          title={viz.title}
          config={payload.config as any}
          data={payload.data as any}
        />
      )}

      {payload.engine === "mermaid" && (
        <FullscreenMermaidViewer
          contentId={viz.id}
          title={viz.title}
          config={payload.config as any}
          data={payload.data as any}
        />
      )}
    </FullscreenVisualizationWrapper>
  );
}

// Metadata for the page
export const metadata = {
  title: "Full Screen - Visualization",
};
