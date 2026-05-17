/**
 * Fullscreen Excalidraw Viewer (Client Component)
 *
 * Wraps ExcalidrawViewer with client-side save logic for fullscreen mode.
 * This avoids passing functions from Server Components to Client Components.
 */

"use client";

import { ExcalidrawViewer } from "./ExcalidrawViewer";
import { clientLogger } from "@/lib/core/logger/client";
import type { ExcalidrawData } from "@/lib/domain/visualization/types";

interface FullscreenExcalidrawViewerProps {
  contentId: string;
  title: string;
  config?: Record<string, unknown>;
  data?: ExcalidrawData;
  isReadOnly?: boolean;
  ownerNoteInfo?: {
    noteId: string;
    noteTitle?: string;
    blockId?: string | null;
  } | null;
}

export function FullscreenExcalidrawViewer({
  contentId,
  title,
  config,
  data,
  isReadOnly = false,
  ownerNoteInfo = null,
}: FullscreenExcalidrawViewerProps) {
  // Client-side save handler (disabled in read-only mode).
  const handleSave = async (updatedData: Record<string, unknown>) => {
    if (isReadOnly) return;
    try {
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
        clientLogger.error({
          layer: "ui",
          event: "fullscreen_excalidraw_save:failed",
          summary: "fullscreen excalidraw save api rejected",
          attrs: {
            content_id: contentId,
            error_code: result.error?.code ?? "unknown",
          },
        });
        throw new Error(result.error?.message || "Failed to save drawing");
      }
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "fullscreen_excalidraw_save:caught",
        summary: "fullscreen excalidraw save handler caught",
        attrs: { content_id: contentId },
        error: err,
      });
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
      isReadOnly={isReadOnly}
      ownerNoteInfo={ownerNoteInfo}
    />
  );
}
