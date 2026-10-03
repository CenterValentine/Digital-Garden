/**
 * Google Drive Editor
 *
 * Embeds Google Workspace editors (Docs/Sheets/Slides) for authenticated Google users.
 *
 * Flow:
 * 1. In parallel: read the file's metadata and probe the user's Google token.
 * 2. Already linked to Drive → embed the editor at once. The iframe runs on the
 *    browser's own Google session, so a dead refresh token on OUR side must not
 *    hide a file the user can already edit.
 * 3. Not linked and the token is good → upload to Drive (converting to the
 *    Google format), store the Drive id, embed.
 * 4. Not linked and the token is not usable → say exactly why, with the one
 *    action that fixes it:
 *      not_linked      → read-only Google Viewer + "Connect Google"
 *      reauth_required → "Reconnect Google" (consent re-run) + view read-only
 *      transient       → "Try again" + view read-only
 *    Before this, every failure collapsed into the read-only viewer with the
 *    hint "Sign in with Google for editing" — shown to users who already had.
 *
 * The read-only viewer is handed the presigned storage URL. The cookie-gated
 * proxy it used before (`/download?stream=true`) answers Google's fetcher with
 * 401, so that fallback rendered blank for everyone.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import { clientLogger } from "@/lib/core/logger/client";
import {
  googleReauthUrl,
  isGoogleReauthCode,
} from "@/lib/infrastructure/auth/google-reauth-client";
import type { GoogleAuthErrorCode } from "@/lib/infrastructure/auth";

interface GoogleDriveEditorProps {
  contentId: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  title: string;
  onDownload: () => void;
}

/** "ok" = a usable access token; otherwise the probe's reason. */
type GoogleAuthState = "checking" | "ok" | GoogleAuthErrorCode;

interface ProviderProbe {
  hasGoogleAuth: boolean;
  googleAuthCode: GoogleAuthErrorCode | null;
}

function toAuthState(data: Partial<ProviderProbe> | undefined): GoogleAuthState {
  if (data?.hasGoogleAuth) return "ok";
  if (
    data?.googleAuthCode === "not_linked" ||
    data?.googleAuthCode === "reauth_required" ||
    data?.googleAuthCode === "transient"
  ) {
    return data.googleAuthCode;
  }
  // Older/other failure shape: treat as "no Google" rather than "expired" so
  // we never push a consent screen on a guess.
  return "not_linked";
}

function connectGoogleUrl(): string {
  const redirect =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/content";
  return `/api/auth/google?${new URLSearchParams({ redirect }).toString()}`;
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
  const [authState, setAuthState] = useState<GoogleAuthState>("checking");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnlyOverride, setReadOnlyOverride] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lastTokenRefresh, setLastTokenRefresh] = useState<number>(Date.now());

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

  const retry = useCallback(() => {
    setError(null);
    setReadOnlyOverride(false);
    setAttempt((n) => n + 1);
  }, []);

  // Resolve: linked file → embed; else probe → upload or remedy.
  useEffect(() => {
    // Skip if this is a temporary document being created
    if (contentId.startsWith("temp-")) {
      setIsLoading(false);
      return;
    }

    // CRITICAL: Only upload Office documents to Google Drive
    // Markdown, text files, and other file types should NOT be uploaded
    if (!isGoogleDriveSupportedType) {
      setError("This file type is not supported by Google Docs");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function resolve() {
      setIsLoading(true);
      setGoogleFileId(null);

      try {
        // One round of parallel requests instead of three serial ones.
        const [contentResponse, probeResponse] = await Promise.all([
          fetch(`/api/content/content/${contentId}`, { credentials: "include" }),
          fetch("/api/auth/provider").catch(() => null),
        ]);
        if (cancelled) return;

        let probe: GoogleAuthState = "not_linked";
        if (probeResponse?.ok) {
          const probeJson = await probeResponse.json();
          probe = toAuthState(probeJson?.data);
        } else if (probeResponse && probeResponse.status >= 500) {
          probe = "transient";
        }
        setAuthState(probe);

        if (!contentResponse.ok) {
          // 404: file might not exist yet — nothing to show, no error either.
          if (contentResponse.status === 404) return;
          throw new Error("Failed to fetch file metadata");
        }

        const contentData = await contentResponse.json();
        const existingFileId: string | undefined =
          contentData.data?.file?.storageMetadata?.externalProviders?.googleDrive?.fileId;

        // Linked already: the editor iframe needs the BROWSER's Google session,
        // not our stored token, so embed regardless of the probe.
        if (existingFileId) {
          setGoogleFileId(existingFileId);
          return;
        }

        // Unlinked and no usable token: the remedy UI takes it from here.
        if (probe !== "ok") return;

        const response = await fetch("/api/google-drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentId, downloadUrl, fileName, mimeType }),
        });
        if (cancelled) return;

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // The token looked fine a moment ago and died on use (or Google
          // said so during upload): surface the remedy card, not a toast
          // that disappears while the user reads a generic error.
          if (isGoogleReauthCode(errorData.code)) {
            setAuthState(errorData.code as GoogleAuthErrorCode);
            return;
          }
          if (errorData.code === "transient" || response.status === 503) {
            setAuthState("transient");
            return;
          }
          throw new Error(errorData.error || "Failed to upload to Google Drive");
        }

        const data = await response.json();
        setGoogleFileId(data.data.fileId);
      } catch (err) {
        if (cancelled) return;
        const errorMessage =
          err instanceof Error ? err.message : "Failed to upload to Google Drive";
        clientLogger.error({
          layer: "ui",
          event: "gdrive_open:caught",
          summary: "google drive open failed",
          attrs: { content_id: contentId, mime_type: mimeType },
          error: err,
        });
        setError(errorMessage);
        toast.error("Failed to open in Google Docs", {
          description: "Please try downloading the file instead.",
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [contentId, downloadUrl, fileName, mimeType, isGoogleDriveSupportedType, attempt]);

  // Proactively refresh Google access token when tab becomes visible
  // This prevents "token expired" errors after long inactivity
  useEffect(() => {
    // Only meaningful when we hold a token to refresh and a document is open
    if (authState !== "ok" || !isGoogleDriveSupportedType || !googleFileId) {
      return;
    }

    async function refreshTokenOnVisibilityChange() {
      // Only refresh if document is visible and hasn't been refreshed recently (5min buffer)
      if (document.visibilityState === "visible") {
        const timeSinceLastRefresh = Date.now() - lastTokenRefresh;
        const fiveMinutes = 5 * 60 * 1000;

        if (timeSinceLastRefresh > fiveMinutes) {
          try {
            // Ping API to trigger token refresh if needed
            // The server-side getValidGoogleAccessToken() will auto-refresh
            await fetch("/api/auth/provider");
            setLastTokenRefresh(Date.now());
          } catch (err) {
            // Silent failure - token refresh will happen on next API call anyway
            clientLogger.warn({
              layer: "ui",
              event: "gdrive_token_refresh:failed",
              summary: "google token refresh on tab activation failed",
              attrs: { content_id: contentId },
              error: err,
            });
          }
        }
      }
    }

    // Refresh immediately when component mounts (if needed)
    refreshTokenOnVisibilityChange();

    // Listen for visibility changes (tab activation)
    document.addEventListener("visibilitychange", refreshTokenOnVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", refreshTokenOnVisibilityChange);
    };
  }, [authState, isGoogleDriveSupportedType, googleFileId, lastTokenRefresh, contentId]);

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
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Opening in {getGoogleAppName()}...</p>
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
          <Button onClick={retry} variant="glass">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button onClick={onDownload} variant="glass">
            <Download className="h-4 w-4 mr-2" />
            Download {fileName}
          </Button>
        </div>
      </div>
    );
  }

  // Success - show embedded Google editor
  if (googleFileId) {
    const editorUrl = getGoogleAppUrl(googleFileId);

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
          retry();
        } else {
          toast.error("Failed to clear metadata. Please try again.");
        }
      } catch (err) {
        clientLogger.error({
          layer: "ui",
          event: "gdrive_clear_metadata:caught",
          summary: "google drive clear-metadata handler caught",
          attrs: { content_id: contentId },
          error: err,
        });
        toast.error("Failed to clear metadata. Please try again.");
      }
    };

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

  // Not linked yet and no usable token. The remedy depends on WHY.
  const appName = getGoogleAppName();

  if (authState === "reauth_required" && !readOnlyOverride) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Google connection expired</h3>
          <p className="text-gray-400 mb-4">
            Digital Garden can no longer open files in {appName} on your behalf. Reconnect
            Google to edit this file; you&apos;ll come straight back here.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button
            onClick={() => {
              window.location.href = googleReauthUrl();
            }}
            variant="glass"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reconnect Google
          </Button>
          <Button onClick={() => setReadOnlyOverride(true)} variant="glass">
            View read-only
          </Button>
          <Button onClick={onDownload} variant="glass">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
    );
  }

  if (authState === "transient" && !readOnlyOverride) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Couldn&apos;t reach Google</h3>
          <p className="text-gray-400 mb-4">
            Google didn&apos;t answer when we tried to open this file in {appName}. Your
            connection is fine; this usually clears on a retry.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button onClick={retry} variant="glass">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button onClick={() => setReadOnlyOverride(true)} variant="glass">
            View read-only
          </Button>
          <Button onClick={onDownload} variant="glass">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
    );
  }

  // Read-only Google Viewer: no Google account linked, or the user chose it
  // over fixing the connection. The presigned URL is what Google's fetcher can
  // actually read (it has no Digital Garden session). It lasts an hour, which
  // outlives the single fetch the viewer makes.
  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(
    downloadUrl
  )}&embedded=true`;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative">
        <iframe
          key={downloadUrl}
          src={viewerUrl}
          className="w-full h-full border-0"
          title={title}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="flex-none p-3 border-t border-white/10 bg-blue-500/10">
        <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
          <p>Viewing with {appName} Viewer (read-only)</p>
          <div className="flex gap-3">
            {authState === "not_linked" && (
              <button
                onClick={() => {
                  window.location.href = connectGoogleUrl();
                }}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Connect Google to edit
              </button>
            )}
            {authState === "reauth_required" && (
              <button
                onClick={() => {
                  window.location.href = googleReauthUrl();
                }}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Reconnect Google to edit
              </button>
            )}
            {authState === "transient" && (
              <button onClick={retry} className="text-blue-400 hover:text-blue-300 underline">
                Try opening the editor again
              </button>
            )}
            <button onClick={onDownload} className="text-blue-400 hover:text-blue-300 underline">
              Download file
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
