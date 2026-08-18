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
  /**
   * Title + type for every content id referenced by the saved pane layout
   * (open tabs), keyed by contentId. This is a *superset* of `items` — open
   * tabs are not always formal workspace assignments — so tabs paint named on
   * the first frame regardless of assignment status (spec §3.8). Populated on
   * read paths (list/get); may be empty on mutation responses.
   */
  contentMeta: Record<string, { title: string; contentType: string }>;
  /**
   * Fresh (<30d) per-family layout records for the R5 inheritance chain and
   * the F2 adoption picker (layout-intent spec). Newest first. Populated on
   * read paths (list/get); may be absent on mutation responses — consumers
   * must fall back to the legacy paneState blob when undefined/empty.
   */
  layoutRecords?: WorkspaceLayoutRecordSummary[];
  /**
   * R1 membership — the workspace-scoped set of open content ids
   * (ContentWorkspaceTab), source of truth for the tab SET on read. Clients
   * union this with the legacy paneState blob so tabs opened by surfaces that
   * don't write the blob (extension iframes) still appear everywhere.
   * Populated on read paths; may be absent on mutation responses.
   */
  membershipContentIds?: string[];
}

export interface WorkspaceLayoutRecordSummary {
  family: string;
  deviceId: string;
  layoutMode: WorkspaceLayoutMode;
  paneOrder: Array<{ paneOrdinal: number; tabOrder: string[] }>;
  lastActive: { paneOrdinal: number; contentId: string } | null;
  updatedAt: string;
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
  /**
   * True when the workspace already holds a claim covering this content —
   * either a direct item assignment or a recursive claim on the content or
   * one of its ancestors (any assignment type). The client must NOT create
   * a new assignment for covered opens: doing so would upsert over the
   * existing claim (e.g. converting a borrowed/shared item to primary) or
   * pin descendants of a borrowed folder past the borrow window.
   */
  alreadyCovered?: boolean;
  conflict: WorkspaceOpenConflict | null;
}
