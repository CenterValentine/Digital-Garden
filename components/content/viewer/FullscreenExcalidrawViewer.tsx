/**
 * Fullscreen Excalidraw Viewer (Client Component)
 *
 * Wraps ExcalidrawViewer with client-side save logic for fullscreen mode.
 * This avoids passing functions from Server Components to Client Components.
 */

"use client";

import { ExcalidrawViewer } from "./ExcalidrawViewer";

interface FullscreenExcalidrawViewerProps {
  contentId: string;
  title: string;
  config: any;
  data: any;
}

export function FullscreenExcalidrawViewer({
  contentId,
  title,
  config,
  data,
}: FullscreenExcalidrawViewerProps) {
  // Client-side save handler
  const handleSave = async (updatedData: any) => {
    try {
      console.log("[FullscreenExcalidrawViewer] Saving data:", updatedData);

      const response = await fetch(`/api/content/content/${contentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visualizationData: updatedData, // Send only the updated data, not merged
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error("[FullscreenExcalidrawViewer] Save error response:", result);
        throw new Error(result.error?.message || "Failed to save drawing");
      }

      console.log("[FullscreenExcalidrawViewer] Saved successfully");
    } catch (err) {
      console.error("[FullscreenExcalidrawViewer] Save failed:", err);
      throw err;
    }
  };

  return (
    <ExcalidrawViewer
      contentId={contentId}
      title={title}
      config={config}
      data={data}
      onSave={handleSave}
      isFullScreen={true}
    />
  );
}
