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
import { renderExtensionIcon } from "@/lib/extensions";
import { useExtensionHeaderNavItems } from "@/lib/extensions/client-registry";

interface LeftSidebarHeaderProps {
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateFile?: () => void;
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
  onCreateAiImage?: () => void;
  onAddPeopleTarget?: () => void;
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
  onCreateAiImage,
  onAddPeopleTarget,
  isCreateDisabled = false,
}: LeftSidebarHeaderProps) {
  const { isSearchOpen, toggleSearch } = useSearchStore();
  const { mode, toggleMode } = useLeftPanelCollapseStore();
  const { activeView, setActiveView } = useLeftPanelViewStore();
  const extensionNavItems = useExtensionHeaderNavItems();

  // Daily Notes is type "action" with id "open-periodic-note", Publishing is type "view" with view "publishing-view"
  const subAffordanceIds = new Set(["open-periodic-note", "publishing-view"]);

  // True whenever the user is anywhere in the files section (files, search, or a sub-affordance view).
  // Drives: container background, folder tab active state, and sub-row visibility — all from one source.
  const showFilesSection =
    activeView === "files" ||
    activeView === "search" ||
    subAffordanceIds.has(activeView);

  const headerExtensionItems = extensionNavItems.filter(({ item }) => {
    if (item.type === "action") return !subAffordanceIds.has(item.id);
    if (item.type === "view") return !subAffordanceIds.has(item.view ?? "");
    return true;
  });

  const subAffordanceItems = extensionNavItems.filter(({ item }) => {
    if (item.type === "action") return subAffordanceIds.has(item.id);
    if (item.type === "view") return subAffordanceIds.has(item.view ?? "");
    return false;
  });

  // Shared tab styles for the main row
  const tabActive = "bg-gray-100 dark:bg-gray-800 text-gold-primary";
  const tabInactive = "bg-white dark:bg-white/10 text-gray-500 dark:text-gray-300 hover:text-gold-primary";

  // Shared pill styles for the sub-affordance row
  const subActive = "bg-white dark:bg-white/20 text-gold-primary";
  const subInactive = "text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/10 hover:text-gold-primary";

  return (
    <div className="flex flex-col shrink-0 bg-white dark:bg-transparent">
      {/* Main header row */}
      <div className="flex h-12 shrink-0 items-end pb-0 px-2 gap-1">
        <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">

          {/* Files tab — stretches full row height when active so its gray fills the gap to the sub-row */}
          <button
            onClick={() => {
              setActiveView("files");
              if (isSearchOpen) toggleSearch();
            }}
            className={`flex items-center justify-center p-1.5 transition-colors ${
              showFilesSection
                ? `self-stretch rounded-t-md ${tabActive}`
                : `rounded-md ${tabInactive}`
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

          {/* Extensions tab */}
          <button
            onClick={() => {
              setActiveView("extensions");
              if (isSearchOpen) toggleSearch();
            }}
            className={`rounded-md p-1.5 transition-colors ${
              activeView === "extensions" ? tabActive : tabInactive
            }`}
            title="Extensions"
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

          {/* Extension-registered top-level tabs (people, calendar, etc.) */}
          {headerExtensionItems.map(({ item, ActionComponent }) => {
            if (item.type === "action") {
              return ActionComponent ? (
                <ActionComponent
                  key={item.id}
                  item={item}
                  className={`rounded-md p-1.5 transition-colors ${tabInactive}`}
                  iconClassName="h-5 w-5"
                />
              ) : null;
            }

            const isActive = activeView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => {
                  setActiveView(item.view);
                  if (isSearchOpen) toggleSearch();
                }}
                className={`rounded-md p-1.5 transition-colors ${isActive ? tabActive : tabInactive}`}
                title={item.title ?? item.label}
                type="button"
              >
                {renderExtensionIcon(item.iconName, "h-5 w-5")}
              </button>
            );
          })}
        </div>

        {/* Panel collapse toggle */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={toggleMode}
            className={`rounded p-1 transition-colors ${tabInactive}`}
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

      {/* Sub-affordance row — visible for any view in the files section */}
      {/* Gray bridge closes the visual gap between the main row and sub-row */}
      {showFilesSection && <div className="h-0.5 shrink-0 bg-gray-100 dark:bg-gray-800" />}
      {showFilesSection && (
        <div className="flex h-6 shrink-0 items-center border-b border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-gray-800 px-1.5 gap-0.5">

          {/* Search — toggles back to files when already active */}
          <button
            onClick={() => {
              if (activeView === "search") {
                setActiveView("files");
                if (isSearchOpen) toggleSearch();
              } else {
                setActiveView("search" as const);
                if (!isSearchOpen) toggleSearch();
              }
            }}
            className={`rounded p-0.5 transition-colors ${
              activeView === "search" ? subActive : subInactive
            }`}
            title="Search (Cmd+/)"
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>

          {/* Daily notes, publishing, and any other sub-affordance items */}
          {subAffordanceItems.map(({ item, ActionComponent }) => {
            if (item.type === "action") {
              return ActionComponent ? (
                <ActionComponent
                  key={item.id}
                  item={item}
                  className={`rounded p-0.5 transition-colors ${
                    activeView === item.id ? subActive : subInactive
                  }`}
                  iconClassName="h-4 w-4"
                />
              ) : null;
            }

            const isSubActive = activeView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => {
                  setActiveView(isSubActive ? "files" : item.view);
                }}
                className={`rounded p-0.5 transition-colors ${isSubActive ? subActive : subInactive}`}
                title={item.title ?? item.label}
                type="button"
              >
                {renderExtensionIcon(item.iconName, "h-4 w-4")}
              </button>
            );
          })}

          {/* Plus button — snapped to right edge */}
          <div className="flex-1" />
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
            onCreateAiImage={onCreateAiImage ? () => onCreateAiImage() : undefined}
            onAddPeopleTarget={onAddPeopleTarget ? () => onAddPeopleTarget() : undefined}
            disabled={isCreateDisabled}
          />
        </div>
      )}
    </div>
  );
}
