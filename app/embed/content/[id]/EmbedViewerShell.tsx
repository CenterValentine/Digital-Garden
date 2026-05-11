"use client";

import { useEffect } from "react";

/**
 * Thin wrapper for non-note viewers inside the embed iframe.
 * Renders the viewer and posts {type:"ready"} so the overlay
 * knows the iframe is live and can show the iframe / hide the spinner.
 */
export function EmbedViewerShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    window.parent.postMessage({ type: "ready" }, "*");
  }, []);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      {children}
    </div>
  );
}
