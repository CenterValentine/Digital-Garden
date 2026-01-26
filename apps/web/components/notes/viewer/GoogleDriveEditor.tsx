/**
 * Google Drive Editor
 *
 * Embeds Google Workspace editors (Docs/Sheets/Slides) for authenticated Google users.
 *
 * Flow:
 * 1. Check if user signed in with Google
 * 2. Check if file already has Google Drive metadata (reuse existing file)
 * 3. If no existing file, upload to user's Google Drive (via API)
 * 4. Embed appropriate Google editor (Docs/Sheets/Slides) based on MIME type
 * 5. Edits persist in Google Drive (no duplication on reload)
 *
 * For non-Google users, falls back to Google Viewer (read-only).
 */

"use client";

import { useState, useEffect } from "react";
import { AlertCircle, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";

interface GoogleDriveEditorProps {
  contentId: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  title: string;
  onDownload: () => void;
}

export function GoogleDriveEditor({
  contentId,
  downloadUrl,
  fileName,
  mimeType,
  title,
  onDownload,
}: GoogleDriveEditorProps) {
  const [googleFileId, setGoogleFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if this file type is supported by Google Drive
  const isGoogleDriveSupportedType =
    mimeType.includes("word") ||
    mimeType.includes("sheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("officedocument") ||
    mimeType.includes("ms-excel") ||
    mimeType.includes("ms-powerpoint") ||
    mimeType.includes("msword");

  // Check if user has Google authentication
  useEffect(() => {
    async function checkGoogleAuth() {
      try {
        const response = await fetch("/api/auth/provider");
        const data = await response.json();

        if (data.success && data.data.hasGoogleAuth) {
          setHasGoogleAuth(true);
        } else {
          setHasGoogleAuth(false);
          // For non-Google users, we'll use Google Docs Viewer (view-only)
          // No error - this is a valid state
        }
      } catch (err) {
        // Suppress error logging - this is expected for non-authenticated users
        // Only set error state for UI, don't pollute console
        setHasGoogleAuth(false);
      } finally {
        setIsCheckingAuth(false);
      }
    }

    checkGoogleAuth();
  }, []);

  // Check for existing Google Drive file or upload new one (only for Google users)
  useEffect(() => {
    if (isCheckingAuth) return;

    // Skip if this is a temporary document being created
    if (contentId.startsWith("temp-")) {
      setIsUploading(false);
      return;
    }

    // CRITICAL: Only upload Office documents to Google Drive
    // Markdown, text files, and other file types should NOT be uploaded
    if (!isGoogleDriveSupportedType) {
      console.log("[GoogleDriveEditor] File type not supported by Google Drive:", mimeType);
      setError("This file type is not supported by Google Docs");
      setIsUploading(false);
      return;
    }

    // For non-Google users, skip upload and go directly to view-only mode
    if (!hasGoogleAuth) {
      setIsUploading(false);
      return;
    }

    async function loadOrUploadToGoogleDrive() {
      setIsUploading(true);

      try {
        // First, check if file already has Google Drive metadata
        const contentResponse = await fetch(`/api/notes/content/${contentId}`, {
          credentials: 'include', // Include cookies for authentication
        });
        if (!contentResponse.ok) {
          // Suppress 404s - file might not exist yet
          if (contentResponse.status === 404) {
            return;
          }
          throw new Error("Failed to fetch file metadata");
        }

        const contentData = await contentResponse.json();
        const file = contentData.data?.file;
        const storageMetadata = file?.storageMetadata;

        // Check if Google Drive file ID exists in metadata
        const existingFileId = storageMetadata?.externalProviders?.googleDrive?.fileId;

        if (existingFileId) {
          console.log("[GoogleDriveEditor] Reusing existing Google Drive file:", existingFileId);
          setGoogleFileId(existingFileId);
          setIsUploading(false);
          return;
        }

        // No existing file - upload to Google Drive
        const response = await fetch("/api/google-drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId,
            downloadUrl,
            fileName,
            mimeType,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to upload to Google Drive");
        }

        const data = await response.json();
        setGoogleFileId(data.data.fileId);
      } catch (err) {
        // Only log actual errors (not auth/permission issues which are expected)
        const errorMessage = err instanceof Error ? err.message : "Failed to upload to Google Drive";
        const isExpectedError = errorMessage.includes("authentication") || errorMessage.includes("permission");

        if (!isExpectedError) {
          console.error("[GoogleDriveEditor] Upload failed:", err);
        }

        setError(errorMessage);
        toast.error("Failed to open in Google Docs", {
          description: "Please try downloading the file instead.",
        });
      } finally {
        setIsUploading(false);
      }
    }

    loadOrUploadToGoogleDrive();
  }, [hasGoogleAuth, isCheckingAuth, contentId, downloadUrl, fileName, mimeType]);

  // Determine Google app type from MIME type
  const getGoogleAppUrl = (fileId: string): string => {
    // IMPORTANT: Check for "sheet" BEFORE "document" because Excel MIME types contain both!
    // Excel: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    if (mimeType.includes("sheet") || mimeType.includes("excel")) {
      return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
    }
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) {
      return `https://docs.google.com/presentation/d/${fileId}/edit`;
    }
    if (mimeType.includes("word") || mimeType.includes("document")) {
      return `https://docs.google.com/document/d/${fileId}/edit`;
    }
    return `https://drive.google.com/file/d/${fileId}/view`;
  };

  // Determine Google app name from MIME type
  const getGoogleAppName = (): string => {
    // IMPORTANT: Check for "sheet" BEFORE "document" because Excel MIME types contain both!
    if (mimeType.includes("sheet") || mimeType.includes("excel")) {
      return "Google Sheets";
    }
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) {
      return "Google Slides";
    }
    if (mimeType.includes("word") || mimeType.includes("document")) {
      return "Google Docs";
    }
    return "Google Drive";
  };

  // Loading state
  if (isCheckingAuth || isUploading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-sm text-gray-400">
            {isCheckingAuth ? "Verifying Google authentication..." : `Uploading to ${getGoogleAppName()}...`}
          </p>
        </div>
      </div>
    );
  }

  // Error state (only show if actual error occurred)
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">{getGoogleAppName()} Unavailable</h3>
          <p className="text-gray-400 mb-4">{error}</p>
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

  // Non-Google users: Use Google Docs Viewer (view-only mode)
  if (!hasGoogleAuth) {
    // Use proxy URL for Google Docs Viewer (requires public URL without auth params)
    const proxyUrl = `${window.location.origin}/api/notes/content/${contentId}/download?stream=true`;
    const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(proxyUrl)}&embedded=true`;

    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 relative">
          <iframe
            key={proxyUrl}
            src={viewerUrl}
            className="w-full h-full border-0"
            title={title}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="flex-none p-3 border-t border-white/10 bg-blue-500/10">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <p>
              Viewing with {getGoogleAppName()} Viewer (read-only)
              <span className="ml-2 text-blue-400">ℹ️ Sign in with Google for editing</span>
            </p>
            <button onClick={onDownload} className="text-blue-400 hover:text-blue-300 underline">
              Download file
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Helper function to clear metadata and force re-upload
  const forceReupload = async () => {
    try {
      // Clear the Google Drive metadata
      const response = await fetch(`/api/google-drive/clear-metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId }),
      });

      if (response.ok) {
        // Reload the page to trigger a new upload
        window.location.reload();
      } else {
        toast.error("Failed to clear metadata. Please try again.");
      }
    } catch (err) {
      console.error("[GoogleDriveEditor] Failed to clear metadata:", err);
      toast.error("Failed to clear metadata. Please try again.");
    }
  };

  // Success - show embedded Google editor
  if (googleFileId) {
    const editorUrl = getGoogleAppUrl(googleFileId);

    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 relative">
          <iframe
            key={googleFileId}
            src={editorUrl}
            className="w-full h-full border-0"
            title={title}
            allow="clipboard-read; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="flex-none p-3 border-t border-white/10 bg-black/20">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <p>
              Editing with {getGoogleAppName()} • Auto-save enabled
              <span className="ml-2 text-green-400">● Connected</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.open(editorUrl, "_blank")}
                className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Open in new tab
              </button>
              <button onClick={onDownload} className="text-blue-400 hover:text-blue-300 underline">
                Download original
              </button>
              <button onClick={forceReupload} className="text-yellow-400 hover:text-yellow-300 underline">
                Re-upload to Drive
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
