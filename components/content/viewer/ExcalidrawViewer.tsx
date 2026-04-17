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
import type { CollaborationRuntimeHandle } from "@/lib/domain/collaboration/runtime";

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
  isEmbedded?: boolean;
  collaborationRuntime?: CollaborationRuntimeHandle | null;
}

export function ExcalidrawViewer({
  contentId,
  title,
  config,
  data,
  onSave,
  isFullScreen = false,
  isEmbedded = false,
  collaborationRuntime,
}: ExcalidrawViewerProps) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidrawAPIRef = useRef<any>(null);
  // Stable reference — passing a new function each render causes Excalidraw to re-call
  // the callback every render, triggering a setState → re-render infinite loop.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setExcalidrawAPI = useCallback((api: any) => { excalidrawAPIRef.current = api; }, []);

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
  // Ref to track the current elements — used to skip echoing our own Y.js updates
  const isApplyingRemoteRef = useRef(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // ── Y.js collaboration binding ─────────────────────────────────────────
  useEffect(() => {
    const ydoc = collaborationRuntime?.ydoc;
    if (!ydoc) return;

    // Y.Map<elementId, element> — each element is an independent CRDT entry.
    // Concurrent draws from two clients merge at the element level instead of
    // last-write-wins on the whole array (the old Y.Array delete+reinsert approach).
    const elementMap = ydoc.getMap<ExcalidrawElement>("elementMap");

    const handleRemoteElements = () => {
      if (isApplyingRemoteRef.current) return;
      const remoteElements = Array.from(elementMap.values());
      setElements(remoteElements);
      previousElementsRef.current = remoteElements;
      // Imperatively update the canvas — initialData is mount-only, not reactive.
      // Hold isApplyingRemoteRef through the next frame so Excalidraw's onChange
      // (which fires after updateScene) doesn't echo the update back to Y.js.
      if (excalidrawAPIRef.current) {
        isApplyingRemoteRef.current = true;
        excalidrawAPIRef.current.updateScene({ elements: remoteElements });
        // Reset immediately — previousElementsRef is already set to remoteElements above,
        // so the elementsChanged check in onChange will block any echo without needing a delay.
        isApplyingRemoteRef.current = false;
      }
    };

    // Populate canvas from pre-existing Y.Doc state (observe only fires on future changes).
    handleRemoteElements();
    elementMap.observe(handleRemoteElements);
    return () => elementMap.unobserve(handleRemoteElements);
  }, [collaborationRuntime?.ydoc]);

  // Handle Excalidraw onChange
  const handleChange = useCallback(
    (newElements: readonly ExcalidrawElement[], newAppState: AppState) => {
      const mutableElements = [...newElements];

      // ID-based comparison: index-based fails when Y.Map returns elements in a
      // different order than the local canvas (e.g. after a remote update).
      const prevById = new Map(previousElementsRef.current.map(el => [el.id, el]));
      const elementsChanged =
        mutableElements.length !== previousElementsRef.current.length ||
        mutableElements.some(el => {
          const prev = prevById.get(el.id);
          return !prev || prev.version !== el.version;
        });

      setElements(mutableElements);
      setAppState(newAppState);

      // Only trigger save if component has mounted AND elements actually changed
      // (filters out viewport changes like pan/zoom and remote updateScene echoes)
      if (hasMounted && elementsChanged && !isApplyingRemoteRef.current) {
        setIsModified(true);
        previousElementsRef.current = mutableElements;

        // Sync to Y.js — upsert changed elements, delete removed ones.
        // Version check avoids redundant writes for unchanged elements.
        const ydoc = collaborationRuntime?.ydoc;
        if (ydoc) {
          const elementMap = ydoc.getMap<ExcalidrawElement>("elementMap");
          isApplyingRemoteRef.current = true;
          ydoc.transact(() => {
            const currentIds = new Set(mutableElements.map(el => el.id));
            for (const el of mutableElements) {
              const existing = elementMap.get(el.id);
              if (!existing || existing.version !== el.version) {
                elementMap.set(el.id, el);
              }
            }
            // Remove elements deleted from the canvas
            for (const existingId of elementMap.keys()) {
              if (!currentIds.has(existingId)) elementMap.delete(existingId);
            }
          });
          isApplyingRemoteRef.current = false;
        }

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

  const openFullscreen = () => {
    window.open(`/content/visualization/${contentId}/fullscreen`, "_blank", "noopener,noreferrer");
  };

  const isCollaborating = !!collaborationRuntime?.ydoc &&
    collaborationRuntime.state.connectionState !== "localOnly";

  return (
    <div className="h-full flex flex-col">
      {/* Header (hidden in full-screen mode or when embedded in a block) */}
      {!isFullScreen && !isEmbedded && (
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
            excalidrawAPI={setExcalidrawAPI}
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
          isModified={isModified}
          isSaving={isSaving}
          isCollaborating={isCollaborating}
        />
      )}
    </div>
  );
}
