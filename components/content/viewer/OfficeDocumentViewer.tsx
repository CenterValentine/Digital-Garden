/**
 * Office Document Viewer
 *
 * Displays Office documents (.docx, .xlsx, .pptx) with multiple strategies:
 * 1. Google Docs/Sheets/Slides (full editing, Google users only) - PRIMARY
 * 2. ONLYOFFICE Editor (full editing with auto-save) - SECONDARY
 * 3. Microsoft Office Online Viewer (view-only, requires public URL) - FALLBACK
 * 4. Client-side rendering with mammoth.js (.docx only) - FALLBACK
 * 5. Download button as final fallback
 */

"use client";

import { useState, useEffect } from "react";
import { Download, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import mammoth from "mammoth";
import { useUploadSettingsStore } from "@/state/upload-settings-store";
import { OnlyOfficeEditor } from "./OnlyOfficeEditor";
import { GoogleDriveEditor } from "./GoogleDriveEditor";

interface OfficeDocumentViewerProps {
  contentId: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  title: string;
  onDownload: () => void;
}

type ViewerMode = "office-online" | "client-side" | "download-only";

export function OfficeDocumentViewer({
  contentId,
  downloadUrl,
  fileName,
  mimeType,
  title,
  onDownload,
}: OfficeDocumentViewerProps) {
  const { officeViewerMode, onlyofficeServerUrl } = useUploadSettingsStore();
  const [viewerMode, setViewerMode] = useState<ViewerMode>("office-online");
  const [clientHtml, setClientHtml] = useState<string | null>(null);
  const [isLoadingClient, setIsLoadingClient] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  // Debug: Log current settings
  useEffect(() => {
    console.log("[OfficeDocumentViewer] Current settings:", {
      officeViewerMode,
      onlyofficeServerUrl,
      hasServerUrl: !!onlyofficeServerUrl,
    });
  }, [officeViewerMode, onlyofficeServerUrl]);

  // 1. If Google Docs is selected, show Google Drive editor (will check auth internally)
  if (officeViewerMode === "google-docs") {
    return (
      <GoogleDriveEditor
        contentId={contentId}
        downloadUrl={downloadUrl}
        fileName={fileName}
        mimeType={mimeType}
        title={title}
        onDownload={onDownload}
      />
    );
  }

  // 2. If ONLYOFFICE is selected but not configured, show configuration message
  if (officeViewerMode === "onlyoffice" && !onlyofficeServerUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">ONLYOFFICE Server Not Configured</h3>
          <p className="text-gray-400 mb-4">
            You've selected ONLYOFFICE as your Office viewer, but the server URL hasn't been
            configured yet. Please set your ONLYOFFICE Document Server URL in Settings →
            Preferences.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={onDownload} variant="glass">
            <Download className="h-4 w-4 mr-2" />
            Download {fileName}
          </Button>
        </div>
      </div>
    );
  }

  // 3. If ONLYOFFICE is configured and selected, show ONLYOFFICE editor
  if (officeViewerMode === "onlyoffice" && onlyofficeServerUrl) {
    return (
      <OnlyOfficeEditor
        contentId={contentId}
        downloadUrl={downloadUrl}
        fileName={fileName}
        mimeType={mimeType}
        title={title}
        onDownload={onDownload}
      />
    );
  }

  // 4. Fallback viewers for remaining cases

  // Determine if this is a .docx file that can be rendered client-side
  const isDocx =
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("word") ||
    fileName.toLowerCase().endsWith(".docx");

  // Determine if Office Online Viewer is supported
  const isOfficeOnlineSupported =
    mimeType.includes("word") ||
    mimeType.includes("sheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("officedocument");

  useEffect(() => {
    // Reset state when file changes
    setIframeError(false);
    setClientHtml(null);
    setViewerMode("office-online");
  }, [downloadUrl]);

  // Auto-fallback to client-side rendering for .docx if Office Online fails
  useEffect(() => {
    if (iframeError && isDocx && viewerMode === "office-online") {
      console.log("[OfficeDocumentViewer] Office Online failed, trying client-side rendering");
      loadDocxClientSide();
    }
  }, [iframeError, isDocx, viewerMode]);

  const loadDocxClientSide = async () => {
    setIsLoadingClient(true);
    setViewerMode("client-side");

    try {
      // Fetch the .docx file as an ArrayBuffer
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch document");
      }

      const arrayBuffer = await response.arrayBuffer();

      // Convert .docx to HTML using mammoth
      const result = await mammoth.convertToHtml({ arrayBuffer });

      setClientHtml(result.value);

      // Log any conversion warnings
      if (result.messages.length > 0) {
        console.warn("[mammoth] Conversion warnings:", result.messages);
      }
    } catch (error) {
      console.error("[OfficeDocumentViewer] Client-side rendering failed:", error);
      toast.error("Failed to render document", {
        description: "Please download the file to view it.",
      });
      setViewerMode("download-only");
    } finally {
      setIsLoadingClient(false);
    }
  };

  const handleManualClientSideSwitch = () => {
    if (isDocx) {
      loadDocxClientSide();
    } else {
      setViewerMode("download-only");
    }
  };

  const handleOfficeOnlineError = () => {
    console.log("[OfficeDocumentViewer] Office Online iframe failed to load");
    setIframeError(true);
  };

  // Office Online Viewer URL
  const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
    downloadUrl
  )}`;

  // Render based on current mode
  if (viewerMode === "client-side") {
    if (isLoadingClient) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <RefreshCw className="h-12 w-12 text-blue-400 animate-spin mx-auto" />
            <p className="text-sm text-gray-400">Converting document to HTML...</p>
          </div>
        </div>
      );
    }

    if (clientHtml) {
      return (
        <div className="h-full flex flex-col">
          <div className="flex-none p-3 border-b border-white/10 bg-blue-500/10">
            <p className="text-xs text-blue-300 text-center flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Viewing with client-side renderer. Formatting may differ from the original.
            </p>
          </div>
          <div
            className="flex-1 overflow-auto p-8 bg-white text-black"
            dangerouslySetInnerHTML={{ __html: clientHtml }}
            style={{
              fontFamily: "Calibri, Arial, sans-serif",
              lineHeight: "1.5",
            }}
          />
        </div>
      );
    }
  }

  if (viewerMode === "download-only" || !isOfficeOnlineSupported) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-6xl">📄</div>
        <div className="text-center max-w-md">
          <h3 className="text-xl font-semibold mb-2">Office Document</h3>
          <p className="text-gray-400 mb-4">
            This document cannot be previewed in the browser. Download it to view in your preferred
            application.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={onDownload} variant="glass">
            <Download className="h-4 w-4 mr-2" />
            Download {fileName}
          </Button>
        </div>
      </div>
    );
  }

  // Default: Office Online Viewer
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative">
        <iframe
          key={downloadUrl}
          src={officeViewerUrl}
          className="w-full h-full border-0"
          title={title}
          onError={handleOfficeOnlineError}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
        {iframeError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="text-center space-y-4 p-8 max-w-md">
              <AlertCircle className="h-12 w-12 text-yellow-400 mx-auto" />
              <h3 className="text-lg font-semibold">Preview Unavailable</h3>
              <p className="text-sm text-gray-400">
                Microsoft Office Online Viewer couldn't load this document. This usually happens
                when the file URL is not publicly accessible.
              </p>
              <div className="flex gap-3 justify-center">
                {isDocx && (
                  <Button onClick={handleManualClientSideSwitch} variant="glass">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Alternative Viewer
                  </Button>
                )}
                <Button onClick={onDownload} variant="glass">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex-none p-3 border-t border-white/10 bg-black/20">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <p>
            Viewing with Microsoft Office Online.
            {isDocx && (
              <>
                {" "}
                <button
                  onClick={handleManualClientSideSwitch}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Try alternative viewer
                </button>
              </>
            )}
          </p>
          <button onClick={onDownload} className="text-blue-400 hover:text-blue-300 underline">
            Download instead
          </button>
        </div>
      </div>
    </div>
  );
}
