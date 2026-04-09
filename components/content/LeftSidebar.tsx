/**
 * Left Sidebar - File Tree Navigation (Client Component)
 *
 * Manages shared state between header actions and content.
 * Supports drag-and-drop file upload via LeftSidebarContent.
 */

"use client";

import { createElement, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { LeftSidebarHeader } from "./headers/LeftSidebarHeader";
import { LeftSidebarContent } from "./content/LeftSidebarContent";
import { LeftSidebarCollapsed } from "./LeftSidebarCollapsed";
import { LeftSidebarExtensions } from "./content/LeftSidebarExtensions";
import { PeoplePanel } from "./people/PeoplePanel";
import { PeopleMountPickerDialog } from "./people/PeopleMountPickerDialog";
import { FileUploadDialog } from "./dialogs/FileUploadDialog";
import { useLeftPanelCollapseStore } from "@/state/left-panel-collapse-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { useExtensionLeftSidebarPanel } from "@/lib/extensions/client-registry";

export function LeftSidebar() {
  const { mode } = useLeftPanelCollapseStore();
  const { activeView } = useLeftPanelViewStore();
  const ExtensionPanel = useExtensionLeftSidebarPanel(activeView);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [createTrigger, setCreateTrigger] = useState<{
    type: "folder" | "note" | "docx" | "xlsx" | "json" | "code" | "html" | "external" | "chat" | "visualization" | "data" | "hope" | "workflow";
    timestamp: number;
    engine?: "diagrams-net" | "excalidraw" | "mermaid"; // For visualization type
  } | null>(null);
  const [isCreateDisabled, setIsCreateDisabled] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [fileUploadParentId, setFileUploadParentId] = useState<string | null>(null);
  const [draggedFiles, setDraggedFiles] = useState<File[] | null>(null);
  const [peopleMountParentId, setPeopleMountParentId] = useState<string | null | undefined>(undefined);
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

  // Listen for cross-component tree refresh events (e.g. from ChatPanel save)
  useEffect(() => {
    const handler = () => setRefreshTrigger((prev) => prev + 1);
    window.addEventListener("dg:tree-refresh", handler);
    return () => window.removeEventListener("dg:tree-refresh", handler);
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

  const handleCreateJson = useCallback(() => {
    setCreateTrigger({ type: "json", timestamp: Date.now() });
  }, []);

  // Phase 2: New content type handlers (Active types only)
  const handleCreateCode = useCallback(() => {
    setCreateTrigger({ type: "code", timestamp: Date.now() });
  }, []);

  const handleCreateHtml = useCallback(() => {
    setCreateTrigger({ type: "html", timestamp: Date.now() });
  }, []);

  const handleCreateExternal = useCallback(() => {
    setCreateTrigger({ type: "external", timestamp: Date.now() });
  }, []);

  // Phase 2: Visualization engine-specific handlers
  const handleCreateVisualizationMermaid = useCallback(() => {
    setCreateTrigger({ type: "visualization", engine: "mermaid", timestamp: Date.now() });
  }, []);

  const handleCreateVisualizationExcalidraw = useCallback(() => {
    setCreateTrigger({ type: "visualization", engine: "excalidraw", timestamp: Date.now() });
  }, []);

  const handleCreateVisualizationDiagramsNet = useCallback(() => {
    setCreateTrigger({ type: "visualization", engine: "diagrams-net", timestamp: Date.now() });
  }, []);

  // Chat creation — now active (Sprint 34)
  const handleCreateChat = useCallback(() => {
    setCreateTrigger({ type: "chat", timestamp: Date.now() });
  }, []);

  const handleAddPeopleTarget = useCallback((parentId: string | null = null) => {
    setPeopleMountParentId(parentId);
  }, []);

  const handleCreatePeopleNote = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dg:people-create-content", { detail: { type: "note" } }));
  }, []);

  const handleCreatePeopleFolder = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dg:people-create-content", { detail: { type: "folder" } }));
  }, []);

  const handleCreatePeopleContact = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dg:people-open-create-person"));
  }, []);

  const handleCreatePeopleUpload = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dg:people-open-upload"));
  }, []);

  const handleCreatePeopleDocument = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dg:people-create-document", {
      detail: { fileType: "docx" },
    }));
  }, []);

  const handleCreatePeopleSpreadsheet = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dg:people-create-document", {
      detail: { fileType: "xlsx" },
    }));
  }, []);

  const handleCreatePeopleJson = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dg:people-create-document", {
      detail: { fileType: "json" },
    }));
  }, []);

  // const handleCreateData = useCallback(() => {
  //   setCreateTrigger({ type: "data", timestamp: Date.now() });
  // }, []);

  // const handleCreateHope = useCallback(() => {
  //   setCreateTrigger({ type: "hope", timestamp: Date.now() });
  // }, []);

  // const handleCreateWorkflow = useCallback(() => {
  //   setCreateTrigger({ type: "workflow", timestamp: Date.now() });
  // }, []);

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
          onCreateFolder={activeView === "people" ? handleCreatePeopleFolder : handleCreateFolder}
          onCreateNote={activeView === "people" ? handleCreatePeopleNote : handleCreateNote}
          onCreateFile={activeView === "people" ? handleCreatePeopleUpload : handleCreateFile}
          onCreateDocument={activeView === "people" ? handleCreatePeopleDocument : hasGoogleAuth ? handleCreateDocument : undefined}
          onCreateSpreadsheet={activeView === "people" ? handleCreatePeopleSpreadsheet : hasGoogleAuth ? handleCreateSpreadsheet : undefined}
          onCreateCode={activeView === "people" ? undefined : handleCreateCode}
          onCreateHtml={activeView === "people" ? undefined : handleCreateHtml}
          onCreateJson={activeView === "people" ? handleCreatePeopleJson : handleCreateJson}
          onCreateExternal={activeView === "people" ? undefined : handleCreateExternal}
          onCreateVisualizationMermaid={activeView === "people" ? undefined : handleCreateVisualizationMermaid}
          onCreateVisualizationExcalidraw={activeView === "people" ? undefined : handleCreateVisualizationExcalidraw}
          onCreateVisualizationDiagramsNet={activeView === "people" ? undefined : handleCreateVisualizationDiagramsNet}
          onCreateChat={activeView === "people" ? undefined : handleCreateChat}
          onAddPeopleTarget={activeView === "people" ? handleCreatePeopleContact : () => handleAddPeopleTarget(null)}
          isCreateDisabled={activeView === "people" ? false : isCreateDisabled}
        />

        {/* Content area - conditionally render based on active view */}
        {activeView === "files" && (
          <LeftSidebarContent
            refreshTrigger={refreshTrigger}
            createTrigger={createTrigger}
            onSelectionChange={handleSelectionChange}
            onFileDrop={handleFileDrop}
            onAddPeopleTarget={handleAddPeopleTarget}
          />
        )}

        {activeView === "extensions" && <LeftSidebarExtensions />}

        {activeView === "people" && <PeoplePanel />}
        {ExtensionPanel && createElement(ExtensionPanel)}

        {/* Search view is handled by LeftSidebarContent with isSearchOpen state */}
        {activeView === "search" && (
          <LeftSidebarContent
            refreshTrigger={refreshTrigger}
            createTrigger={createTrigger}
            onSelectionChange={handleSelectionChange}
            onFileDrop={handleFileDrop}
            onAddPeopleTarget={handleAddPeopleTarget}
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

      {peopleMountParentId !== undefined && typeof document !== "undefined" && createPortal(
        <PeopleMountPickerDialog
          parentId={peopleMountParentId}
          onClose={() => setPeopleMountParentId(undefined)}
          onMounted={() => setRefreshTrigger((prev) => prev + 1)}
        />,
        document.body
      )}
    </>
  );
}
