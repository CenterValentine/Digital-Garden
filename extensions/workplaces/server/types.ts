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

/**
 * PATCH /api/content/workspaces/[id]/state request body: the pane snapshot plus
 * the `updatedAt` the sender derived it from. The server rejects the write with
 * 409 if the row has moved on, so a surface holding a stale snapshot (the
 * extension panel iframe, the tree overlay, a second window) can't silently
 * resurrect tabs another surface closed. `baseUpdatedAt` is never persisted —
 * `normalizeWorkspaceStatePayload` rebuilds `paneState` from known fields only.
 */
export interface WorkspaceStateSavePayload extends WorkspaceStatePayload {
  baseUpdatedAt?: string | null;
  /**
   * False when the sender cannot render the workspace's full pane geometry —
   * the one-pane extension panel iframe today, a mobile client later. Its
   * `layoutMode` and pane distribution then describe a viewport, not the
   * workspace, so the server keeps the STORED geometry and folds in only this
   * surface's tab membership. Without it a narrow surface silently flattens a
   * split for every other surface on the same workspace.
   *
   * Defaults to true: an omitted flag means an authoritative full-shell client.
   */
  layoutAuthority?: boolean;
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

/**
 * Parent-workspace `settings.workbenches` — normalized shape. Absent key =
 * enabled with defaults. `dormantClearoutDays` is clamped to 1–365 server-side
 * (default 30) and drives the dormant-clearout cron.
 */
export interface WorkspaceWorkbenchSettings {
  enabled: boolean;
  /**
   * Hidden folders, flat across every layer. A folder id identifies a folder
   * uniquely whatever its depth, so one set covers all of them.
   */
  hiddenFolderIds: string[];
  dormantClearoutDays: number;
  /**
   * How many folder layers the submenu may descend, 1-3. Default 1 — nesting
   * is opt-in, because most views are flat and a menu that keeps unfolding is
   * a menu that's hard to leave.
   */
  maxDepth: number;
  /**
   * Custom order per panel, keyed by the folder whose CHILDREN that panel
   * lists (the view root for layer 1). Keyed by parent folder rather than by
   * depth so a folder keeps its order however you reach it, and so no layer
   * has to exist as a workbench for its children to be ordered.
   *
   * Missing key = follow tree order. Ids are kept even when a folder is
   * hidden or vanishes: a stale id costs one map lookup, while pruning would
   * forget the position of a folder that comes back.
   */
  folderOrders: Record<string, string[]>;
  /**
   * Pre-nesting flat order for layer 1. Read-only compatibility: the client
   * falls back to it when `folderOrders` has no entry for the view root, and
   * the next reorder supersedes it. Never written.
   */
  folderOrder: string[];
}

/** Nesting depth is user-configurable within these bounds. */
export const WORKBENCH_MIN_DEPTH = 1;
export const WORKBENCH_MAX_DEPTH = 3;

/**
 * Normalize a workspace's raw `settings.workbenches` value. Shared by the
 * server (service, cron) and the client (selector submenu) so the two can't
 * drift: absent/malformed keys resolve to enabled, no hidden folders, 30-day
 * clearout; `dormantClearoutDays` is clamped to 1–365.
 */
export function normalizeWorkbenchSettings(
  settings: Record<string, unknown> | null | undefined,
): WorkspaceWorkbenchSettings {
  const raw = settings?.["workbenches"];
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const enabled = typeof obj.enabled === "boolean" ? obj.enabled : true;
  const hiddenFolderIds = Array.isArray(obj.hiddenFolderIds)
    ? obj.hiddenFolderIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const dormantClearoutDays =
    typeof obj.dormantClearoutDays === "number" &&
    Number.isFinite(obj.dormantClearoutDays)
      ? Math.min(365, Math.max(1, Math.round(obj.dormantClearoutDays)))
      : 30;
  const folderOrder = Array.isArray(obj.folderOrder)
    ? obj.folderOrder.filter((value): value is string => typeof value === "string")
    : [];
  const maxDepth =
    typeof obj.maxDepth === "number" && Number.isFinite(obj.maxDepth)
      ? Math.min(
          WORKBENCH_MAX_DEPTH,
          Math.max(WORKBENCH_MIN_DEPTH, Math.round(obj.maxDepth)),
        )
      : WORKBENCH_MIN_DEPTH;
  const folderOrders: Record<string, string[]> = {};
  const rawOrders = obj.folderOrders;
  if (rawOrders && typeof rawOrders === "object" && !Array.isArray(rawOrders)) {
    for (const [key, value] of Object.entries(
      rawOrders as Record<string, unknown>,
    )) {
      if (!Array.isArray(value)) continue;
      folderOrders[key] = value.filter(
        (entry): entry is string => typeof entry === "string",
      );
    }
  }
  return {
    enabled,
    hiddenFolderIds,
    dormantClearoutDays,
    maxDepth,
    folderOrders,
    folderOrder,
  };
}

/**
 * Apply a saved folder order to a list keyed by folder id.
 *
 * Unlisted ids sort last and keep their incoming (tree) order — `sort` is
 * stable — so a folder created after the last reorder appears at the end
 * rather than jumping to the top.
 *
 * Shared by the server list route and the submenu so both agree on order.
 */
export function applyWorkbenchFolderOrder<T extends { folderId: string }>(
  items: T[],
  folderOrder: string[],
): T[] {
  if (folderOrder.length === 0) return items;
  const rank = new Map(folderOrder.map((id, index) => [id, index]));
  return [...items].sort(
    (a, b) =>
      (rank.get(a.folderId) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.folderId) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * The order a given panel should use: its own keyed entry, else the legacy
 * flat order when this is the root panel, else tree order.
 */
export function resolveFolderOrder(
  settings: WorkspaceWorkbenchSettings,
  listRootId: string,
  isRootPanel: boolean,
): string[] {
  const keyed = settings.folderOrders[listRootId];
  if (keyed && keyed.length > 0) return keyed;
  return isRootPanel ? settings.folderOrder : [];
}

/** One row of GET /api/content/workspaces/[id]/workbenches. */
export interface WorkbenchFolderOption {
  folderId: string;
  title: string;
  /** Existing workbench workspace id for this folder, if materialized. */
  workbenchId: string | null;
  /** True when the folder is in the parent's hiddenFolderIds list. */
  hidden: boolean;
  /** Whether this folder's own children may still be browsed (depth budget). */
  canNest: boolean;
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
  /**
   * Non-null marks this row as a WORKBENCH — a folder-derived sub-workspace of
   * that parent workspace (`viewRootContentId` = the backing folder). Workbench
   * rows are excluded from the top-level workspace list and surfaced through
   * the parent's dwell submenu instead. They are not renameable (the name
   * mirrors the folder) and carry no settings of their own.
   */
  parentWorkspaceId: string | null;
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
