/**
 * Upload Confirmation Dialog
 *
 * Shows list of files to be uploaded in manual mode.
 * Allows users to rename files inline before confirming upload.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/glass/dialog";
import { Button } from "@/components/ui/glass/button";

interface FileToUpload {
  file: File;
  displayName: string;
  isEditing: boolean;
}

interface UploadConfirmationDialogProps {
  files: File[];
  onConfirm: (renamedFiles: { file: File; newName: string }[]) => void;
  onCancel: () => void;
}

export function UploadConfirmationDialog({
  files,
  onConfirm,
  onCancel,
}: UploadConfirmationDialogProps) {
  const [fileList, setFileList] = useState<FileToUpload[]>(() =>
    files.map((file) => ({
      file,
      displayName: file.name,
      isEditing: false,
    }))
  );

  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Focus input when editing starts
  useEffect(() => {
    const editingIndex = fileList.findIndex((f) => f.isEditing);
    if (editingIndex !== -1) {
      const input = inputRefs.current.get(editingIndex);
      if (input) {
        input.focus();
        // Select filename without extension
        const lastDotIndex = input.value.lastIndexOf(".");
        if (lastDotIndex > 0) {
          input.setSelectionRange(0, lastDotIndex);
        } else {
          input.select();
        }
      }
    }
  }, [fileList]);

  const handleStartEdit = (index: number) => {
    setFileList((prev) =>
      prev.map((item, i) => ({
        ...item,
        isEditing: i === index,
      }))
    );
  };

  const handleFinishEdit = (index: number, newName: string) => {
    // Validate name is not empty
    const trimmedName = newName.trim();
    if (!trimmedName) {
      // Revert to original name
      setFileList((prev) =>
        prev.map((item, i) =>
          i === index
            ? { ...item, displayName: item.file.name, isEditing: false }
            : item
        )
      );
      return;
    }

    setFileList((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, displayName: trimmedName, isEditing: false } : item
      )
    );
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    currentValue: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFinishEdit(index, currentValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Revert to original name
      setFileList((prev) =>
        prev.map((item, i) =>
          i === index
            ? { ...item, displayName: item.file.name, isEditing: false }
            : item
        )
      );
    }
  };

  const handleConfirm = () => {
    const renamedFiles = fileList.map((item) => ({
      file: item.file,
      newName: item.displayName,
    }));
    onConfirm(renamedFiles);
  };

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Confirm Upload - {files.length} file{files.length !== 1 ? "s" : ""} ({formatSize(totalSize)})
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-4">
          {fileList.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            >
              {/* File icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-blue-400"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>

              {/* File name (editable) */}
              <div className="flex-1 min-w-0">
                {item.isEditing ? (
                  <input
                    ref={(el) => {
                      if (el) inputRefs.current.set(index, el);
                    }}
                    type="text"
                    value={item.displayName}
                    onChange={(e) => {
                      setFileList((prev) =>
                        prev.map((f, i) =>
                          i === index ? { ...f, displayName: e.target.value } : f
                        )
                      );
                    }}
                    onBlur={(e) => handleFinishEdit(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, index, item.displayName)}
                    className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div
                    className="text-sm font-medium truncate cursor-pointer hover:text-blue-400 hover:underline transition-colors"
                    onClick={() => handleStartEdit(index)}
                    onDoubleClick={() => handleStartEdit(index)}
                    title="Click to rename"
                  >
                    {item.displayName}
                  </div>
                )}
                <div className="text-xs text-white/50 mt-0.5">
                  {formatSize(item.file.size)}
                  {item.displayName !== item.file.name && (
                    <span className="ml-2 text-yellow-400">
                      (renamed from: {item.file.name})
                    </span>
                  )}
                </div>
              </div>

              {/* Edit button */}
              {!item.isEditing && (
                <button
                  onClick={() => handleStartEdit(index)}
                  className="flex-shrink-0 p-2 hover:bg-white/10 rounded transition-colors"
                  title="Rename file"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-white/60"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <div className="text-xs text-white/50">
            Click filename to rename • Enter to confirm • Esc to cancel
          </div>
          <div className="flex gap-2">
            <Button variant="glass" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="glass" onClick={handleConfirm}>
              Upload {files.length} file{files.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
