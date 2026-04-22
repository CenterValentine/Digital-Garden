/**
 * Fullscreen Diagrams.net Viewer (Client Component)
 *
 * Wraps DiagramsNetViewer with client-side save logic for fullscreen mode.
 * Acquires a collaboration runtime so the standalone fullscreen tab
 * participates in Y.js sync (Hocuspocus) just like the main content pane.
 */

"use client";

import { useId, useMemo } from "react";
import { DiagramsNetViewer } from "./DiagramsNetViewer";
import {
  useCollaborationRuntime,
  getContentCollaborationCapability,
} from "@/lib/domain/collaboration/runtime";

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
  const viewInstanceId = useId();

  const capability = useMemo(
    () => getContentCollaborationCapability("visualization", "diagrams-net"),
    []
  );

  const collaborationRuntime = useCollaborationRuntime({
    contentId,
    capability,
    descriptor: {
      surfaceKind: "workspace-pane",
      viewInstanceId,
    },
  });

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
      collaborationRuntime={collaborationRuntime}
    />
  );
}
