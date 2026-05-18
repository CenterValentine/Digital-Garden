/**
 * Fullscreen Mermaid Viewer (Client Component)
 *
 * Wraps MermaidViewer with client-side save logic for fullscreen mode.
 * This avoids passing functions from Server Components to Client Components.
 */

"use client";

import { MermaidViewer } from "./MermaidViewer";
import { clientLogger } from "@/lib/core/logger/client";

interface FullscreenMermaidViewerProps {
  contentId: string;
  title: string;
  config?: Record<string, unknown>;
  data?: { source?: string };
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
        clientLogger.error({
          layer: "ui",
          event: "fullscreen_mermaid_save:failed",
          summary: "fullscreen mermaid save api rejected",
          attrs: {
            content_id: contentId,
            error_code: result.error?.code ?? "unknown",
          },
        });
        throw new Error(result.error?.message || "Failed to save diagram");
      }
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "fullscreen_mermaid_save:caught",
        summary: "fullscreen mermaid save handler caught",
        attrs: { content_id: contentId },
        error: err,
      });
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
