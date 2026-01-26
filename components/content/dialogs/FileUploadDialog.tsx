/**
 * File Upload Dialog
 *
 * Handles file uploads with progress tracking
 * Uses two-phase upload flow (initiate → upload → finalize)
 *
 * Stubbed alternatives: URL import, Google Drive, Dropbox
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design-system";
import { Upload, Link, Cloud, Folder } from "lucide-react";
import { useUploadSettingsStore } from "@/state/upload-settings-store";

interface Folder {
  id: string;
  title: string;
  parentId: string | null;
}

interface FileUploadDialogProps {
  parentId: string | null;
  onSuccess: (fileId: string) => void;
  onCancel: () => void;
  initialFiles?: File[];
}

type UploadMethod = "file" | "url" | "cloud";

interface FileUploadStatus {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
  slug?: string;
}

export function FileUploadDialog({ parentId, onSuccess, onCancel, initialFiles }: FileUploadDialogProps) {
  const glass1 = getSurfaceStyles("glass-1");
  const { uploadMode } = useUploadSettingsStore();
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>("file");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<"r2" | "s3" | "vercel">("r2");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileStatuses, setFileStatuses] = useState<FileUploadStatus[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(parentId);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileRenames, setFileRenames] = useState<Map<string, string>>(new Map());
  const [editingFileIndex, setEditingFileIndex] = useState<number | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  // Track rename map during upload (persists through upload phase)
  const [uploadRenameMap, setUploadRenameMap] = useState<Map<string, string>>(new Map());
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Load folder tree on mount
  useEffect(() => {
    const loadFolders = async () => {
      setLoadingFolders(true);
      try {
        const response = await fetch('/api/content/content/tree');
        if (response.ok) {
          const result = await response.json();
          const treeItems = result.data?.tree || result.tree || result;

          // Recursively flatten tree to get all folders at any depth
          interface TreeNode {
            id: string;
            title: string;
            parentId: string | null;
            contentType?: string;
            note?: unknown;
            file?: unknown;
            html?: unknown;
            code?: unknown;
            children?: TreeNode[];
          }

          const flattenFolders = (nodes: TreeNode[], depth = 0): Folder[] => {
            const folders: Folder[] = [];

            for (const node of nodes) {
              // Check if it's a folder (contentType === 'folder' or no payload)
              const isFolder = node.contentType === 'folder' ||
                (!node.note && !node.file && !node.html && !node.code);

              if (isFolder) {
                folders.push({
                  id: node.id,
                  title: '  '.repeat(depth) + node.title, // Indent based on depth
                  parentId: node.parentId,
                });
              }

              // Recursively process children
              if (node.children && node.children.length > 0) {
                folders.push(...flattenFolders(node.children, depth + 1));
              }
            }

            return folders;
          };

          const folderItems = Array.isArray(treeItems) ? flattenFolders(treeItems) : [];
          setFolders(folderItems);
        }
      } catch (error) {
        console.error('Failed to load folders:', error);
      } finally {
        setLoadingFolders(false);
      }
    };
    loadFolders();
  }, []);

  // Handle initialFiles based on upload mode
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      if (uploadMode === 'automatic') {
        // Automatic mode: start upload immediately
        handleMultiFileUpload(initialFiles);
      } else {
        // Manual mode: populate selected files for review
        setSelectedFiles(initialFiles);
      }
    }
  }, [initialFiles, uploadMode]);

  // Handle Escape key to close dialog
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isUploading, onCancel]);

  // OCR toggle - DISABLED for now due to pnpm + Tesseract.js worker path issues
  // TODO: Re-enable after configuring webpack to copy Tesseract worker files
  // See: https://github.com/naptha/tesseract.js/issues/895
  const enableOCR = false;

  /**
   * Handle single file upload (used by multi-file handler)
   * Uses simple server-side upload to avoid CORS issues
   *
   * TODO: Switch to 2-phase direct upload once CORS is configured on R2 bucket
   */
  const uploadSingleFile = async (file: File, fileIndex: number, customName?: string): Promise<string> => {
    // Update status to uploading
    setFileStatuses((prev) =>
      prev.map((status, idx) =>
        idx === fileIndex ? { ...status, status: "uploading" as const, progress: 0 } : status
      )
    );

    try {
      // Create a new File object with custom name if provided
      const fileToUpload = customName && customName !== file.name
        ? new File([file], customName, { type: file.type })
        : file;

      // Use simple server-side upload (no CORS issues)
      const formData = new FormData();
      formData.append("file", fileToUpload);
      if (selectedFolderId) formData.append("parentId", selectedFolderId);
      formData.append("provider", selectedProvider);
      formData.append("enableOCR", enableOCR.toString());

      // Update progress
      setFileStatuses((prev) =>
        prev.map((status, idx) =>
          idx === fileIndex ? { ...status, progress: 20 } : status
        )
      );

      const response = await fetch("/api/content/content/upload/simple", {
        method: "POST",
        body: formData,
      });

      setFileStatuses((prev) =>
        prev.map((status, idx) =>
          idx === fileIndex ? { ...status, progress: 80 } : status
        )
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Upload failed");
      }

      const { data } = await response.json();

      // Check if it's a duplicate or had slug collision
      if (data.isDuplicate) {
        // Show toast notification for duplicate file (auto-renamed with (1), (2), etc.)
        toast.info("Duplicate file saved", {
          description: `Saved as "${data.fileName}"`,
        });
      } else if (data.retriedSlug) {
        // Show toast notification for slug collision retry (same name)
        toast.info("File name adjusted", {
          description: `A similar file name exists. Saved as "${data.slug}"`,
        });
      }

      // Update status to success
      setFileStatuses((prev) =>
        prev.map((status, idx) =>
          idx === fileIndex
            ? { ...status, status: "success" as const, progress: 100, slug: data.slug }
            : status
        )
      );

      console.log("[FileUploadDialog] Upload success:", data);

      return data.slug || "";
    } catch (err) {
      console.error("[FileUploadDialog] Upload error:", err);
      const errorMessage = err instanceof Error ? err.message : "Upload failed";

      // Update status to error
      setFileStatuses((prev) =>
        prev.map((status, idx) =>
          idx === fileIndex
            ? { ...status, status: "error" as const, error: errorMessage }
            : status
        )
      );

      throw err;
    }
  };

  /**
   * Handle multiple file uploads (sequential processing)
   */
  const handleMultiFileUpload = async (files: File[], renamedFiles?: Map<File, string>) => {
    setIsUploading(true);
    setError(null);

    // Clear any previous upload rename map if this is a new automatic upload
    if (!renamedFiles) {
      setUploadRenameMap(new Map());
    }

    // Initialize file statuses
    const initialStatuses: FileUploadStatus[] = files.map((file) => ({
      file,
      status: "pending" as const,
      progress: 0,
    }));
    setFileStatuses(initialStatuses);

    const results: { slug: string; success: boolean }[] = [];

    // Upload files sequentially
    for (let i = 0; i < files.length; i++) {
      try {
        const customName = renamedFiles?.get(files[i]);
        const slug = await uploadSingleFile(files[i], i, customName);
        results.push({ slug, success: true });

        // Update overall progress
        setUploadProgress(((i + 1) / files.length) * 100);
      } catch (err) {
        results.push({ slug: "", success: false });
        // Continue with next file even if one fails
      }
    }

    setIsUploading(false);

    // Count successes
    const successCount = results.filter((r) => r.success).length;
    const totalCount = files.length;

    if (successCount === 0) {
      setError(`All ${totalCount} file(s) failed to upload`);
    } else if (successCount < totalCount) {
      setError(`${successCount}/${totalCount} file(s) uploaded successfully`);
      // Still call onSuccess to refresh tree
      setTimeout(() => {
        onSuccess("");
      }, 2000);
    } else {
      // All succeeded - close dialog after brief delay
      setTimeout(() => {
        onSuccess("");
      }, 1000);
    }
  };

  /**
   * Handle file input change (supports multiple files)
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      if (uploadMode === 'automatic') {
        handleMultiFileUpload(files);
      } else {
        // Manual mode: populate selected files for review
        setSelectedFiles(files);
      }
    }
  };

  /**
   * Start upload with renamed files (manual mode)
   */
  const handleStartUpload = () => {
    if (selectedFiles.length === 0) return;

    // Build rename map from fileRenames state
    const renameMap = new Map<File, string>();
    const persistentRenameMap = new Map<string, string>(); // filename → renamed filename

    selectedFiles.forEach((file, index) => {
      const customName = fileRenames.get(`${file.name}-${index}`);
      if (customName && customName !== file.name) {
        renameMap.set(file, customName);
        // Store for display during upload (original → new name)
        persistentRenameMap.set(file.name, customName);
      }
    });

    // Store rename info for upload progress display
    setUploadRenameMap(persistentRenameMap);

    handleMultiFileUpload(selectedFiles, renameMap);
    setSelectedFiles([]);
    setFileRenames(new Map());
  };

  /**
   * Handle clicking on filename to edit (manual mode)
   */
  const handleFileNameClick = (index: number) => {
    setEditingFileIndex(index);
  };

  /**
   * Handle filename change (manual mode)
   */
  const handleFileNameChange = (index: number, newName: string) => {
    const file = selectedFiles[index];
    const key = `${file.name}-${index}`;
    setFileRenames(prev => {
      const updated = new Map(prev);
      updated.set(key, newName);
      return updated;
    });
  };

  /**
   * Finish editing filename (manual mode)
   */
  const handleFileNameBlur = () => {
    setEditingFileIndex(null);
  };

  /**
   * Get display name for file (with rename if exists)
   */
  const getDisplayName = (file: File, index: number): string => {
    const key = `${file.name}-${index}`;
    return fileRenames.get(key) || file.name;
  };

  /**
   * Focus edit input when editing starts
   */
  useEffect(() => {
    if (editingFileIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      // Select filename without extension
      const value = editInputRef.current.value;
      const lastDotIndex = value.lastIndexOf(".");
      if (lastDotIndex > 0) {
        editInputRef.current.setSelectionRange(0, lastDotIndex);
      } else {
        editInputRef.current.select();
      }
    }
  }, [editingFileIndex]);

  /**
   * Stubbed: Upload from URL
   * TODO: Implement in future milestone
   */
  const handleUrlUpload = async (url: string) => {
    setError("URL upload not yet implemented. Coming soon!");
  };

  /**
   * Stubbed: Cloud import (Google Drive, Dropbox, etc.)
   * TODO: Implement in future milestone
   */
  const handleCloudImport = async (provider: string) => {
    setError(`${provider} import not yet implemented. Coming soon!`);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        // Close dialog when clicking backdrop (not when uploading)
        if (e.target === e.currentTarget && !isUploading) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 border border-white/10 rounded-lg relative"
        style={{
          background: glass1.background,
          backdropFilter: glass1.backdropFilter,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button (X) */}
        <button
          onClick={onCancel}
          disabled={isUploading}
          className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Close"
        >
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
            className="text-white/70 hover:text-white"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold mb-4 text-white">Upload File</h2>

        {/* Folder Path Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Upload to folder:
          </label>
          <div className="relative">
            <select
              value={selectedFolderId || ""}
              onChange={(e) => setSelectedFolderId(e.target.value || null)}
              disabled={isUploading || loadingFolders}
              className="w-full px-4 py-2 pl-10 bg-white/5 border border-white/10 rounded-lg text-white text-sm appearance-none cursor-pointer hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Root (no folder)</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id} className="bg-gray-800">
                  {folder.title}
                </option>
              ))}
            </select>
            <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Upload Method Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/10">
          <button
            onClick={() => setUploadMethod("file")}
            className={`px-4 py-2 text-sm transition-colors ${
              uploadMethod === "file"
                ? "border-b-2 border-primary text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Upload className="h-4 w-4 inline mr-2" />
            From Device
          </button>
          <button
            onClick={() => setUploadMethod("url")}
            className={`px-4 py-2 text-sm transition-colors ${
              uploadMethod === "url"
                ? "border-b-2 border-primary text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Link className="h-4 w-4 inline mr-2" />
            From URL
          </button>
          <button
            onClick={() => setUploadMethod("cloud")}
            className={`px-4 py-2 text-sm transition-colors ${
              uploadMethod === "cloud"
                ? "border-b-2 border-primary text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Cloud className="h-4 w-4 inline mr-2" />
            Cloud Import
          </button>
        </div>

        {/* Upload Method Content */}
        {uploadMethod === "file" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOver(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Only reset if we're actually leaving the div (not just entering a child)
                if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDraggingOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOver(false);
                if (isUploading) return;

                const files = Array.from(e.dataTransfer.files || []);
                if (files.length > 0) {
                  if (uploadMode === 'automatic') {
                    handleMultiFileUpload(files);
                  } else {
                    // Manual mode: populate selected files for review
                    setSelectedFiles(files);
                  }
                }
              }}
              className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDraggingOver
                  ? 'border-primary bg-primary/10'
                  : 'border-white/20 hover:border-primary/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isUploading}
              />
              <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400 pointer-events-none" />
              <p className="text-sm text-gray-300 mb-2 pointer-events-none">
                {isUploading ? "Uploading..." : "Click to select files"}
              </p>
              <p className="text-xs text-gray-500 pointer-events-none">
                Select one or multiple files (PDF, TXT, MD, JSON, Images, etc.)
              </p>
            </div>

            {/* Manual Mode: Selected Files with Rename (Before Upload) */}
            {uploadMode === 'manual' && selectedFiles.length > 0 && fileStatuses.length === 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-300">
                    {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                  </p>
                  <button
                    onClick={handleStartUpload}
                    className="px-4 py-2 bg-white/5 backdrop-blur-md border border-white/20 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedFiles.map((file, index) => {
                    const displayName = getDisplayName(file, index);
                    const isEditing = editingFileIndex === index;

                    return (
                      <div
                        key={index}
                        className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* File icon */}
                          <div className="flex-shrink-0 w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center">
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
                              className="text-blue-400"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          </div>

                          {/* File name (editable) */}
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <input
                                ref={editInputRef}
                                type="text"
                                value={displayName}
                                onChange={(e) => handleFileNameChange(index, e.target.value)}
                                onBlur={handleFileNameBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleFileNameBlur();
                                  } else if (e.key === 'Escape') {
                                    // Revert to original name
                                    handleFileNameChange(index, file.name);
                                    handleFileNameBlur();
                                  }
                                }}
                                className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ) : (
                              <div
                                className="text-sm font-medium text-white truncate cursor-pointer hover:text-blue-400 hover:underline transition-colors"
                                onClick={() => handleFileNameClick(index)}
                                title="Click to rename"
                              >
                                {displayName}
                              </div>
                            )}
                            <div className="text-xs text-white/50 mt-0.5">
                              {(file.size / 1024).toFixed(1)} KB
                              {displayName !== file.name && (
                                <span className="ml-2 text-yellow-400">
                                  (renamed from: {file.name})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Edit button */}
                          {!isEditing && (
                            <button
                              onClick={() => handleFileNameClick(index)}
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
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-white/50 text-center">
                  Click filename to rename • Enter to confirm • Esc to cancel
                </p>
              </div>
            )}

            {/* File List with Individual Progress */}
            {fileStatuses.length > 0 && (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {fileStatuses.map((fileStatus, index) => {
                  const originalName = fileStatus.file.name;
                  const renamedTo = uploadRenameMap.get(originalName);
                  const displayName = renamedTo || originalName;

                  return (
                    <div
                      key={index}
                      className="p-3 bg-white/5 border border-white/10 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {fileStatus.status === "pending" && (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-400" />
                          )}
                          {fileStatus.status === "uploading" && (
                            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          )}
                          {fileStatus.status === "success" && (
                            <svg
                              className="w-4 h-4 text-green-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                          {fileStatus.status === "error" && (
                            <svg
                              className="w-4 h-4 text-red-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-white truncate block">
                              {displayName}
                            </span>
                            {renamedTo && (
                              <span className="text-xs text-yellow-400 block truncate">
                                (originally: {originalName})
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 ml-2">
                          {(fileStatus.file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>

                      {/* Progress bar for this file */}
                      {fileStatus.status === "uploading" && (
                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${fileStatus.progress}%` }}
                          />
                        </div>
                      )}

                      {/* Error message */}
                      {fileStatus.status === "error" && fileStatus.error && (
                        <p className="text-xs text-red-400 mt-1">{fileStatus.error}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Overall Progress Bar */}
            {isUploading && fileStatuses.length > 1 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>
                    Overall Progress: {fileStatuses.filter((f) => f.status === "success").length}/
                    {fileStatuses.length} files
                  </span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {uploadMethod === "url" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400 mb-4">
              Import a file from a URL (coming soon)
            </p>
            <input
              type="text"
              placeholder="https://example.com/document.pdf"
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500"
              disabled
            />
            <button
              onClick={() => handleUrlUpload("")}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg cursor-not-allowed opacity-50"
              disabled
            >
              Import from URL (Coming Soon)
            </button>
          </div>
        )}

        {uploadMethod === "cloud" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400 mb-4">
              Import from cloud storage (coming soon)
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleCloudImport("Google Drive")}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-left cursor-not-allowed opacity-50"
                disabled
              >
                <Cloud className="h-4 w-4 inline mr-2" />
                Google Drive (Coming Soon)
              </button>
              <button
                onClick={() => handleCloudImport("Dropbox")}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-left cursor-not-allowed opacity-50"
                disabled
              >
                <Cloud className="h-4 w-4 inline mr-2" />
                Dropbox (Coming Soon)
              </button>
              <button
                onClick={() => handleCloudImport("OneDrive")}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-left cursor-not-allowed opacity-50"
                disabled
              >
                <Cloud className="h-4 w-4 inline mr-2" />
                OneDrive (Coming Soon)
              </button>
            </div>
          </div>
        )}

        {/* Storage Provider Selector */}
        <div className="mt-6 pt-4 border-t border-white/10">
          {/* Storage Provider Icons */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-xs text-gray-500">Storage:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedProvider("r2")}
                disabled={isUploading}
                title="Cloudflare R2"
                className={`w-8 h-8 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedProvider === "r2"
                    ? "border-primary bg-primary/20 text-white"
                    : "border-white/10 text-gray-400 hover:bg-white/5 hover:border-white/20"
                }`}
              >
                <svg
                  className="w-4 h-4 mx-auto"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  <path d="M8 12h8M12 8v8" strokeWidth="1.5" />
                </svg>
              </button>
              <button
                onClick={() => setSelectedProvider("s3")}
                disabled={isUploading}
                title="AWS S3"
                className={`w-8 h-8 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedProvider === "s3"
                    ? "border-primary bg-primary/20 text-white"
                    : "border-white/10 text-gray-400 hover:bg-white/5 hover:border-white/20"
                }`}
              >
                <svg
                  className="w-4 h-4 mx-auto"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 6L9 17l-5-5" />
                  <path d="M3 12h4M19 12h2" strokeWidth="1.5" />
                </svg>
              </button>
              <button
                onClick={() => setSelectedProvider("vercel")}
                disabled={isUploading}
                title="Vercel Blob"
                className={`w-8 h-8 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedProvider === "vercel"
                    ? "border-primary bg-primary/20 text-white"
                    : "border-white/10 text-gray-400 hover:bg-white/5 hover:border-white/20"
                }`}
              >
                <svg
                  className="w-4 h-4 mx-auto"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2L2 19h20L12 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

      </div>
    </div>
  );
}
