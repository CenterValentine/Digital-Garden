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
import { Pencil, Loader2, Check, ExternalLink, Maximize2, Minimize2, BookOpen } from "lucide-react";
import type * as Y from "yjs";

// Type aliases for Excalidraw (types not exported in current version)
type ExcalidrawElement = any;
type AppState = any;
type BinaryFiles = any;
import { Button } from "@/components/ui/glass/button";
import { ExcalidrawToolbar } from "./ExcalidrawToolbar";
import { toast } from "sonner";
import type { CollaborationRuntimeHandle } from "@/lib/domain/collaboration/runtime";

// Fields to compare when deciding if an element *meaningfully* changed.
// Excludes `version` / `versionNonce` / `updated` — those get bumped by
// Excalidraw's own updateScene (applied during remote merges), so comparing
// them causes the well-known "remote update comes in → onChange fires →
// write version-bumped element back → peer echoes → divergence" loop.
const SEMANTIC_FIELDS: readonly string[] = [
  "type", "x", "y", "width", "height", "angle",
  "strokeColor", "backgroundColor", "fillStyle", "strokeWidth", "strokeStyle",
  "roughness", "opacity", "roundness", "text", "fontSize", "fontFamily",
  "textAlign", "verticalAlign", "baseline", "containerId", "originalText",
  "lineHeight", "points", "lastCommittedPoint", "startBinding", "endBinding",
  "startArrowhead", "endArrowhead", "isDeleted", "groupIds", "frameId",
  "link", "locked",
];

function sameExcalidrawElement(a: ExcalidrawElement, b: ExcalidrawElement): boolean {
  if (a === b) return true;
  for (const k of SEMANTIC_FIELDS) {
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) return false;
  }
  return true;
}

// Deep-clone before writing to Y.Map so the stored value is a snapshot, not
// a live reference Excalidraw will continue mutating.
function cloneElement(el: ExcalidrawElement): ExcalidrawElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sc = (globalThis as any).structuredClone as ((v: unknown) => unknown) | undefined;
  if (typeof sc === "function") return sc(el) as ExcalidrawElement;
  return JSON.parse(JSON.stringify(el));
}

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
  /**
   * Path A: when embedded inside a note, the drawing binds to a sub-map on the
   * note's own Y.Doc instead of acquiring a separate collaboration runtime.
   */
  embedYdoc?: Y.Doc | null;
  embedYMapKey?: string | null;
  /**
   * Legacy path: when standalone (not owned by a note), the drawing may still
   * have its own collaboration runtime with a top-level "elementMap". Ignored
   * when embedYdoc is provided.
   */
  collaborationRuntime?: CollaborationRuntimeHandle | null;
  /**
   * Read-only surfaces: standalone viewer for a drawing that lives inside a
   * note — edits happen in the owning note, not here.
   */
  isReadOnly?: boolean;
  ownerNoteInfo?: {
    noteId: string;
    noteTitle?: string;
    blockId?: string | null;
  } | null;
}

export function ExcalidrawViewer({
  contentId,
  title,
  config,
  data,
  onSave,
  isFullScreen = false,
  isEmbedded = false,
  embedYdoc = null,
  embedYMapKey = null,
  collaborationRuntime,
  isReadOnly = false,
  ownerNoteInfo = null,
}: ExcalidrawViewerProps) {
  // Resolve which ydoc + map key we bind to. embedYdoc wins (Path A); fall back
  // to collaborationRuntime for legacy standalone drawings.
  const boundYdoc: Y.Doc | null = embedYdoc ?? collaborationRuntime?.ydoc ?? null;
  const boundMapKey: string = embedYMapKey ?? "elementMap";

  // Expand-in-place (Path A): embedded viewer grows to cover the viewport
  // without navigating away. Preserves the React tree + Y.Doc binding.
  const [isExpandedInPlace, setIsExpandedInPlace] = useState(false);
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
  // A stable origin marker for our own Y.js writes. When the observer fires
  // inside our own transact, it checks transaction.origin and skips — this
  // avoids calling updateScene in the middle of the user's live stroke,
  // which would replace the still-being-drawn element with a stale clone
  // and freeze the stroke at its first point.
  const localOriginRef = useRef(Symbol("excalidraw-local"));

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // ── Y.js collaboration binding ─────────────────────────────────────────
  useEffect(() => {
    if (!boundYdoc) return;

    // Y.Map<elementId, element> — each element is an independent CRDT entry.
    // Concurrent draws from two clients merge at the element level instead of
    // last-write-wins on the whole array (the old Y.Array delete+reinsert approach).
    const elementMap = boundYdoc.getMap<ExcalidrawElement>(boundMapKey);

    // Initial sync from pre-existing Y.Map state — observe only fires on
    // future changes, so we seed the canvas once at mount.
    {
      const remoteElements = Array.from(elementMap.values());
      if (remoteElements.length > 0) {
        setElements(remoteElements);
        previousElementsRef.current = remoteElements;
        if (excalidrawAPIRef.current) {
          isApplyingRemoteRef.current = true;
          try {
            excalidrawAPIRef.current.updateScene({ elements: remoteElements });
          } finally {
            requestAnimationFrame(() => {
              isApplyingRemoteRef.current = false;
            });
          }
        }
      }
    }

    // Observer for REMOTE changes only. We tag our own transacts with
    // localOriginRef and skip when transaction.origin matches — otherwise
    // the observer would fire inside the user's live stroke (Yjs observers
    // run synchronously at end of transact) and updateScene would replace
    // the live element with a stale clone, freezing the draw.
    const handleRemoteElements = (_event: unknown, transaction: { origin: unknown }) => {
      if (transaction.origin === localOriginRef.current) return;

      const remoteElements = Array.from(elementMap.values());
      setElements(remoteElements);
      previousElementsRef.current = remoteElements;
      if (excalidrawAPIRef.current) {
        isApplyingRemoteRef.current = true;
        try {
          excalidrawAPIRef.current.updateScene({ elements: remoteElements });
        } finally {
          requestAnimationFrame(() => {
            isApplyingRemoteRef.current = false;
          });
        }
      }
    };

    elementMap.observe(handleRemoteElements);
    return () => elementMap.unobserve(handleRemoteElements);
  }, [boundYdoc, boundMapKey]);

  // Handle Excalidraw onChange
  const handleChange = useCallback(
    (newElements: readonly ExcalidrawElement[], newAppState: AppState) => {
      const mutableElements = [...newElements];

      setElements(mutableElements);
      setAppState(newAppState);

      // Read-only viewers never write back. The canvas updates for local pan/zoom
      // but drawing operations are effectively no-ops for persistence.
      if (isReadOnly) return;
      if (!hasMounted) return;
      // Don't fire writes while we're applying a remote update — Excalidraw's
      // updateScene triggers onChange synchronously inside our observer.
      if (isApplyingRemoteRef.current) return;

      if (boundYdoc) {
        const elementMap = boundYdoc.getMap<ExcalidrawElement>(boundMapKey);

        // Compare against the Y.Map directly, not a local ref. The ref can lag
        // when Excalidraw bumps `version` during updateScene — that bump is
        // purely local and would otherwise trigger an echo write-back (the
        // "one behind then diverges" bug).
        const currentIds = new Set(mutableElements.map((el) => el.id));
        let structuralChange = false;
        const toWrite: ExcalidrawElement[] = [];
        for (const el of mutableElements) {
          const existing = elementMap.get(el.id);
          if (!existing) {
            toWrite.push(el);
            structuralChange = true;
            continue;
          }
          // Only write when a SEMANTIC field changed (geometry, style, text).
          // We deliberately ignore `version` / `versionNonce` because
          // Excalidraw rewrites those on every updateScene, even when nothing
          // meaningful changed.
          if (!sameExcalidrawElement(existing, el)) {
            toWrite.push(el);
          }
        }
        const toDelete: string[] = [];
        for (const existingId of elementMap.keys()) {
          if (!currentIds.has(existingId)) {
            toDelete.push(existingId);
            structuralChange = true;
          }
        }

        if (toWrite.length > 0 || toDelete.length > 0) {
          setIsModified(true);
          previousElementsRef.current = mutableElements;
          boundYdoc.transact(() => {
            // Clone before writing: Excalidraw mutates elements in place as a
            // stroke is drawn (points[] gets appended per pointermove). If we
            // wrote the live reference, Y.Map's stored value would share the
            // same object — and subsequent comparisons (Y.Map.get(id) vs el)
            // would see an identical reference and skip every update past the
            // first. Cloning snapshots the element at write time so the next
            // diff can see that points[] grew.
            for (const el of toWrite) elementMap.set(el.id, cloneElement(el));
            for (const id of toDelete) elementMap.delete(id);
          }, localOriginRef.current);
        } else if (structuralChange) {
          // Pure-delete edge case (shouldn't hit since we'd push to toDelete)
          setIsModified(true);
        }
      }

      // REST autosave is only used for legacy standalone (non-embed) mode.
      // For embedded drawings, the server store hook writes the non-canonical
      // backup into visualizationPayload whenever the note's ydoc is stored.
      if (!isEmbedded) {
        const { collaborators, ...serializableAppState } = newAppState;
        debouncedSave(mutableElements, serializableAppState, files);
      }
    },
    [debouncedSave, files, hasMounted, isReadOnly, isEmbedded, boundYdoc, boundMapKey]
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

  // Expand target: embedded drawings grow to cover the viewport in-place so
  // the React tree + ydoc binding stay mounted. Standalone (non-embedded) can
  // still open a new tab — a separate URL for a standalone drawing is fine.
  const handleFullView = () => {
    if (isEmbedded) {
      setIsExpandedInPlace((v) => !v);
      return;
    }
    window.open(`/content/visualization/${contentId}/fullscreen`, "_blank", "noopener,noreferrer");
  };

  const openOwningNote = () => {
    if (!ownerNoteInfo) return;
    const hash = ownerNoteInfo.blockId ? `#block-${ownerNoteInfo.blockId}` : "";
    window.open(`/content/note/${ownerNoteInfo.noteId}${hash}`, "_blank", "noopener,noreferrer");
  };

  const isCollaborating =
    (!!embedYdoc) ||
    (!!collaborationRuntime?.ydoc &&
      collaborationRuntime.state.connectionState !== "localOnly");

  return (
    <div
      className={
        isExpandedInPlace
          ? "fixed inset-0 z-[9999] bg-background flex flex-col"
          : "h-full flex flex-col"
      }
    >
      {/* Read-only banner: shown when this drawing is owned by a note */}
      {isReadOnly && ownerNoteInfo && (
        <div className="flex items-center justify-between gap-3 border-b border-yellow-500/20 bg-yellow-500/10 px-6 py-2 text-xs">
          <span className="text-yellow-300">
            View-only — this drawing lives inside
            {ownerNoteInfo.noteTitle ? ` “${ownerNoteInfo.noteTitle}”` : " a note"}. Edit it there to keep changes in sync.
          </span>
          <Button onClick={openOwningNote} variant="ghost" size="sm" type="button">
            <BookOpen className="h-3.5 w-3.5 mr-1" />
            Open in note
          </Button>
        </div>
      )}

      {/* Header (hidden when rendered inside a note block or in full-screen) */}
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
            <Button onClick={handleFullView} variant="ghost" size="sm" type="button">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* In-place expand toggle — only shown when embedded */}
      {isEmbedded && (
        <div className="flex items-center justify-end border-b px-3 py-1">
          <Button onClick={handleFullView} variant="ghost" size="sm" type="button">
            {isExpandedInPlace ? (
              <><Minimize2 className="h-3.5 w-3.5 mr-1" /> Collapse</>
            ) : (
              <><Maximize2 className="h-3.5 w-3.5 mr-1" /> Expand</>
            )}
          </Button>
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
            viewModeEnabled={isReadOnly}
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
          onFullView={handleFullView}
          isModified={isModified}
          isSaving={isSaving}
          isCollaborating={isCollaborating}
        />
      )}
    </div>
  );
}
