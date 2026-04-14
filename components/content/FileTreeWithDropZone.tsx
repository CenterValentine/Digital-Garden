"use client";

import { useRef, useState } from "react";
import { validateFileBatch } from "@/lib/infrastructure/media/file-validation";
import { toast } from "sonner";
import { FileTree } from "./FileTree";
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
  onAddPeopleTarget?: (parentId: string | null) => Promise<void>;
  height?: number;
  editingNodeId?: string;
  expandNodeId?: string | null;
  onExpandComplete?: () => void;
  onFileDrop?: (files: File[]) => void;
}

/**
 * Tree wrapper that supports external file drops without creating another
 * react-dnd backend alongside react-arborist's internal one.
 */
function FileTreeDropZoneInner({ onFileDrop, ...treeProps }: FileTreeWithDropZoneProps) {
  const dragDepthRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);

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
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);

    const droppedFiles = Array.from(event.dataTransfer.files ?? []);
    if (droppedFiles.length === 0) return;

    const { validFiles, invalidFiles } = validateFileBatch(droppedFiles);

    invalidFiles.forEach(({ file, error }) => {
      toast.error(error, {
        description: `File: ${file.name}`,
      });
    });

    if (validFiles.length > 0 && onFileDrop) {
      onFileDrop(validFiles);
    }
  };

  return (
    <div
      className="relative w-full h-full"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
      {isDragActive && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{
            background: 'rgba(16, 24, 39, 0.85)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex flex-col items-center gap-4">
            {/* Upload icon */}
            <svg
              className="w-16 h-16 text-blue-400"
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
            <div className="text-white text-lg font-medium">
              Drop files to upload
            </div>
            <div className="text-gray-400 text-sm">
              Max 100MB per file, 500MB total
            </div>
          </div>
        </div>
      )}

      <FileTree {...treeProps} />
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
