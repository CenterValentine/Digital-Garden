"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDragDropManager } from "react-dnd";
import { validateFileBatch } from "@/lib/infrastructure/media/file-validation";
import { toast } from "sonner";
import { FileTree } from "./FileTree";
import { useTreeDragStore } from "@/state/tree-drag-store";
import { useTreeStateStore } from "@/state/tree-state-store";
import { useContentStore } from "@/state/content-store";
import {
  ROOT_DROP_TARGET,
  resolveUploadDropTarget,
  type UploadDropTarget,
} from "@/lib/domain/content/tree-drop-target";
import type { TreeNode } from "@/lib/domain/content/types";

interface FileTreeWithDropZoneProps {
  data: TreeNode[];
  onMove?: (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => Promise<void>;
  onSelect?: (nodes: TreeNode[]) => void;
  onRename?: (id: string, name: string) => Promise<void>;
  onCreate?: (parentId: string | null, type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx" | "json" | "external" | "chat" | "visualization" | "data" | "hope" | "workflow") => Promise<void>;
  onDelete?: (ids: string | string[]) => Promise<void>;
  onDuplicate?: (ids: string[]) => Promise<void>;
  onDownload?: (ids: string[]) => Promise<void>;
  onChangeIcon?: (id: string) => void;
  /** Phase 2: Folder view mode switching */
  onSetFolderView?: (id: string, viewMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas") => Promise<void>;
  /** Phase 2: Toggle referenced content visibility for folder */
  onToggleReferencedContent?: (id: string, currentValue: boolean) => Promise<void>;
  /** Visualization engine-specific creators */
  onCreateVisualizationMermaid?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationExcalidraw?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationDiagramsNet?: (parentId: string | null) => Promise<void>;
  onCreateAiImage?: (parentId: string | null) => Promise<void>;
  onAddPeopleTarget?: (parentId: string | null) => Promise<void>;
  height?: number;
  editingNodeId?: string;
  expandNodeId?: string | null;
  onExpandComplete?: () => void;
  /**
   * Called with the validated files and the folder they were dropped into
   * (`null` = vault root). See `lib/domain/content/tree-drop-target.ts` for
   * how the destination is resolved.
   */
  onFileDrop?: (files: File[], parentId: string | null) => void;
}

/** Id of the tree row under the pointer, if the event landed on one. */
function getPointerNodeId(event: React.DragEvent<HTMLDivElement>): string | null {
  const target = event.target as HTMLElement | null;
  const row = target?.closest?.("[data-tree-node-id]") as HTMLElement | null;
  return row?.dataset.treeNodeId ?? null;
}

/**
 * Tree wrapper that supports external file drops without creating another
 * react-dnd backend alongside react-arborist's internal one.
 *
 * Drops land in the folder the pointer is over; failing that, in the folder
 * implied by the tree selection or by the content open in the main panel.
 * Only a drop with none of those signals falls back to the vault root.
 */
function FileTreeDropZoneInner({ onFileDrop, ...treeProps }: FileTreeWithDropZoneProps) {
  const dndManager = useDragDropManager();
  const dragDepthRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [dropTarget, setDropTarget] = useState<UploadDropTarget>(ROOT_DROP_TARGET);
  const setExternalDropTargetId = useTreeDragStore((state) => state.setExternalDropTargetId);
  const treeData = treeProps.data;

  const resolveTarget = useCallback(
    (event: React.DragEvent<HTMLDivElement>): UploadDropTarget => {
      return resolveUploadDropTarget({
        treeData,
        pointerNodeId: getPointerNodeId(event),
        selectedIds: useTreeStateStore.getState().selectedIds,
        activeContentId: useContentStore.getState().selectedContentId,
      });
    },
    [treeData],
  );

  const clearDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragActive(false);
    setDropTarget(ROOT_DROP_TARGET);
    setExternalDropTargetId(null);
  }, [setExternalDropTargetId]);

  // A drag that ends outside the panel (Esc, drop on another surface) never
  // fires our drop handler — clear the row highlight on the window events.
  useEffect(() => {
    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    return () => {
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
      setExternalDropTargetId(null);
    };
  }, [clearDragState, setExternalDropTargetId]);

  const isExternalFileDrag = (event: React.DragEvent<HTMLDivElement>) => {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);

    const next = resolveTarget(event);
    if (next.parentId !== dropTarget.parentId || next.source !== dropTarget.source) {
      setDropTarget(next);
      setExternalDropTargetId(next.parentId);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      clearDragState();
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();

    // Resolve from the drop event itself rather than trusting the last
    // dragover — a fast drop can land before the final dragover fires.
    const target = resolveTarget(event);
    clearDragState();

    const droppedFiles = Array.from(event.dataTransfer.files ?? []);
    if (droppedFiles.length === 0) return;

    const { validFiles, invalidFiles } = validateFileBatch(droppedFiles);

    invalidFiles.forEach(({ file, error }) => {
      toast.error(error, {
        description: `File: ${file.name}`,
      });
    });

    if (validFiles.length > 0 && onFileDrop) {
      onFileDrop(validFiles, target.parentId);
    }
  };

  return (
    <div
      className={`relative w-full h-full ${
        isDragActive ? "ring-2 ring-inset ring-primary/60 rounded-sm" : ""
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag affordance — a destination banner rather than a full-cover
          scrim, so the target row stays visible and can be aimed at. */}
      {isDragActive && (
        <div className="absolute inset-x-2 bottom-2 z-50 pointer-events-none">
          <div
            className="flex items-center gap-2 rounded-md px-3 py-2 shadow-lg ring-1 ring-primary/40"
            style={{
              background: "rgba(16, 24, 39, 0.92)",
              backdropFilter: "blur(8px)",
            }}
          >
            <svg
              className="h-5 w-5 shrink-0 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">
                Drop into <span className="text-blue-300">{dropTarget.label}</span>
              </div>
              <div className="truncate text-[11px] text-gray-400">
                Max 100MB per file, 500MB total
              </div>
            </div>
          </div>
        </div>
      )}

      <FileTree {...treeProps} dndManager={dndManager} />
    </div>
  );
}

/**
 * Wrapper that renders the shared tree + file-drop surface
 *
 * The DndProvider now lives above the sidebar so remounting this tree
 * during panel transitions does not attempt to create another backend.
 */
export function FileTreeWithDropZone(props: FileTreeWithDropZoneProps) {
  return <FileTreeDropZoneInner {...props} />;
}
