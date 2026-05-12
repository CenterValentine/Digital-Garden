"use client";

import { useEffect } from "react";
import type { ContentType } from "@/lib/domain/content/types";

const CONTENT_TYPE_LABELS: Partial<Record<ContentType, string>> = {
  visualization: "Visualization",
  code: "Code file",
  chat: "AI chat",
  html: "HTML page",
  data: "Data file",
  hope: "Hope",
  workflow: "Workflow",
  template: "Template",
};

interface EmbedFallbackProps {
  contentType: ContentType;
  title: string;
}

/**
 * Shown when the embed shell doesn't yet have a dedicated viewer for this
 * content type. Still posts {type:"ready"} so the overlay doesn't spin forever.
 * The overlay's own toolbar "↗" button opens the content in the main app.
 */
export function EmbedFallback({ contentType, title }: EmbedFallbackProps) {
  useEffect(() => {
    window.parent.postMessage({ type: "ready" }, "*");
  }, []);

  const label = CONTENT_TYPE_LABELS[contentType] ?? contentType;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 32,
        textAlign: "center",
        color: "rgba(255,255,255,0.6)",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "rgba(255,255,255,0.85)",
          maxWidth: 280,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12 }}>
        {label} — use ↗ in the panel toolbar to open in the app
      </div>
    </div>
  );
}
