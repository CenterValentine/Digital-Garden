/**
 * Left Sidebar Header (Client Component)
 *
 * Header with create actions and search toggle.
 * M6: Added search toggle button
 */

"use client";

import { useSearchStore } from "@/state/search-store";
import { useLeftPanelCollapseStore } from "@/state/left-panel-collapse-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { LeftSidebarHeaderActions } from "./LeftSidebarHeaderActions";
import { PanelLeftClose, PanelLeft } from "lucide-react";

interface LeftSidebarHeaderProps {
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateFile: () => void;
  onCreateDocument?: () => void;
  onCreateSpreadsheet?: () => void;
  onCreateCode?: () => void;
  onCreateHtml?: () => void;
  onCreateJson?: () => void;
  onCreateExternal?: () => void;
  // Visualization engine-specific creators
  onCreateVisualizationMermaid?: () => void;
  onCreateVisualizationExcalidraw?: () => void;
  onCreateVisualizationDiagramsNet?: () => void;
  onCreateChat?: () => void;
  // Stub types disabled until implemented:
  // onCreateData?: () => void;
  // onCreateHope?: () => void;
  // onCreateWorkflow?: () => void;
  isCreateDisabled?: boolean;
}

export function LeftSidebarHeader({
  onCreateFolder,
  onCreateNote,
  onCreateFile,
  onCreateDocument,
  onCreateSpreadsheet,
  onCreateCode,
  onCreateHtml,
  onCreateJson,
  onCreateExternal,
  onCreateVisualizationMermaid,
  onCreateVisualizationExcalidraw,
  onCreateVisualizationDiagramsNet,
  onCreateChat,
  isCreateDisabled = false,
}: LeftSidebarHeaderProps) {
  const { isSearchOpen, toggleSearch } = useSearchStore();
  const { mode, toggleMode } = useLeftPanelCollapseStore();
  const { activeView, setActiveView } = useLeftPanelViewStore();

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
      <div className="flex items-center gap-1">
        {/* Files icon button - always visible, active when files view is open */}
        <button
          onClick={() => {
            setActiveView("files");
            if (isSearchOpen) toggleSearch();
          }}
          className={`rounded p-1.5 transition-colors ${
            activeView === "files"
              ? "text-gold-primary hover:bg-white/10"
              : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
          }`}
          title="Files"
          type="button"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </button>

        {/* Search icon button - always visible, active when search view is open */}
        <button
          onClick={() => {
            setActiveView("search");
            if (!isSearchOpen) toggleSearch();
          }}
          className={`rounded p-1.5 transition-colors ${
            activeView === "search"
              ? "text-gold-primary hover:bg-white/10"
              : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
          }`}
          title="Search (Cmd+/)"
          type="button"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>

        {/* Extensions icon button - placeholder for future features */}
        <button
          onClick={() => {
            setActiveView("extensions");
            if (isSearchOpen) toggleSearch();
          }}
          className={`rounded p-1.5 transition-colors ${
            activeView === "extensions"
              ? "text-gold-primary hover:bg-white/10"
              : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
          }`}
          title="Extensions (Coming Soon)"
          type="button"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
            />
          </svg>
        </button>
      </div>

      {/* Right side: Actions + Toggle */}
      <div className="flex items-center gap-1">
        <LeftSidebarHeaderActions
          onCreateFolder={onCreateFolder ? () => onCreateFolder() : undefined}
          onCreateNote={onCreateNote ? () => onCreateNote() : undefined}
          onCreateFile={onCreateFile ? () => onCreateFile() : undefined}
          onCreateDocument={onCreateDocument ? () => onCreateDocument() : undefined}
          onCreateSpreadsheet={onCreateSpreadsheet ? () => onCreateSpreadsheet() : undefined}
          onCreateCode={onCreateCode ? () => onCreateCode() : undefined}
          onCreateHtml={onCreateHtml ? () => onCreateHtml() : undefined}
          onCreateJson={onCreateJson ? () => onCreateJson() : undefined}
          onCreateExternal={onCreateExternal ? () => onCreateExternal() : undefined}
          onCreateVisualizationMermaid={onCreateVisualizationMermaid ? () => onCreateVisualizationMermaid() : undefined}
          onCreateVisualizationExcalidraw={onCreateVisualizationExcalidraw ? () => onCreateVisualizationExcalidraw() : undefined}
          onCreateVisualizationDiagramsNet={onCreateVisualizationDiagramsNet ? () => onCreateVisualizationDiagramsNet() : undefined}
          onCreateChat={onCreateChat ? () => onCreateChat() : undefined}
          disabled={isCreateDisabled}
        />

        {/* Panel collapse toggle */}
        <button
          onClick={toggleMode}
          className="rounded p-1 transition-colors hover:bg-white/10 text-gray-400 hover:text-gold-primary"
          title={mode === "full" ? "Collapse sidebar (Cmd+B)" : "Expand sidebar (Cmd+B)"}
          type="button"
        >
          {mode === "full" ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
