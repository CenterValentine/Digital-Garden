/**
 * Fullscreen Mermaid Viewer (Client Component)
 *
 * Wraps MermaidViewer with client-side save logic for fullscreen mode.
 * This avoids passing functions from Server Components to Client Components.
 */

"use client";

import { MermaidViewer } from "./MermaidViewer";

interface FullscreenMermaidViewerProps {
  contentId: string;
  title: string;
  config: any;
  data: any;
}

export function FullscreenMermaidViewer({
  contentId,
  title,
  config,
  data,
}: FullscreenMermaidViewerProps) {
  // Client-side save handler
  const handleSave = async (source: string) => {
    try {
      console.log("[FullscreenMermaidViewer] Saving data:", { source });

      const response = await fetch(`/api/content/content/${contentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visualizationData: { source },
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error("[FullscreenMermaidViewer] Save error response:", result);
        throw new Error(result.error?.message || "Failed to save diagram");
      }

      console.log("[FullscreenMermaidViewer] Saved successfully");
    } catch (err) {
      console.error("[FullscreenMermaidViewer] Save failed:", err);
      throw err;
    }
  };

  return (
    <MermaidViewer
      contentId={contentId}
      title={title}
      config={config}
      data={data}
      onSave={handleSave}
      isFullScreen={true}
    />
  );
}
