/**
 * Left Sidebar - File Tree Navigation (Client Component)
 *
 * Manages shared state between header actions and content.
 * Supports drag-and-drop file upload via LeftSidebarContent.
 */

"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { LeftSidebarHeader } from "./headers/LeftSidebarHeader";
import { LeftSidebarContent } from "./content/LeftSidebarContent";
import { FileUploadDialog } from "./dialogs/FileUploadDialog";

export function LeftSidebar() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [createTrigger, setCreateTrigger] = useState<{
    type: "folder" | "note";
    timestamp: number;
  } | null>(null);
  const [isCreateDisabled, setIsCreateDisabled] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [fileUploadParentId, setFileUploadParentId] = useState<string | null>(null);
  const [draggedFiles, setDraggedFiles] = useState<File[] | null>(null);

  // Trigger content refresh
  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Callback to receive selection state from content
  const handleSelectionChange = useCallback((hasMultipleSelections: boolean) => {
    setIsCreateDisabled(hasMultipleSelections);
  }, []);

  // Trigger inline creation
  const handleCreateFolder = useCallback(() => {
    setCreateTrigger({ type: "folder", timestamp: Date.now() });
  }, []);

  const handleCreateNote = useCallback(() => {
    setCreateTrigger({ type: "note", timestamp: Date.now() });
  }, []);

  // TODO: Implement handleCreateFile callback
  // This should open the file upload dialog
  // Consider: Should we get the current selected folder as parentId?
  // Or always upload to root (null)?
  const handleCreateFile = useCallback(() => {
    // Your implementation here (5-10 lines)
    // Hint: Set showFileUpload to true and determine fileUploadParentId
    setFileUploadParentId(null); // TODO: Get from current selection?
    setShowFileUpload(true);
  }, []);

  const handleFileUploadSuccess = useCallback((fileId: string) => {
    setShowFileUpload(false);
    setFileUploadParentId(null);
    setDraggedFiles(null);  // Clear dragged files to prevent re-upload
    // Refresh tree to show new file
    setRefreshTrigger((prev) => prev + 1);
    console.log("[LeftSidebar] File uploaded successfully:", fileId);
  }, []);

  const handleFileUploadCancel = useCallback(() => {
    setShowFileUpload(false);
    setFileUploadParentId(null);
    setDraggedFiles(null);
  }, []);

  // Handle file drops from LeftSidebarContent
  const handleFileDrop = useCallback((files: File[]) => {
    setDraggedFiles(files);
    setFileUploadParentId(null); // TODO: Could get from current selection
    setShowFileUpload(true);
  }, []);

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header with create actions */}
        <LeftSidebarHeader
          onCreateFolder={handleCreateFolder}
          onCreateNote={handleCreateNote}
          onCreateFile={handleCreateFile}
          isCreateDisabled={isCreateDisabled}
        />

        {/* Content with file tree and drag-drop handling */}
        <LeftSidebarContent
          refreshTrigger={refreshTrigger}
          createTrigger={createTrigger}
          onSelectionChange={handleSelectionChange}
          onFileDrop={handleFileDrop}
        />
      </div>

      {/* File Upload Dialog - Rendered via Portal to escape panel constraints */}
      {showFileUpload && typeof document !== 'undefined' && createPortal(
        <FileUploadDialog
          parentId={fileUploadParentId}
          onSuccess={handleFileUploadSuccess}
          onCancel={handleFileUploadCancel}
          initialFiles={draggedFiles || undefined}
        />,
        document.body
      )}
    </>
  );
}
