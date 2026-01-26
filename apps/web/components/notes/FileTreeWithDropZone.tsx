"use client";

import { DndProvider, useDrop, useDragDropManager } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { NativeTypes } from "react-dnd-html5-backend";
import { validateFileBatch } from "@/lib/media/file-validation";
import { toast } from "sonner";
import { FileTree } from "./FileTree";
import type { TreeNode } from "@/lib/content/types";

interface FileTreeWithDropZoneProps {
  data: TreeNode[];
  onMove?: (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => Promise<void>;
  onSelect?: (nodes: TreeNode[]) => void;
  onRename?: (id: string, name: string) => Promise<void>;
  onCreate?: (parentId: string | null, type: "folder" | "note" | "file" | "code" | "html") => Promise<void>;
  onDelete?: (ids: string | string[]) => Promise<void>;
  onDuplicate?: (ids: string[]) => Promise<void>;
  onDownload?: (ids: string[]) => Promise<void>;
  height?: number;
  editingNodeId?: string;
  expandNodeId?: string | null;
  onExpandComplete?: () => void;
  onFileDrop?: (files: File[]) => void;
}

/**
 * Inner component that uses useDrop hook
 * Must be inside DndProvider context
 */
function FileTreeDropZoneInner({ onFileDrop, ...treeProps }: FileTreeWithDropZoneProps) {
  // Get the DND manager to pass to react-arborist
  // This allows react-arborist to share our DndProvider instead of creating its own
  const manager = useDragDropManager();

  const [{ isOver, canDrop }, dropRef] = useDrop(
    () => ({
      accept: NativeTypes.FILE,
      drop: (item: { files: File[] }) => {
        const droppedFiles = item.files;

        if (droppedFiles.length === 0) return;

        // Validate files
        const { validFiles, invalidFiles } = validateFileBatch(droppedFiles);

        // Show error toasts for invalid files
        invalidFiles.forEach(({ file, error }) => {
          toast.error(error, {
            description: `File: ${file.name}`,
          });
        });

        // If we have valid files, notify parent to open upload dialog
        if (validFiles.length > 0 && onFileDrop) {
          onFileDrop(validFiles);
        }
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onFileDrop]
  );

  const isDragActive = isOver && canDrop;

  return (
    <div ref={dropRef as any} className="relative w-full h-full">
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

      {/* Pass dndManager to FileTree so it uses our DndProvider */}
      <FileTree {...treeProps} dndManager={manager} />
    </div>
  );
}

/**
 * Wrapper that provides DndProvider context
 *
 * This component creates a single DndProvider that is shared by both:
 * 1. The useDrop hook (for external file drops)
 * 2. react-arborist's Tree (for node reordering)
 *
 * By passing the dndManager to FileTree, react-arborist will use our
 * DndProvider instead of creating its own, preventing the
 * "Cannot have two HTML5 backends" error.
 */
export function FileTreeWithDropZone(props: FileTreeWithDropZoneProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <FileTreeDropZoneInner {...props} />
    </DndProvider>
  );
}
