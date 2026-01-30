/**
 * Folder View Container
 *
 * Router component that switches between different folder view modes.
 * M9 Phase 2: FolderPayload support
 */

"use client";

import { ListView } from "./ListView";
import { GalleryView } from "./GalleryView";
import { KanbanView } from "./KanbanView";
import { DashboardView } from "./DashboardView";
import { CanvasView } from "./CanvasView";

export type FolderViewMode = "list" | "gallery" | "kanban" | "dashboard" | "canvas";

export interface FolderViewProps {
  folderId: string;
  folderTitle: string;
  viewPrefs?: Record<string, any>;
  sortMode?: string | null;
  includeReferencedContent?: boolean;
  onUpdateView?: (updates: {
    viewMode?: FolderViewMode;
    viewPrefs?: Record<string, any>;
    sortMode?: string | null;
    includeReferencedContent?: boolean;
  }) => Promise<void>;
}

interface FolderViewContainerProps extends FolderViewProps {
  viewMode: FolderViewMode;
}

export function FolderViewContainer({
  viewMode,
  folderId,
  folderTitle,
  viewPrefs = {},
  sortMode = null,
  includeReferencedContent = false,
  onUpdateView,
}: FolderViewContainerProps) {
  const commonProps = {
    folderId,
    folderTitle,
    viewPrefs,
    sortMode,
    includeReferencedContent,
    onUpdateView,
  };

  switch (viewMode) {
    case "gallery":
      return <GalleryView {...commonProps} />;
    case "kanban":
      return <KanbanView {...commonProps} />;
    case "dashboard":
      return <DashboardView {...commonProps} />;
    case "canvas":
      return <CanvasView {...commonProps} />;
    case "list":
    default:
      return <ListView {...commonProps} />;
  }
}
