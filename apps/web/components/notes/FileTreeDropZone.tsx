"use client";

import { useDrop } from "react-dnd";
import { NativeTypes } from "react-dnd-html5-backend";
import { validateFileBatch } from "@/lib/media/file-validation";
import { toast } from "sonner";

interface FileTreeDropZoneProps {
  onFileDrop?: (files: File[]) => void;
  children: React.ReactNode;
}

/**
 * Drop Zone Wrapper for File Tree
 *
 * This component MUST be rendered inside react-arborist's Tree component
 * because it uses useDrop, which requires a DndProvider context.
 * react-arborist's Tree creates its own DndProvider internally.
 *
 * By wrapping the tree content with this component, we can intercept
 * external file drops while still allowing tree node drag-and-drop to work.
 */
export function FileTreeDropZone({ onFileDrop, children }: FileTreeDropZoneProps) {
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

      {children}
    </div>
  );
}
