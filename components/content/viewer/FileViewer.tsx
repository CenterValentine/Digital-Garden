/**
 * File Viewer Component
 *
 * Routes to appropriate enhanced viewer for each file type:
 * - Images: ImageViewer (zoom, pan, rotate, fullscreen)
 * - PDFs: PDFViewer (page navigation, zoom, search)
 * - Videos: VideoPlayer (custom controls, playback speed, PiP)
 * - Audio: AudioPlayer (waveform visualization, playback controls)
 * - Office docs: OfficeDocumentViewer (Google Docs, ONLYOFFICE, Microsoft Viewer)
 * - Other files: Metadata display + download button
 */

"use client";

import { useState, useEffect } from "react";
import { Download, FileIcon, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import { OfficeDocumentViewer } from "./OfficeDocumentViewer";
import { ImageViewer } from "./ImageViewer";
import { PDFViewer } from "./PDFViewer";
import { VideoPlayer } from "./VideoPlayer";
import { AudioPlayer } from "./AudioPlayer";
import { JSONViewer } from "./JSONViewer";

interface FileViewerProps {
  contentId: string;
  title: string;
}

interface FileData {
  fileName: string;
  mimeType: string;
  fileSize: string;
  uploadStatus: string;
  storageProvider: string;
  downloadUrl?: string;
}

export function FileViewer({ contentId, title }: FileViewerProps) {
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip if this is a temporary document being created
    if (contentId.startsWith("temp-")) {
      setIsLoading(true); // Keep showing loading state
      setError(null);
      setFileData(null);
      return;
    }

    // Create AbortController for cleanup
    const abortController = new AbortController();
    let isCancelled = false;

    const fetchFileData = async () => {
      // Reset state when contentId changes
      setIsLoading(true);
      setError(null);
      setFileData(null); // Clear previous file data immediately

      try {
        // Fetch file content metadata
        const contentResponse = await fetch(`/api/content/content/${contentId}`, {
          credentials: "include",
          signal: abortController.signal,
        });

        if (!contentResponse.ok) {
          throw new Error("Failed to fetch file metadata");
        }

        const contentResult = await contentResponse.json();

        if (!contentResult.success || !contentResult.data.file) {
          throw new Error("Not a valid file");
        }

        const fileInfo = contentResult.data.file;

        // Fetch download URL
        const downloadResponse = await fetch(`/api/content/content/${contentId}/download`, {
          credentials: "include",
          signal: abortController.signal,
        });

        let downloadUrl: string | undefined;
        if (downloadResponse.ok) {
          const downloadResult = await downloadResponse.json();
          downloadUrl = downloadResult.data.url;
        }

        // Only update state if not cancelled
        if (!isCancelled) {
          setFileData({
            fileName: fileInfo.fileName,
            mimeType: fileInfo.mimeType,
            fileSize: fileInfo.fileSize,
            uploadStatus: fileInfo.uploadStatus,
            storageProvider: fileInfo.storageProvider || "unknown",
            downloadUrl,
          });
        }
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        if (!isCancelled) {
          console.error("Failed to fetch file:", err);
          setError(err instanceof Error ? err.message : "Failed to load file");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchFileData();

    // Cleanup function
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [contentId]);

  const handleDownload = () => {
    if (!contentId) {
      toast.error("Download not available");
      return;
    }

    // Use direct download endpoint with download=true to force download
    // This prevents text files from opening in browser
    const downloadUrl = `/api/content/content/${contentId}/download?download=true`;

    // Trigger download
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Download started", {
      description: fileData?.fileName || "File",
    });
  };

  const formatFileSize = (bytes: string) => {
    const size = Number.parseInt(bytes, 10);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return "🖼️";
    }
    if (mimeType === "application/pdf") {
      return "📄";
    }
    if (mimeType.includes("word") || mimeType.includes("document")) {
      return "📝";
    }
    if (mimeType.includes("sheet") || mimeType.includes("excel")) {
      return "📊";
    }
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) {
      return "📊";
    }
    return "📁";
  };

  const renderFileContent = () => {
    if (!fileData || !fileData.downloadUrl) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <p>Preview not available</p>
        </div>
      );
    }

    const { mimeType, downloadUrl } = fileData;

    // Image files - enhanced viewer with zoom, pan, rotation
    if (mimeType.startsWith("image/")) {
      return (
        <ImageViewer
          downloadUrl={downloadUrl}
          fileName={fileData.fileName}
          title={title}
          onDownload={handleDownload}
        />
      );
    }

    // PDF files - enhanced viewer with page navigation, zoom, and search
    if (mimeType === "application/pdf") {
      return (
        <PDFViewer
          downloadUrl={downloadUrl}
          fileName={fileData.fileName}
          title={title}
          onDownload={handleDownload}
        />
      );
    }

    // Office documents - use specialized viewer with fallback strategies
    // IMPORTANT: Exclude markdown files and plain text files from Office viewer
    // Markdown MIME types: text/markdown, text/x-markdown, application/x-markdown
    const isMarkdown =
      mimeType === "text/markdown" ||
      mimeType === "text/x-markdown" ||
      mimeType === "application/x-markdown" ||
      fileData.fileName.toLowerCase().endsWith(".md");

    const isPlainText = mimeType === "text/plain" && !fileData.fileName.toLowerCase().endsWith(".md");

    if (
      !isMarkdown && // Exclude markdown files
      !isPlainText && // Exclude plain text files
      (mimeType.includes("word") ||
        mimeType.includes("document") ||
        mimeType.includes("sheet") ||
        mimeType.includes("excel") ||
        mimeType.includes("presentation") ||
        mimeType.includes("powerpoint") ||
        mimeType.includes("officedocument") ||
        mimeType.includes("ms-excel") ||
        mimeType.includes("ms-powerpoint") ||
        mimeType.includes("msword"))
    ) {
      return (
        <OfficeDocumentViewer
          contentId={contentId}
          downloadUrl={downloadUrl}
          fileName={fileData.fileName}
          mimeType={mimeType}
          title={title}
          onDownload={handleDownload}
        />
      );
    }

    // Video files - custom player with controls
    if (mimeType.startsWith("video/")) {
      return (
        <VideoPlayer
          downloadUrl={downloadUrl}
          fileName={fileData.fileName}
          mimeType={mimeType}
          title={title}
          onDownload={handleDownload}
        />
      );
    }

    // Audio files - waveform player
    if (mimeType.startsWith("audio/")) {
      return (
        <AudioPlayer
          downloadUrl={downloadUrl}
          fileName={fileData.fileName}
          mimeType={mimeType}
          title={title}
          onDownload={handleDownload}
        />
      );
    }

    // JSON files - editable JSON editor with syntax highlighting
    if (mimeType === "application/json" || fileData.fileName.endsWith(".json")) {
      return (
        <JSONViewer
          contentId={contentId}
          downloadUrl={downloadUrl}
          fileName={fileData.fileName}
          title={title}
          onDownload={handleDownload}
        />
      );
    }

    // Text files (markdown, plain text, code files) - show in preformatted view
    if (
      isMarkdown ||
      isPlainText ||
      mimeType.startsWith("text/") ||
      fileData.fileName.endsWith(".md") ||
      fileData.fileName.endsWith(".txt") ||
      fileData.fileName.endsWith(".log")
    ) {
      return (
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-auto">
            <iframe
              src={downloadUrl}
              className="w-full h-full border-0 bg-white text-black"
              title={title}
              sandbox="allow-same-origin"
            />
          </div>
          <div className="flex-none p-3 border-t border-white/10 bg-black/20">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <p>Viewing text file (read-only)</p>
              <button onClick={handleDownload} className="text-blue-400 hover:text-blue-300 underline">
                Download file
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Other files - show file info with download
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-6xl">
          <FileIcon className="h-24 w-24 text-gray-400" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">File</h3>
          <p className="text-gray-400 mb-4">Preview not available for this file type</p>
        </div>
        <Button onClick={handleDownload} variant="glass">
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-400">Loading file...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-sm text-red-400 mb-2">Failed to load file</div>
          <div className="text-xs text-gray-500">{error}</div>
        </div>
      </div>
    );
  }

  if (!fileData) {
    return null;
  }

  // Check if this is a JSON file (which has its own header)
  const isJSONFile = fileData.mimeType === "application/json" || fileData.fileName.endsWith(".json");

  return (
    <div className="flex flex-col h-full">
      {/* File metadata header - skip for JSON files (they have their own header) */}
      {!isJSONFile && (
        <div className="flex-none px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <span>{formatFileSize(fileData.fileSize)}</span>
                <span>•</span>
                <span>{fileData.mimeType}</span>
                {fileData.uploadStatus !== "ready" && (
                  <>
                    <span>•</span>
                    <span className="text-yellow-400">Status: {fileData.uploadStatus}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File content/preview */}
      <div className="flex-1 overflow-hidden">{renderFileContent()}</div>
    </div>
  );
}
