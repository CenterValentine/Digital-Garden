/**
 * Excalidraw Viewer Component
 *
 * Features:
 * - Hand-drawn whiteboarding with Excalidraw
 * - Auto-save with 2-second debounce
 * - Export to PNG/SVG/JSON
 * - Full-screen mode support
 * - Collaboration stub (disabled)
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css"; // Import CSS at top level (safe for SSR)
import { Pencil, Loader2, Check, ExternalLink } from "lucide-react";

// Type aliases for Excalidraw (types not exported in current version)
type ExcalidrawElement = any;
type AppState = any;
type BinaryFiles = any;
import { Button } from "@/components/ui/glass/button";
import { ExcalidrawToolbar } from "./ExcalidrawToolbar";
import { toast } from "sonner";

// Dynamically import Excalidraw to avoid SSR issues (component uses window)
const Excalidraw = dynamic(
  async () => {
    const module = await import("@excalidraw/excalidraw");
    return module.Excalidraw;
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    ),
  }
);

interface ExcalidrawViewerProps {
  contentId: string;
  title: string;
  config?: Record<string, unknown>;
  data?: {
    elements?: ExcalidrawElement[];
    appState?: Partial<AppState>;
    files?: BinaryFiles;
  };
  onSave?: (data: {
    elements: ExcalidrawElement[];
    appState: Partial<AppState>;
    files: BinaryFiles;
  }) => Promise<void>;
  isFullScreen?: boolean;
}

export function ExcalidrawViewer({
  contentId,
  title,
  config,
  data,
  onSave,
  isFullScreen = false,
}: ExcalidrawViewerProps) {
  // Log initial data for debugging
  useEffect(() => {
    console.log("[ExcalidrawViewer] Initial props:", {
      contentId,
      title,
      config,
      data,
      elementsCount: data?.elements?.length || 0,
    });
  }, []);

  const [elements, setElements] = useState<ExcalidrawElement[]>(
    data?.elements || []
  );

  // Initialize appState with proper defaults and ensure collaborators is a Map
  const [appState, setAppState] = useState<Partial<AppState>>(() => {
    const initialState = data?.appState || {};
    return {
      viewBackgroundColor: "#ffffff",
      currentItemStrokeColor: "#000000",
      currentItemBackgroundColor: "transparent",
      currentItemFillStyle: "solid",
      currentItemStrokeWidth: 2,
      currentItemRoughness: 1,
      currentItemOpacity: 100,
      ...initialState,
      // Ensure collaborators is always a Map (gets serialized to object in JSON)
      collaborators: new Map(),
    };
  });

  const [files, setFiles] = useState<BinaryFiles>(data?.files || {});
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Debounced save function
  const debouncedSave = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout;
      return async (
        elements: ExcalidrawElement[],
        appState: Partial<AppState>,
        files: BinaryFiles
      ) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          if (!onSave) return;

          setIsSaving(true);
          try {
            await onSave({ elements, appState, files });
            setLastSaved(new Date());
            setIsModified(false);
            console.log("[ExcalidrawViewer] Auto-saved successfully");
          } catch (error: any) {
            console.error("[ExcalidrawViewer] Save failed:", error);
            toast.error("Failed to save drawing", {
              description: error.message || "Could not save changes",
            });
          } finally {
            setIsSaving(false);
          }
        }, 2000);
      };
    })(),
    [onSave]
  );

  // Track if component has mounted to avoid saving initial data
  const [hasMounted, setHasMounted] = useState(false);
  // Track previous elements to detect actual content changes vs viewport changes
  const previousElementsRef = useRef<ExcalidrawElement[]>(data?.elements || []);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Handle Excalidraw onChange
  const handleChange = useCallback(
    (newElements: readonly ExcalidrawElement[], newAppState: AppState) => {
      // Convert readonly to mutable for state
      const mutableElements = [...newElements];

      // Check if elements actually changed (not just viewport pan/zoom)
      const elementsChanged =
        mutableElements.length !== previousElementsRef.current.length ||
        mutableElements.some((el, i) => {
          const prevEl = previousElementsRef.current[i];
          if (!prevEl) return true;
          // Compare element IDs and versions (Excalidraw increments version on change)
          return el.id !== prevEl.id || el.version !== prevEl.version;
        });

      console.log("[ExcalidrawViewer] onChange called", {
        elementsCount: mutableElements.length,
        elementsChanged,
        hasMounted,
      });

      setElements(mutableElements);
      setAppState(newAppState);

      // Only trigger save if component has mounted AND elements actually changed
      // (filters out viewport changes like pan/zoom)
      if (hasMounted && elementsChanged) {
        setIsModified(true);
        previousElementsRef.current = mutableElements;

        // Remove collaborators from appState before saving (Map doesn't serialize to JSON)
        const { collaborators, ...serializableAppState } = newAppState;
        debouncedSave(mutableElements, serializableAppState, files);
      }
    },
    [debouncedSave, files, hasMounted]
  );

  // Export handler
  const handleExport = async (format: "png" | "svg" | "json") => {
    if (format === "json") {
      // Direct JSON download
      const exportData = {
        type: "excalidraw",
        version: 2,
        source: "digital-garden",
        elements: elements,
        appState: appState,
        files: files,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title}.excalidraw`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Delay cleanup to ensure download starts
      setTimeout(() => URL.revokeObjectURL(url), 100);
      toast.success("Exported as JSON");
      return;
    }

    // PNG or SVG export using Excalidraw's export function
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");

      const blob = await exportToBlob({
        elements: elements,
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: false,
        },
        files: files,
        mimeType: format === "png" ? "image/png" : "image/svg+xml",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Delay cleanup to ensure download starts
      setTimeout(() => URL.revokeObjectURL(url), 100);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error: any) {
      console.error("[ExcalidrawViewer] Export failed:", error);
      toast.error("Export failed", {
        description: error.message || `Could not export as ${format.toUpperCase()}`,
      });
    }
  };

  // Open in new browser tab (full-screen mode)
  const openFullscreen = () => {
    console.log("[ExcalidrawViewer] openFullscreen called, contentId:", contentId);
    try {
      const url = `/content/visualization/${contentId}/fullscreen`;
      console.log("[ExcalidrawViewer] Opening URL:", url);
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      console.log("[ExcalidrawViewer] window.open result:", newWindow);
      if (!newWindow) {
        console.error("[ExcalidrawViewer] window.open returned null - popup may be blocked");
      }
    } catch (error) {
      console.error("[ExcalidrawViewer] Error opening fullscreen:", error);
    }
  };

  // Collaboration stub
  const startCollaboration = () => {
    console.log("[ExcalidrawViewer] Collaboration not yet implemented");
    toast.info("Real-time collaboration coming soon!");
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header (hidden in full-screen mode) */}
      {!isFullScreen && (
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Pencil className="h-5 w-5 text-blue-400" />
            <h1 className="text-lg font-semibold">{title}</h1>
            {/* Auto-save indicator */}
            {isModified && (
              <span className="text-xs text-yellow-400">Unsaved changes</span>
            )}
            {isSaving && (
              <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />
            )}
            {!isModified && !isSaving && lastSaved && (
              <Check className="h-3 w-3 text-green-400" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Full view button (opens new tab) */}
            <Button onClick={openFullscreen} variant="ghost" size="sm" type="button">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Excalidraw Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0" style={{ height: "100%", width: "100%" }}>
          <Excalidraw
            initialData={{
              elements: elements,
              appState: appState,
              files: files,
            }}
            onChange={handleChange}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                export: false, // Use our custom export
                saveAsImage: false,
              },
            }}
          />
        </div>
      </div>

      {/* Toolbelt (minimal in full-screen) */}
      {!isFullScreen && (
        <ExcalidrawToolbar
          elementCount={elements.length}
          onExport={handleExport}
          onFullView={openFullscreen}
          onStartCollaboration={startCollaboration}
          isModified={isModified}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
