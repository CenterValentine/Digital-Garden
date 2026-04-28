import type {
  ContentWorkspaceItemAssignmentType,
  ContentWorkspaceItemScope,
} from "@/lib/database/generated/prisma";

export type WorkspaceLayoutMode =
  | "single"
  | "dual-vertical"
  | "dual-horizontal"
  | "quad";

export type WorkspacePaneId =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface WorkspacePaneSnapshot {
  contentIds: string[];
  activeContentId: string | null;
}

export type WorkspacePaneStatePayload = Partial<
  Record<WorkspacePaneId, WorkspacePaneSnapshot>
>;

export interface WorkspaceStatePayload {
  layoutMode: WorkspaceLayoutMode;
  activePaneId: WorkspacePaneId;
  activeContentId: string | null;
  paneTabContentIds: WorkspacePaneStatePayload;
}

export interface WorkspaceContentSummary {
  id: string;
  title: string;
  contentType: string;
  parentId: string | null;
}

export interface WorkspaceItemResponse {
  id: string;
  workspaceId: string;
  contentId: string;
  assignmentType: ContentWorkspaceItemAssignmentType;
  scope: ContentWorkspaceItemScope;
  expiresAt: string | null;
  content: WorkspaceContentSummary;
}

export interface WorkspaceViewRoot {
  id: string;
  title: string;
}

export interface ContentWorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  isMain: boolean;
  isLocked: boolean;
  isView: boolean;
  viewRootContentId: string | null;
  viewRoot: WorkspaceViewRoot | null;
  status: "active" | "archived";
  expiresAt: string | null;
  archivedAt: string | null;
  layoutMode: WorkspaceLayoutMode;
  activePaneId: WorkspacePaneId;
  paneState: WorkspaceStatePayload;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  items: WorkspaceItemResponse[];
}

export interface WorkspaceOpenConflict {
  conflictType: "overlap" | "viewScope";
  workspaceId: string;
  workspaceName: string;
  contentId: string;
  contentTitle: string;
  claimContentId: string;
  claimContentTitle: string;
  scope: ContentWorkspaceItemScope;
  folderScopeContentId: string | null;
  folderScopeContentTitle: string | null;
}

export interface WorkspaceOpenIntentResponse {
  allowed: boolean;
  conflict: WorkspaceOpenConflict | null;
}
