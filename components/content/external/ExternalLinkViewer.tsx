/**
 * External Link Viewer
 *
 * Displays external link with optional Open Graph preview.
 * Phase 2: ExternalPayload support
 */

"use client";

import { useState, useEffect } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";

interface ExternalLinkViewerProps {
  contentId: string;
  url: string;
  subtype: string;
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

export function ExternalLinkViewer({
  contentId,
  url,
  subtype,
  preview = {},
}: ExternalLinkViewerProps) {
  const glass0 = getSurfaceStyles("glass-0");
  const [previewData, setPreviewData] = useState(preview.cached || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Reset preview when URL changes (e.g., after editing)
  useEffect(() => {
    console.log("[ExternalLinkViewer] URL changed, resetting preview:", url);
    setPreviewData(preview.cached || null);
    setPreviewError(null);
  }, [url, preview.cached]);

  const handleRefreshPreview = async () => {
    try {
      setIsRefreshing(true);
      setPreviewError(null);

      console.log("[ExternalLinkViewer] Fetching preview for URL:", url);

      const response = await fetch("/api/content/external/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();

      console.log("[ExternalLinkViewer] API response:", {
        status: response.status,
        ok: response.ok,
        result,
      });

      if (!response.ok || !result.success) {
        const errorCode = result.error?.code || "UNKNOWN_ERROR";
        const errorMessage = result.error?.message || "Failed to fetch preview";
        const fullError = `${errorMessage} (${errorCode})`;

        console.error("[ExternalLinkViewer] Preview fetch failed:", {
          errorCode,
          errorMessage,
          fullError: result.error,
        });

        setPreviewError(fullError);
        toast.error(fullError);
        return;
      }

      console.log("[ExternalLinkViewer] Preview data received:", result.data.metadata);
      setPreviewData(result.data.metadata);
      toast.success("Preview refreshed");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch preview";
      console.error("[ExternalLinkViewer] Preview fetch error:", err);
      setPreviewError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenLink = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Check if we have any metadata at all
  const hasAnyMetadata = previewData && (
    previewData.title ||
    previewData.description ||
    previewData.siteName ||
    previewData.imageUrl
  );

  // Check which fields are missing
  const missingFields = previewData ? {
    image: !previewData.imageUrl,
    title: !previewData.title,
    description: !previewData.description,
  } : null;

  return (
    <div className="space-y-4 p-6">
      {/* Preview Card */}
      {(hasAnyMetadata || (!previewError && previewData !== null)) && (
        <div
          className="border border-white/10 rounded-lg overflow-hidden"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          {previewData?.imageUrl ? (
            <div className="aspect-video w-full overflow-hidden bg-black/20">
              <img
                src={previewData.imageUrl}
                alt={previewData.title || "Preview"}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-video w-full overflow-hidden bg-gradient-to-br from-gray-100 via-gray-50 to-white relative">
              {/* Decorative pattern overlay */}
              <div className="absolute inset-0 opacity-30" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }} />

              {/* Centered icon and text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-4">
                  <ExternalLink className="h-16 w-16 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">
                    No preview image available
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    This site doesn't provide Open Graph metadata
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="p-4 space-y-2">
            {previewData?.title && (
              <h3 className="text-lg font-semibold text-gray-900">
                {previewData.title}
              </h3>
            )}
            {previewData?.description && (
              <p className="text-sm text-gray-700 line-clamp-3">
                {previewData.description}
              </p>
            )}
            {previewData?.siteName && (
              <p className="text-xs text-gray-600">{previewData.siteName}</p>
            )}

            {/* Show info about missing fields if any */}
            {missingFields && (missingFields.title || missingFields.description) && (
              <p className="text-xs text-gray-500 italic pt-2 border-t border-gray-900/10">
                This site provides limited preview metadata
                {missingFields.title && missingFields.description && " (no title or description)"}
                {missingFields.title && !missingFields.description && " (no title)"}
                {!missingFields.title && missingFields.description && " (no description)"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {previewError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{previewError}</p>
        </div>
      )}

      {/* URL Card */}
      <div
        className="border border-white/10 rounded-lg p-4"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex items-start gap-3">
          <ExternalLink className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 mb-1">
              External Link
            </div>
            <div className="text-xs text-gray-700 break-all">{url}</div>
            {subtype && subtype !== "website" && (
              <div className="mt-2">
                <span className="inline-block px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                  {subtype}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenLink}
          className="flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-lg text-sm font-medium text-primary transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Open Link
        </button>
        <button
          onClick={handleRefreshPreview}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900/10 hover:bg-gray-900/20 border border-gray-900/20 rounded-lg text-sm font-medium text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          {isRefreshing ? "Refreshing..." : "Refresh Preview"}
        </button>
      </div>
    </div>
  );
}
