/**
 * Left Sidebar - File Tree Navigation (Client Component)
 *
 * Manages shared state between header actions and content.
 * Supports drag-and-drop file upload via LeftSidebarContent.
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { LeftSidebarHeader } from "./headers/LeftSidebarHeader";
import { LeftSidebarContent } from "./content/LeftSidebarContent";
import { LeftSidebarCollapsed } from "./LeftSidebarCollapsed";
import { LeftSidebarExtensions } from "./content/LeftSidebarExtensions";
import { FileUploadDialog } from "./dialogs/FileUploadDialog";
import { useLeftPanelCollapseStore } from "@/stores/left-panel-collapse-store";
import { useLeftPanelViewStore } from "@/stores/left-panel-view-store";

export function LeftSidebar() {
  const { mode } = useLeftPanelCollapseStore();
  const { activeView } = useLeftPanelViewStore();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [createTrigger, setCreateTrigger] = useState<{
    type: "folder" | "note" | "docx" | "xlsx";
    timestamp: number;
  } | null>(null);
  const [isCreateDisabled, setIsCreateDisabled] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [fileUploadParentId, setFileUploadParentId] = useState<string | null>(null);
  const [draggedFiles, setDraggedFiles] = useState<File[] | null>(null);
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);

  // Check if user has Google authentication
  useEffect(() => {
    async function checkGoogleAuth() {
      try {
        const response = await fetch("/api/auth/provider");
        const data = await response.json();
        setHasGoogleAuth(data.success && data.data.hasGoogleAuth);
      } catch (err) {
        console.error("[LeftSidebar] Failed to check Google auth:", err);
        setHasGoogleAuth(false);
      }
    }
    checkGoogleAuth();
  }, []);

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

  const handleCreateFile = useCallback(() => {
    setFileUploadParentId(null); // TODO: Get from current selection?
    setShowFileUpload(true);
  }, []);

  // Trigger inline document creation (same pattern as folders/notes)
  const handleCreateDocument = useCallback(() => {
    setCreateTrigger({ type: "docx", timestamp: Date.now() });
  }, []);

  const handleCreateSpreadsheet = useCallback(() => {
    setCreateTrigger({ type: "xlsx", timestamp: Date.now() });
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

  // If panel is in hidden mode, show only the collapsed icon bar
  if (mode === "hidden") {
    return <LeftSidebarCollapsed />;
  }

  // Full mode: show complete sidebar with header and content
  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header with create actions */}
        <LeftSidebarHeader
          onCreateFolder={handleCreateFolder}
          onCreateNote={handleCreateNote}
          onCreateFile={handleCreateFile}
          onCreateDocument={hasGoogleAuth ? handleCreateDocument : undefined}
          onCreateSpreadsheet={hasGoogleAuth ? handleCreateSpreadsheet : undefined}
          isCreateDisabled={isCreateDisabled}
        />

        {/* Content area - conditionally render based on active view */}
        {activeView === "files" && (
          <LeftSidebarContent
            refreshTrigger={refreshTrigger}
            createTrigger={createTrigger}
            onSelectionChange={handleSelectionChange}
            onFileDrop={handleFileDrop}
          />
        )}

        {activeView === "extensions" && <LeftSidebarExtensions />}

        {/* Search view is handled by LeftSidebarContent with isSearchOpen state */}
        {activeView === "search" && (
          <LeftSidebarContent
            refreshTrigger={refreshTrigger}
            createTrigger={createTrigger}
            onSelectionChange={handleSelectionChange}
            onFileDrop={handleFileDrop}
          />
        )}
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
