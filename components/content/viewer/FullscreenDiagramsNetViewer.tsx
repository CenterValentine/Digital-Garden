/**
 * Fullscreen Diagrams.net Viewer (Client Component)
 *
 * Wraps DiagramsNetViewer with client-side save logic for fullscreen mode.
 * This avoids passing functions from Server Components to Client Components.
 */

"use client";

import { DiagramsNetViewer } from "./DiagramsNetViewer";

interface FullscreenDiagramsNetViewerProps {
  contentId: string;
  title: string;
  config: any;
  data: any;
}

export function FullscreenDiagramsNetViewer({
  contentId,
  title,
  config,
  data,
}: FullscreenDiagramsNetViewerProps) {
  // Client-side save handler
  const handleSave = async (xml: string) => {
    try {
      const response = await fetch(`/api/content/content/${contentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visualizationData: { ...data, xml },
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to save diagram");
      }

      console.log("[FullscreenDiagramsNetViewer] Saved successfully");
    } catch (err) {
      console.error("[FullscreenDiagramsNetViewer] Save failed:", err);
      throw err;
    }
  };

  return (
    <DiagramsNetViewer
      contentId={contentId}
      title={title}
      config={config}
      data={data}
      onSave={handleSave}
      isFullScreen={true}
    />
  );
}
