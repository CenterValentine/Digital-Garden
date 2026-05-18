/**
 * ONLYOFFICE Document Editor
 *
 * Full-featured Office document editor with auto-save capabilities.
 * Supports .docx, .xlsx, .pptx with collaborative editing.
 *
 * Architecture:
 * 1. User opens document → React component initializes editor
 * 2. ONLYOFFICE Document Server fetches file from our storage
 * 3. User edits → Server calls our /api/onlyoffice/callback endpoint
 * 4. Backend downloads updated file, uploads to R2, updates database
 */

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DocumentEditor } from "@onlyoffice/document-editor-react";
import { AlertCircle, Download, Settings } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import { useUploadSettingsStore } from "@/state/upload-settings-store";
import { useResolvedTheme } from "@/lib/features/theme";
import { clientLogger } from "@/lib/core/logger/client";

interface OnlyOfficeEditorProps {
  contentId: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  title: string;
  onDownload: () => void;
}

type DocumentType = "word" | "cell" | "slide";

export function OnlyOfficeEditor({
  contentId,
  downloadUrl,
  fileName,
  mimeType,
  title,
  onDownload,
}: OnlyOfficeEditorProps) {
  const { onlyofficeServerUrl, setOfficeViewerMode } = useUploadSettingsStore();
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const resolvedTheme = useResolvedTheme();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(any-epic-phase-4): @onlyoffice/document-editor-react does not export the editor instance type; narrow once upstream type is available
  const editorRef = useRef<any>(null);

  // ONLYOFFICE uses `document.key` to decide whether to fetch fresh content or
  // reuse its cached doc. The original `${contentId}-${Date.now()}` ran on
  // every render, forcing iframe reloads, and `Date.now()` is impure-during-
  // render (React Compiler error).
  //
  // useId() gives us a stable-per-mount unique suffix, which preserves the
  // original intent ("each mount is a new document version") without the
  // purity violation. The id stays the same across re-renders of this mount,
  // and contentId in the prefix means switching to a different document
  // still yields a distinct key.
  const instanceId = useId();
  const documentKey = `${contentId}-${instanceId}`;

  // Determine document type from MIME type
  const getDocumentType = (): DocumentType => {
    if (mimeType.includes("word") || mimeType.includes("document")) {
      return "word";
    }
    if (mimeType.includes("sheet") || mimeType.includes("excel")) {
      return "cell";
    }
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) {
      return "slide";
    }
    return "word"; // Default fallback
  };

  // Get file extension for ONLYOFFICE
  const getFileType = (): string => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (!extension) return "docx";
    return extension;
  };

  // Check if ONLYOFFICE server is configured
  if (!onlyofficeServerUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">ONLYOFFICE Not Configured</h3>
          <p className="text-gray-400 mb-4">
            To enable Office document editing, you need to configure your ONLYOFFICE Document
            Server URL in settings.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              // TODO: Navigate to settings page
              toast.info("Settings page coming soon");
            }}
            variant="glass"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configure ONLYOFFICE
          </Button>
          <Button
            onClick={() => {
              // Fall back to Microsoft Office Viewer
              setOfficeViewerMode("microsoft-viewer");
              toast.info("Switched to view-only mode");
            }}
            variant="glass"
          >
            Use View-Only Mode
          </Button>
        </div>
      </div>
    );
  }

  // ONLYOFFICE configuration
  const config = {
    document: {
      fileType: getFileType(),
      key: documentKey, // Stable per contentId — see useMemo above
      title: title,
      url: downloadUrl, // ONLYOFFICE will fetch the document from this URL
      permissions: {
        comment: true,
        download: true,
        edit: true,
        fillForms: true,
        modifyContentControl: true,
        modifyFilter: true,
        print: true,
        review: true,
      },
    },
    documentType: getDocumentType(),
    editorConfig: {
      mode: "edit", // 'edit' or 'view'
      lang: "en",
      callbackUrl: `${window.location.origin}/api/onlyoffice/callback?contentId=${contentId}`,
      user: {
        id: "current-user", // TODO: Get from session
        name: "User", // TODO: Get from session
      },
      customization: {
        autosave: true, // Enable auto-save
        forcesave: true, // Force save on close
        comments: true,
        feedback: false,
        goback: false,
        chat: false, // Disable chat for single-user mode
        compactHeader: false,
        compactToolbar: false,
        help: true,
        hideRightMenu: false,
        plugins: true,
        toolbarNoTabs: false,
        uiTheme: resolvedTheme === "dark" ? "theme-dark" : "theme-light",
      },
    },
    events: {
      onDocumentReady: () => {
        setIsReady(true);
      },
      // OnlyOffice's React wrapper doesn't export its event types. Use narrow
      // inline shapes that match the documented DocumentEditor event payloads.
      onDocumentStateChange: (_event: { data?: unknown }) => {
        // Auto-save is handled by callbackUrl
      },
      onError: (event: { data?: string }) => {
        clientLogger.error({
          layer: "ui",
          event: "onlyoffice_editor:failed",
          summary: "onlyoffice editor reported error",
          attrs: {
            content_id: contentId,
            detail: event.data ?? "unknown",
          },
        });
        setError(`Editor error: ${event.data || "Unknown error"}`);
        toast.error("Editor error", {
          description: event.data || "Failed to load document editor",
        });
      },
      onWarning: (event: { data?: unknown }) => {
        clientLogger.warn({
          layer: "ui",
          event: "onlyoffice_editor:warning",
          summary: "onlyoffice editor warning",
          attrs: {
            content_id: contentId,
            detail: typeof event.data === "string" ? event.data : String(event.data ?? "unknown"),
          },
        });
      },
    },
    height: "100%",
    width: "100%",
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Failed to Load Editor</h3>
          <p className="text-gray-400 mb-4">{error}</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              setError(null);
              setIsReady(false);
            }}
            variant="glass"
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button
            onClick={() => {
              setOfficeViewerMode("microsoft-viewer");
              toast.info("Switched to view-only mode");
            }}
            variant="glass"
          >
            Use View-Only Mode
          </Button>
          <Button onClick={onDownload} variant="glass">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Loading indicator */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="text-center space-y-4">
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-400 border-r-transparent"></div>
            <p className="text-sm text-gray-300">Loading editor...</p>
          </div>
        </div>
      )}

      {/* ONLYOFFICE Editor */}
      <div className="flex-1">
        <DocumentEditor
          id={`onlyoffice-${contentId}`}
          documentServerUrl={onlyofficeServerUrl}
          config={config}
          onLoadComponentError={(error: unknown) => {
            clientLogger.error({
              layer: "ui",
              event: "onlyoffice_component_load:failed",
              summary: "onlyoffice component load failed",
              attrs: { content_id: contentId },
              error,
            });
            setError("Failed to load ONLYOFFICE editor component");
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex-none p-3 border-t border-white/10 bg-black/20">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <p>
            Editing with ONLYOFFICE • Auto-save enabled
            {isReady && <span className="ml-2 text-green-400">● Connected</span>}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setOfficeViewerMode("microsoft-viewer");
                toast.info("Switched to view-only mode");
              }}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Switch to view-only
            </button>
            <button onClick={onDownload} className="text-blue-400 hover:text-blue-300 underline">
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
