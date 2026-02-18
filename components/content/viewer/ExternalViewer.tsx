/**
 * External Link Viewer Component (Wrapper)
 *
 * Wraps ExternalLinkViewer for use in MainPanelContent.
 * Displays external bookmarks with Open Graph preview.
 */

"use client";

import { ExternalLinkViewer } from "../external/ExternalLinkViewer";

interface ExternalViewerProps {
  contentId: string;
  title: string;
  url: string;
  subtype?: string;
  preview?: {
    mode?: "none" | "open_graph";
    cached?: {
      title?: string;
      description?: string;
      siteName?: string;
      imageUrl?: string;
      fetchedAt?: string;
    };
  };
}

export function ExternalViewer({
  contentId,
  title,
  url,
  subtype = "website",
  preview,
}: ExternalViewerProps) {
  // Type-safe preview casting
  const typedPreview: { mode?: "none" | "open_graph"; cached?: any } | undefined = preview
    ? {
        mode: (preview.mode === "open_graph" ? "open_graph" : "none") as "none" | "open_graph",
        cached: preview.cached,
      }
    : undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <ExternalLinkViewer
          contentId={contentId}
          url={url}
          subtype={subtype}
          preview={typedPreview}
        />
      </div>
    </div>
  );
}
