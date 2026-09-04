import { prisma } from "@/lib/database/client";
import {
  ContentWorkspaceItemAssignmentType,
  ContentWorkspaceItemScope,
  type ContentWorkspace,
  type ContentWorkspaceItem,
  type ContentNode,
  // Value import: createWorkbench needs the runtime
  // Prisma.PrismaClientKnownRequestError to recognise a P2002 unique
  // violation (the concurrent-click race) and reuse the winner's row.
  Prisma,
} from "@/lib/database/generated/prisma";
import { generateSlug } from "@/lib/domain/content";
import { logger } from "@/lib/core/logger";
import { reconcileMembershipFromSnapshot } from "./membership";
import { LAYOUT_RECORD_MAX_AGE_DAYS } from "./layout-records";
import type {
  ContentWorkspaceResponse,
  WorkbenchFolderOption,
  WorkspaceOpenIntentResponse,
  WorkspacePaneId,
  WorkspacePaneSnapshot,
  WorkspaceStatePayload,
  WorkspacePaneStatePayload,
} from "./types";
// Value import (not `import type`): the same normalizer the client uses, so
// server and submenu can't disagree about what "workbenches enabled" means.
import {
  applyWorkbenchFolderOrder,
  normalizeWorkbenchSettings,
  resolveFolderOrder,
} from "./types";

const MAIN_WORKSPACE_NAME = "Main Workspace";
const MAIN_WORKSPACE_SLUG = "main";
const DEFAULT_LAYOUT_MODE = "single";
const DEFAULT_PANE_ID: WorkspacePaneId = "top-left";
const WORKSPACE_PANE_IDS: WorkspacePaneId[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

type WorkspaceWithItems = ContentWorkspace & {
  items: Array<
    ContentWorkspaceItem & {
      content: Pick<ContentNode, "id" | "title" | "contentType" | "parentId">;
    }
  >;
  viewRoot: Pick<ContentNode, "id" | "title"> | null;
  // Present on read paths that include fresh layout records (R5/F2).
  // R1 membership rows (read paths).
  tabs?: Array<{ contentId: string }>;
  layoutRecords?: Array<{
    family: string;
    deviceId: string;
    layoutMode: string;
    paneOrder: Prisma.JsonValue;
    lastActive: Prisma.JsonValue;
    updatedAt: Date;
  }>;
};

/** Narrow a stored paneOrder JSON back to the summary shape (defensive). */
function normalizeStoredPaneOrder(
  value: Prisma.JsonValue,
): Array<{ paneOrdinal: number; tabOrder: string[] }> {
  if (!Array.isArray(value)) return [];
  const result: Array<{ paneOrdinal: number; tabOrder: string[] }> = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const pane = entry as Record<string, unknown>;
    if (typeof pane.paneOrdinal !== "number") continue;
    result.push({
      paneOrdinal: pane.paneOrdinal,
      tabOrder: Array.isArray(pane.tabOrder)
        ? pane.tabOrder.filter((id): id is string => typeof id === "string")
        : [],
    });
  }
  return result;
}

function normalizeStoredLastActive(
  value: Prisma.JsonValue,
): { paneOrdinal: number; contentId: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const seed = value as Record<string, unknown>;
  if (typeof seed.paneOrdinal !== "number" || typeof seed.contentId !== "string") {
    return null;
  }
  return { paneOrdinal: seed.paneOrdinal, contentId: seed.contentId };
}

function emptyPaneState(): WorkspacePaneStatePayload {
  return {
    "top-left": { contentIds: [], activeContentId: null },
    "top-right": { contentIds: [], activeContentId: null },
    "bottom-left": { contentIds: [], activeContentId: null },
    "bottom-right": { contentIds: [], activeContentId: null },
  };
}

function normalizePaneId(value: unknown): WorkspacePaneId {
  return WORKSPACE_PANE_IDS.includes(value as WorkspacePaneId)
    ? (value as WorkspacePaneId)
    : DEFAULT_PANE_ID;
}

function normalizeWorkspaceState(
  workspace: ContentWorkspace,
): WorkspaceStatePayload {
  const rawPaneState =
    workspace.paneState && typeof workspace.paneState === "object"
      ? (workspace.paneState as Partial<WorkspaceStatePayload>)
      : {};

  return {
    layoutMode:
      workspace.layoutMode === "dual-vertical" ||
      workspace.layoutMode === "dual-horizontal" ||
      workspace.layoutMode === "quad"
        ? workspace.layoutMode
        : DEFAULT_LAYOUT_MODE,
    activePaneId: normalizePaneId(workspace.activePaneId),
    activeContentId:
      typeof rawPaneState.activeContentId === "string"
        ? rawPaneState.activeContentId
        : null,
    paneTabContentIds: {
      ...emptyPaneState(),
      ...(rawPaneState.paneTabContentIds ?? {}),
    },
  };
}

function normalizeWorkspaceStatePayload(value: unknown): WorkspaceStatePayload {
  const rawState =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<WorkspaceStatePayload>)
      : {};
  const rawPaneState =
    rawState.paneTabContentIds &&
    typeof rawState.paneTabContentIds === "object" &&
    !Array.isArray(rawState.paneTabContentIds)
      ? rawState.paneTabContentIds
      : {};
  const paneTabContentIds: WorkspacePaneStatePayload = {};

  for (const paneId of WORKSPACE_PANE_IDS) {
    const rawPane = rawPaneState[paneId];
    const pane: Partial<WorkspacePaneSnapshot> =
      rawPane && typeof rawPane === "object" && !Array.isArray(rawPane)
        ? (rawPane as Partial<WorkspacePaneSnapshot>)
        : {};
    const contentIds = Array.isArray(pane.contentIds)
      ? Array.from(
          new Set(
            pane.contentIds.filter(
              (contentId): contentId is string => typeof contentId === "string",
            ),
          ),
        )
      : [];

    paneTabContentIds[paneId] = {
      contentIds,
      activeContentId:
        typeof pane.activeContentId === "string" ? pane.activeContentId : null,
    };
  }

  return {
    layoutMode:
      rawState.layoutMode === "dual-vertical" ||
      rawState.layoutMode === "dual-horizontal" ||
      rawState.layoutMode === "quad"
        ? rawState.layoutMode
        : DEFAULT_LAYOUT_MODE,
    activePaneId: normalizePaneId(rawState.activePaneId),
    activeContentId:
      typeof rawState.activeContentId === "string"
        ? rawState.activeContentId
        : null,
    paneTabContentIds,
  };
}

function filterWorkspaceStateToContentIds(
  state: WorkspaceStatePayload,
  allowedContentIds: Set<string>,
): WorkspaceStatePayload {
  const paneTabContentIds: WorkspacePaneStatePayload = {};

  for (const paneId of WORKSPACE_PANE_IDS) {
    const pane = state.paneTabContentIds[paneId];
    const contentIds = (pane?.contentIds ?? []).filter((contentId) =>
      allowedContentIds.has(contentId),
    );
    const activeContentId =
      pane?.activeContentId && allowedContentIds.has(pane.activeContentId)
        ? pane.activeContentId
        : (contentIds[0] ?? null);

    paneTabContentIds[paneId] = {
      contentIds,
      activeContentId,
    };
  }

  return {
    ...state,
    activeContentId:
      state.activeContentId && allowedContentIds.has(state.activeContentId)
        ? state.activeContentId
        : (paneTabContentIds[state.activePaneId]?.activeContentId ?? null),
    paneTabContentIds,
  };
}

function normalizeSettings(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function workspaceStateHasContent(
  workspace: Pick<
    ContentWorkspace,
    "paneState" | "layoutMode" | "activePaneId"
  >,
  contentId: string,
) {
  const normalizedState = normalizeWorkspaceState(
    workspace as ContentWorkspace,
  );

  if (normalizedState.activeContentId === contentId) return true;

  return Object.values(normalizedState.paneTabContentIds).some((pane) => {
    if (!pane) return false;
    return (
      pane.activeContentId === contentId ||
      (pane.contentIds ?? []).includes(contentId)
    );
  });
}

/** All content ids referenced by a normalized pane layout (open tabs). */
function collectPaneContentIds(
  normalizedState: WorkspaceStatePayload,
): Set<string> {
  const ids = new Set<string>();
  for (const pane of Object.values(normalizedState.paneTabContentIds)) {
    if (!pane) continue;
    for (const id of pane.contentIds ?? []) ids.add(id);
    if (pane.activeContentId) ids.add(pane.activeContentId);
  }
  if (normalizedState.activeContentId) ids.add(normalizedState.activeContentId);
  return ids;
}

export function formatWorkspace(
  workspace: WorkspaceWithItems,
  contentLookup?: Map<string, { title: string; contentType: string }>,
): ContentWorkspaceResponse {
  const normalizedState = normalizeWorkspaceState(workspace);

  // Build contentMeta over the open-tab set (superset of items). Items carry
  // titles inline; anything open but unassigned is filled from the lookup the
  // read path passes in. Tabs without a resolvable title are simply omitted —
  // the client keeps its "Loading…" default and falls back to a per-tab fetch.
  const itemContentById = new Map(
    workspace.items.map((item) => [item.contentId, item.content]),
  );
  const contentMeta: Record<string, { title: string; contentType: string }> = {};
  for (const id of collectPaneContentIds(normalizedState)) {
    const fromItem = itemContentById.get(id);
    const title = fromItem?.title ?? contentLookup?.get(id)?.title;
    const contentType =
      fromItem?.contentType ?? contentLookup?.get(id)?.contentType;
    if (title != null && contentType != null) {
      contentMeta[id] = { title, contentType };
    }
  }
  const parentWorkspaceId = workspace.parentWorkspaceId ?? null;
  // A workbench's name mirrors its backing folder — renaming the folder renames
  // the workbench on the next read; the stored name is only a fallback for a
  // dead row (folder hard-deleted, FK set null).
  const name =
    parentWorkspaceId && workspace.viewRoot
      ? workspace.viewRoot.title
      : workspace.name;
  return {
    id: workspace.id,
    name,
    slug: workspace.slug,
    isMain: workspace.isMain,
    isLocked: workspace.isLocked,
    isView: workspace.viewRootContentId !== null,
    viewRootContentId: workspace.viewRootContentId ?? null,
    viewRoot: workspace.viewRoot
      ? { id: workspace.viewRoot.id, title: workspace.viewRoot.title }
      : null,
    parentWorkspaceId,
    status: workspace.status,
    expiresAt: workspace.expiresAt?.toISOString() ?? null,
    archivedAt: workspace.archivedAt?.toISOString() ?? null,
    layoutMode: normalizedState.layoutMode,
    activePaneId: normalizedState.activePaneId,
    paneState: normalizedState,
    settings: normalizeSettings(workspace.settings),
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    items: workspace.items.map((item) => ({
      id: item.id,
      workspaceId: item.workspaceId,
      contentId: item.contentId,
      assignmentType: item.assignmentType,
      scope: item.scope,
      expiresAt: item.expiresAt?.toISOString() ?? null,
      content: {
        id: item.content.id,
        title: item.content.title,
        contentType: item.content.contentType,
        parentId: item.content.parentId,
      },
    })),
    contentMeta,
    membershipContentIds: workspace.tabs?.map((tab) => tab.contentId),
    layoutRecords: workspace.layoutRecords?.map((record) => ({
      family: record.family,
      deviceId: record.deviceId,
      layoutMode:
        record.layoutMode === "dual-vertical" ||
        record.layoutMode === "dual-horizontal" ||
        record.layoutMode === "quad"
          ? record.layoutMode
          : "single",
      paneOrder: normalizeStoredPaneOrder(record.paneOrder),
      lastActive: normalizeStoredLastActive(record.lastActive),
      updatedAt: record.updatedAt.toISOString(),
    })),
  };
}

async function uniqueWorkspaceSlug(
  ownerId: string,
  name: string,
  excludeId?: string,
) {
  const baseSlug = generateSlug(name) || "workspace";
  let candidateSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await prisma.contentWorkspace.findFirst({
      where: {
        ownerId,
        slug: candidateSlug,
        id: excludeId ? { not: excludeId } : undefined,
      },
      select: { id: true },
    });

    if (!existing) return candidateSlug;
    candidateSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function cleanupExpiredWorkspaces(ownerId: string) {
  const now = new Date();

  const expiredWorkspaces = await prisma.contentWorkspace.findMany({
    where: {
      ownerId,
      isMain: false,
      status: "active",
      expiresAt: { lte: now },
    },
    select: { id: true },
  });

  if (expiredWorkspaces.length > 0) {
    const workspaceIds = expiredWorkspaces.map((workspace) => workspace.id);
    await prisma.$transaction([
      prisma.contentWorkspaceItem.deleteMany({
        where: { workspaceId: { in: workspaceIds } },
      }),
      prisma.contentWorkspace.updateMany({
        where: { id: { in: workspaceIds } },
        data: { status: "archived", archivedAt: now },
      }),
    ]);
  }

  await prisma.contentWorkspaceItem.deleteMany({
    where: {
      assignmentType: "borrowed",
      expiresAt: { lte: now },
      workspace: { ownerId },
    },
  });
}

export async function ensureMainWorkspace(ownerId: string) {
  await cleanupExpiredWorkspaces(ownerId);

  return prisma.contentWorkspace.upsert({
    where: {
      ownerId_slug: {
        ownerId,
        slug: MAIN_WORKSPACE_SLUG,
      },
    },
    update: {
      isMain: true,
      isLocked: false,
      status: "active",
      expiresAt: null,
      archivedAt: null,
    },
    create: {
      ownerId,
      name: MAIN_WORKSPACE_NAME,
      slug: MAIN_WORKSPACE_SLUG,
      isMain: true,
      isLocked: false,
      status: "active",
      layoutMode: DEFAULT_LAYOUT_MODE,
      activePaneId: DEFAULT_PANE_ID,
      paneState: {},
      settings: {},
    },
  });
}

/**
 * Resolve title/type for open-tab content ids that aren't already workspace
 * items, so formatWorkspace can emit a complete `contentMeta` map (spec §3.8).
 * Items already carry titles inline and formatWorkspace prefers them, so we
 * only query the *uncovered* ids — and skip the query entirely (the common
 * case, where every open tab is an assignment) to keep the critical workspace
 * fetch lean.
 */
async function buildContentLookup(
  ownerId: string,
  workspaces: WorkspaceWithItems[],
): Promise<Map<string, { title: string; contentType: string }>> {
  const ids = new Set<string>();
  const covered = new Set<string>();
  for (const workspace of workspaces) {
    for (const item of workspace.items) covered.add(item.contentId);
    for (const id of collectPaneContentIds(normalizeWorkspaceState(workspace))) {
      ids.add(id);
    }
  }
  for (const id of covered) ids.delete(id);
  if (ids.size === 0) return new Map();

  const nodes = await prisma.contentNode.findMany({
    where: { id: { in: [...ids] }, ownerId, deletedAt: null },
    select: { id: true, title: true, contentType: true },
  });
  return new Map(
    nodes.map((node) => [
      node.id,
      { title: node.title, contentType: node.contentType },
    ]),
  );
}

export async function listWorkspaces(ownerId: string, includeArchived = false) {
  await ensureMainWorkspace(ownerId);

  const workspaces = await prisma.contentWorkspace.findMany({
    where: {
      ownerId,
      status: includeArchived ? undefined : "active",
    },
    include: {
      items: {
        where: {
          content: { ownerId, deletedAt: null },
        },
        include: {
          content: {
            select: {
              id: true,
              title: true,
              contentType: true,
              parentId: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
      viewRoot: { select: { id: true, title: true } },
      // R1 membership rides the list: source of truth for the tab SET on
      // read (unioned with the legacy blob client-side).
      tabs: {
        where: { content: { ownerId, deletedAt: null } },
        select: { contentId: true },
      },
      // Fresh layout records ride the list so the client's R5 inheritance
      // chain can run synchronously at workspace open (layout-intent P3).
      layoutRecords: {
        where: {
          updatedAt: {
            gte: new Date(
              Date.now() - LAYOUT_RECORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
            ),
          },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          family: true,
          deviceId: true,
          layoutMode: true,
          paneOrder: true,
          lastActive: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [{ isMain: "desc" }, { updatedAt: "desc" }],
  });

  const contentLookup = await buildContentLookup(ownerId, workspaces);
  return workspaces.map((workspace) =>
    formatWorkspace(workspace, contentLookup),
  );
}

export async function getWorkspace(ownerId: string, workspaceId: string) {
  await ensureMainWorkspace(ownerId);

  const workspace = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId },
    include: {
      items: {
        where: {
          content: { ownerId, deletedAt: null },
        },
        include: {
          content: {
            select: {
              id: true,
              title: true,
              contentType: true,
              parentId: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
      viewRoot: { select: { id: true, title: true } },
    },
  });

  if (!workspace) return null;
  const contentLookup = await buildContentLookup(ownerId, [workspace]);
  return formatWorkspace(workspace, contentLookup);
}

export async function createWorkspace(ownerId: string, name: string) {
  await ensureMainWorkspace(ownerId);
  const normalizedName = name.trim() || "Untitled Workspace";
  const slug = await uniqueWorkspaceSlug(ownerId, normalizedName);

  const workspace = await prisma.contentWorkspace.create({
    data: {
      ownerId,
      name: normalizedName,
      slug,
      isMain: false,
      layoutMode: DEFAULT_LAYOUT_MODE,
      activePaneId: DEFAULT_PANE_ID,
      paneState: {},
      settings: {},
    },
    include: {
      items: {
        where: {
          content: { ownerId, deletedAt: null },
        },
        include: {
          content: {
            select: {
              id: true,
              title: true,
              contentType: true,
              parentId: true,
            },
          },
        },
      },
      viewRoot: { select: { id: true, title: true } },
    },
  });

  return formatWorkspace(workspace);
}

export async function duplicateWorkspace(
  ownerId: string,
  workspaceId: string,
  name?: string,
) {
  await ensureMainWorkspace(ownerId);

  const source = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId, status: "active" },
    include: {
      items: {
        where: {
          content: { ownerId, deletedAt: null },
        },
      },
    },
  });

  if (!source) return null;

  const normalizedName = name?.trim() || `${source.name} Copy`;
  const slug = await uniqueWorkspaceSlug(ownerId, normalizedName);

  const duplicated = await prisma.$transaction(async (tx) => {
    const workspace = await tx.contentWorkspace.create({
      data: {
        ownerId,
        name: normalizedName,
        slug,
        isMain: false,
        isLocked: source.isLocked,
        layoutMode: source.layoutMode,
        activePaneId: source.activePaneId,
        paneState: source.paneState as Prisma.InputJsonValue,
        settings: source.settings as Prisma.InputJsonValue,
      },
      include: {
        items: {
          where: {
            content: { ownerId, deletedAt: null },
          },
          include: {
            content: {
              select: {
                id: true,
                title: true,
                contentType: true,
                parentId: true,
              },
            },
          },
        },
      },
    });

    if (source.items.length > 0) {
      await tx.contentWorkspaceItem.createMany({
        data: source.items.map((item) => ({
          workspaceId: workspace.id,
          contentId: item.contentId,
          assignmentType:
            item.assignmentType === "borrowed" ? "borrowed" : "shared",
          scope: item.scope,
          expiresAt: item.expiresAt,
        })),
        skipDuplicates: true,
      });
    }

    return tx.contentWorkspace.findFirst({
      where: { id: workspace.id, ownerId },
      include: {
        items: {
          where: {
            content: { ownerId, deletedAt: null },
          },
          include: {
            content: {
              select: {
                id: true,
                title: true,
                contentType: true,
                parentId: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        },
        viewRoot: { select: { id: true, title: true } },
      },
    });
  });

  return duplicated ? formatWorkspace(duplicated) : null;
}

export async function updateWorkspace(
  ownerId: string,
  workspaceId: string,
  updates: {
    name?: string;
    isLocked?: boolean;
    expiresAt?: string | null;
    settings?: Record<string, unknown>;
    viewRootContentId?: string | null;
  },
) {
  const existing = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId },
  });

  if (!existing) return null;

  const data: Prisma.ContentWorkspaceUpdateInput = {};

  if (updates.name !== undefined) {
    const nextName = updates.name.trim() || existing.name;
    data.name = nextName;
    data.slug = await uniqueWorkspaceSlug(ownerId, nextName, workspaceId);
  }

  if (updates.isLocked !== undefined && !existing.isMain) {
    data.isLocked = updates.isLocked;
  }

  if (updates.expiresAt !== undefined && !existing.isMain) {
    data.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
  }

  if (updates.settings !== undefined) {
    data.settings = updates.settings as Prisma.InputJsonValue;
  }

  if ("viewRootContentId" in updates && !existing.isMain) {
    if (updates.viewRootContentId === null) {
      data.viewRoot = { disconnect: true };
    } else if (updates.viewRootContentId) {
      const viewRootNode = await prisma.contentNode.findFirst({
        where: { id: updates.viewRootContentId, ownerId, deletedAt: null },
        select: { id: true },
      });
      if (viewRootNode) {
        data.viewRoot = { connect: { id: viewRootNode.id } };
      }
    }
  }

  const workspace = await prisma.contentWorkspace.update({
    where: { id: workspaceId },
    data,
    include: {
      items: {
        where: {
          content: { ownerId, deletedAt: null },
        },
        include: {
          content: {
            select: {
              id: true,
              title: true,
              contentType: true,
              parentId: true,
            },
          },
        },
      },
      viewRoot: { select: { id: true, title: true } },
    },
  });

  return formatWorkspace(workspace);
}

export async function archiveWorkspace(ownerId: string, workspaceId: string) {
  const existing = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId },
  });

  if (!existing || existing.isMain) return null;

  const now = new Date();
  await prisma.$transaction([
    prisma.contentWorkspaceItem.deleteMany({ where: { workspaceId } }),
    prisma.contentWorkspace.update({
      where: { id: workspaceId },
      data: { status: "archived", archivedAt: now },
    }),
  ]);

  return getWorkspace(ownerId, workspaceId);
}

export async function resetWorkspaces(ownerId: string) {
  const mainWorkspace = await ensureMainWorkspace(ownerId);

  await prisma.$transaction([
    prisma.contentWorkspaceItem.deleteMany({
      where: {
        workspace: { ownerId },
      },
    }),
    prisma.contentWorkspace.update({
      where: { id: mainWorkspace.id },
      data: {
        isLocked: false,
        layoutMode: DEFAULT_LAYOUT_MODE,
        activePaneId: DEFAULT_PANE_ID,
        paneState: {},
        settings: {},
        expiresAt: null,
        archivedAt: null,
        status: "active",
      },
    }),
    prisma.contentWorkspace.deleteMany({
      where: {
        ownerId,
        isMain: false,
      },
    }),
  ]);

  return listWorkspaces(ownerId);
}

function getStateContentIds(state: WorkspaceStatePayload) {
  const contentIds = new Set<string>();
  Object.values(state.paneTabContentIds ?? {}).forEach((pane) => {
    pane?.contentIds?.forEach((contentId) => contentIds.add(contentId));
    if (pane?.activeContentId) contentIds.add(pane.activeContentId);
  });
  if (state.activeContentId) contentIds.add(state.activeContentId);
  return [...contentIds];
}

/**
 * Fold a non-authoritative surface's tab membership into the stored geometry.
 *
 * A one-pane surface (extension panel, mobile) sends every tab in one pane
 * because that's all it can show. Taken literally that write flattens a split
 * for everyone. So its payload is read for MEMBERSHIP only — which content is
 * open — while layoutMode, activePaneId and each tab's pane assignment come
 * from what's already stored.
 *
 * Closes still propagate (anything the sender dropped is dropped here too), and
 * opens land in the stored active pane, the only placement a projecting surface
 * can meaningfully imply.
 */
function mergeMembershipIntoStoredLayout(
  stored: WorkspaceStatePayload,
  incoming: WorkspaceStatePayload,
): WorkspaceStatePayload {
  const incomingIds = new Set(getStateContentIds(incoming));
  const storedIds = new Set(getStateContentIds(stored));

  const paneTabContentIds: WorkspacePaneStatePayload = {};
  for (const paneId of WORKSPACE_PANE_IDS) {
    const pane = stored.paneTabContentIds[paneId];
    const contentIds = (pane?.contentIds ?? []).filter((contentId) =>
      incomingIds.has(contentId),
    );
    paneTabContentIds[paneId] = {
      contentIds,
      activeContentId:
        pane?.activeContentId && contentIds.includes(pane.activeContentId)
          ? pane.activeContentId
          : (contentIds[0] ?? null),
    };
  }

  const additions = [...incomingIds].filter(
    (contentId) => !storedIds.has(contentId),
  );
  if (additions.length > 0) {
    const targetPaneId = normalizePaneId(stored.activePaneId);
    const target = paneTabContentIds[targetPaneId];
    if (target) {
      target.contentIds = [...target.contentIds, ...additions];
      target.activeContentId = target.activeContentId ?? additions[0];
    }
  }

  const survivingIds = new Set(
    WORKSPACE_PANE_IDS.flatMap(
      (paneId) => paneTabContentIds[paneId]?.contentIds ?? [],
    ),
  );

  // Keep the stored active tab if it's still open. A projecting surface should
  // not be able to yank what someone else is looking at — same principle as
  // `preferActiveContentId` on the client's background reconcile.
  const activeContentId =
    stored.activeContentId && survivingIds.has(stored.activeContentId)
      ? stored.activeContentId
      : incoming.activeContentId && survivingIds.has(incoming.activeContentId)
        ? incoming.activeContentId
        : ([...survivingIds][0] ?? null);

  return {
    layoutMode: stored.layoutMode,
    activePaneId: stored.activePaneId,
    activeContentId,
    paneTabContentIds,
  };
}

export type SaveWorkspaceStateResult =
  | { status: "ok"; workspace: ContentWorkspaceResponse }
  | { status: "not-found" }
  | { status: "conflict"; workspace: ContentWorkspaceResponse };

/**
 * Persist a workspace's pane snapshot, optionally guarded by the `updatedAt`
 * the caller derived that snapshot from.
 *
 * WHY THE GUARD: every surface rendering MainPanelWorkspace — the app window,
 * the browser extension's panel iframe, the tree overlay — mounts
 * WorkplacesShellController, which PATCHes the ENTIRE pane snapshot 600ms after
 * any local change. Unguarded that is last-writer-wins over a whole document,
 * and the one operation it cannot express is a CLOSE: a peer still holding a
 * pre-close snapshot re-asserts the closed tab on its next write, and the
 * closing surface faithfully restores it on the next poll. (Same class of bug
 * as the one `removeContentFromWorkspaces` fixes for deleted content — there
 * the resurrection source is stored state, here it's a stale peer.)
 *
 * A mismatch is reported as `conflict` alongside the CURRENT row, so the caller
 * can reconcile against real state without a second round trip. Omitting
 * `expectedUpdatedAt` preserves the old blind overwrite for callers that have
 * no base to offer.
 */
export async function saveWorkspaceState(
  ownerId: string,
  workspaceId: string,
  state: unknown,
  expectedUpdatedAt?: string | null,
  layoutAuthority = true,
): Promise<SaveWorkspaceStateResult> {
  const workspace = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId, status: "active" },
  });

  if (!workspace) return { status: "not-found" };

  const normalizedState = layoutAuthority
    ? normalizeWorkspaceStatePayload(state)
    : mergeMembershipIntoStoredLayout(
        normalizeWorkspaceStatePayload(workspace.paneState),
        normalizeWorkspaceStatePayload(state),
      );
  const requestedContentIds = getStateContentIds(normalizedState);
  const ownedContentIds = requestedContentIds.length
    ? await prisma.contentNode.findMany({
        where: { ownerId, id: { in: requestedContentIds }, deletedAt: null },
        select: { id: true },
      })
    : [];
  const allowedContentIds = new Set(
    ownedContentIds.map((content) => content.id),
  );
  const filteredState = filterWorkspaceStateToContentIds(
    normalizedState,
    allowedContentIds,
  );

  // Rollout dual-write (layout-intent P1): membership (R1 truth) follows the
  // legacy snapshot's tab union, so old snapshot-writing clients and new
  // membership-event clients converge on the same ContentWorkspaceTab set.
  // Runs on the already-ownership-filtered state.
  const paneContentIds = Object.fromEntries(
    Object.entries(filteredState.paneTabContentIds).map(([paneId, pane]) => [
      paneId,
      pane?.contentIds ?? [],
    ]),
  );
  await reconcileMembershipFromSnapshot(workspaceId, paneContentIds);

  const stateInclude = {
    items: {
      where: {
        content: { ownerId, deletedAt: null },
      },
      include: {
        content: {
          select: {
            id: true,
            title: true,
            contentType: true,
            parentId: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    },
    viewRoot: { select: { id: true, title: true } },
  } satisfies Prisma.ContentWorkspaceInclude;

  const data = {
    layoutMode: filteredState.layoutMode,
    activePaneId: filteredState.activePaneId,
    paneState: filteredState as unknown as Prisma.InputJsonValue,
  };

  if (expectedUpdatedAt) {
    const base = new Date(expectedUpdatedAt);
    if (Number.isNaN(base.getTime())) {
      return { status: "conflict", workspace: await readFormatted() };
    }

    // Millisecond WINDOW, not equality: the column is TIMESTAMPTZ(6) but the
    // Prisma client reads it into a JS Date (ms) and we hand the client that
    // truncated ISO string. Comparing it back for exact equality would 409
    // forever on any row whose stored value carries sub-millisecond digits.
    // Two writes inside the same millisecond aren't a realistic conflict given
    // the 600ms client debounce.
    const { count } = await prisma.contentWorkspace.updateMany({
      where: {
        id: workspaceId,
        ownerId,
        status: "active",
        updatedAt: { gte: base, lt: new Date(base.getTime() + 1) },
      },
      data,
    });

    return count === 0
      ? { status: "conflict", workspace: await readFormatted() }
      : { status: "ok", workspace: await readFormatted() };
  }

  // No compare base = this writer never loaded the record it is about to
  // overwrite. Every legitimate client primes its base at load / create /
  // 409-adoption; the observed null-base writers were stale clients whose
  // module-scope base map had been wiped (dev Fast Refresh) — and the old
  // unconditional last-writer-wins update here let them clobber fresh
  // arrangements (owner D+D revert report, 2026-09-04). Reconcile instead:
  // hand back the current row as a conflict; the client adopts it and
  // retries with a real base, converging in one round.
  return { status: "conflict", workspace: await readFormatted() };

  async function readFormatted() {
    const current = await prisma.contentWorkspace.findFirstOrThrow({
      where: { id: workspaceId, ownerId },
      include: stateInclude,
    });
    return formatWorkspace(current);
  }
}

/**
 * Scrub a content id out of every workspace the owner has — pane tabs
 * (paneState JSON) and assignment items. Called on content delete: without
 * this, the deleted node lingers in stored pane state and the workspace
 * restore/snapshot sync resurrects its tab in the main panel.
 */
export async function removeContentFromWorkspaces(
  ownerId: string,
  contentId: string,
) {
  await prisma.contentWorkspaceItem.deleteMany({
    where: { contentId, workspace: { ownerId } },
  });

  // Workbenches backed by this node — or by anything beneath it — go dormant
  // with it. Deleting an ancestor folder must archive workbenches further
  // down the subtree, so walk descendants rather than matching the id alone.
  // Best-effort: this runs inside the delete cascade and must never fail it.
  try {
    const subtree = [contentId];
    let frontier = [contentId];
    while (frontier.length > 0) {
      const children = await prisma.contentNode.findMany({
        where: { ownerId, parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = children.map((child) => child.id);
      subtree.push(...frontier);
    }
    await archiveWorkbenchesForContent(ownerId, subtree);
  } catch (error) {
    logger.warn({
      layer: "content",
      event: "workbench_archive:failed",
      summary: `workbench archive skipped for ${contentId}`,
      error,
    });
  }

  const workspaces = await prisma.contentWorkspace.findMany({
    where: { ownerId },
    select: { id: true, paneState: true },
  });
  for (const workspace of workspaces) {
    const state = normalizeWorkspaceStatePayload(workspace.paneState);
    const ids = getStateContentIds(state);
    if (!ids.includes(contentId)) continue;
    const allowed = new Set(ids.filter((id) => id !== contentId));
    const filtered = filterWorkspaceStateToContentIds(state, allowed);
    await prisma.contentWorkspace.update({
      where: { id: workspace.id },
      data: {
        layoutMode: filtered.layoutMode,
        activePaneId: filtered.activePaneId,
        paneState: filtered as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

/**
 * How many parent hops separate a live folder from an ancestor, or null when
 * the ancestor isn't reached within `maxHops` (folder moved out, trashed, or
 * simply deeper than the nesting budget allows). 1 = first-level child.
 *
 * A hop-bounded upward walk rather than a subtree query: depth budgets are
 * 1-3, so this is at most three point reads, each also asserting the
 * intermediate folder is alive — a folder inside a trashed parent must not
 * count as attached.
 */
async function folderHopsToAncestor(
  ownerId: string,
  folderId: string,
  ancestorId: string,
  maxHops: number,
): Promise<number | null> {
  let currentId = folderId;
  for (let hops = 1; hops <= maxHops; hops++) {
    const node = await prisma.contentNode.findFirst({
      where: { id: currentId, ownerId, deletedAt: null },
      select: { parentId: true },
    });
    if (!node?.parentId) return null;
    if (node.parentId === ancestorId) return hops;
    currentId = node.parentId;
  }
  return null;
}

/**
 * First-level subfolders of a view workspace's root, joined to any workbench
 * rows that already exist for them. One query per side; the join is done here
 * rather than in the client so "does this folder have a workbench?" has a
 * single answer.
 *
 * Root layer only: nested layers are derived client-side from the scoped
 * tree the submenu already fetches, so serving them here would be a second
 * source of truth for the same data.
 */
export async function listWorkbenchFolders(
  ownerId: string,
  parentWorkspaceId: string,
): Promise<WorkbenchFolderOption[] | null> {
  const parent = await prisma.contentWorkspace.findFirst({
    where: { id: parentWorkspaceId, ownerId, status: "active" },
    select: { id: true, viewRootContentId: true, settings: true },
  });
  if (!parent?.viewRootContentId) return null;

  const settings = normalizeWorkbenchSettings(normalizeSettings(parent.settings));
  if (!settings.enabled) return [];
  const hidden = new Set(settings.hiddenFolderIds);

  const [folders, existing] = await Promise.all([
    prisma.contentNode.findMany({
      where: {
        ownerId,
        parentId: parent.viewRootContentId,
        contentType: "folder",
        deletedAt: null,
      },
      select: { id: true, title: true },
      orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    }),
    prisma.contentWorkspace.findMany({
      where: { ownerId, parentWorkspaceId, status: "active" },
      select: { id: true, viewRootContentId: true },
    }),
  ]);

  const workbenchByFolder = new Map(
    existing
      .filter((row) => row.viewRootContentId)
      .map((row) => [row.viewRootContentId as string, row.id]),
  );

  // canNest = the depth budget allows another layer AND the folder actually
  // has subfolders. One grouped count for the whole row set.
  const nestable = new Set<string>();
  if (settings.maxDepth > 1 && folders.length > 0) {
    const childCounts = await prisma.contentNode.groupBy({
      by: ["parentId"],
      where: {
        ownerId,
        parentId: { in: folders.map((folder) => folder.id) },
        contentType: "folder",
        deletedAt: null,
      },
      _count: { _all: true },
    });
    for (const row of childCounts) {
      if (row.parentId) nestable.add(row.parentId);
    }
  }

  return applyWorkbenchFolderOrder(
    folders.map((folder) => ({
      folderId: folder.id,
      title: folder.title,
      workbenchId: workbenchByFolder.get(folder.id) ?? null,
      hidden: hidden.has(folder.id),
      canNest: nestable.has(folder.id),
    })),
    resolveFolderOrder(settings, parent.viewRootContentId, true),
  );
}

/**
 * Materialize-or-reuse the workbench for a folder within the view's nesting
 * budget (1-3 layers below the view root; the parent's `maxDepth` decides).
 *
 * Workbench rows stay FLAT regardless of the folder's depth — parent is
 * always the top workspace, never another workbench. Nesting is a property of
 * the MENU, not the data: keying benches off parent benches would force
 * materializing every ancestor just to browse a layer.
 *
 * Reuse covers three cases, in order: an active row (return it untouched, so
 * pane layouts survive), an ARCHIVED row (reactivate — a folder rescued from
 * trash gets its layout back), and the unique-constraint race (two clicks
 * before either commits; the loser re-reads the winner's row instead of
 * failing the user's click).
 */
export async function createWorkbench(
  ownerId: string,
  parentWorkspaceId: string,
  folderContentId: string,
): Promise<ContentWorkspaceResponse | null> {
  const parent = await prisma.contentWorkspace.findFirst({
    where: { id: parentWorkspaceId, ownerId, status: "active" },
    select: {
      id: true,
      name: true,
      slug: true,
      isMain: true,
      viewRootContentId: true,
      settings: true,
    },
  });
  // A workbench only exists under a VIEW workspace, and never under another
  // workbench: the submenu is one level deep by design.
  if (!parent?.viewRootContentId || parent.isMain) return null;
  const workbenchSettings = normalizeWorkbenchSettings(
    normalizeSettings(parent.settings),
  );
  if (!workbenchSettings.enabled) return null;

  // The folder must still sit within the view's nesting budget. Re-checked
  // server-side because the submenu the click came from may be seconds stale
  // — the folder can have moved or been trashed meanwhile.
  const folder = await prisma.contentNode.findFirst({
    where: {
      id: folderContentId,
      ownerId,
      contentType: "folder",
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
  if (!folder) return null;
  const hops = await folderHopsToAncestor(
    ownerId,
    folderContentId,
    parent.viewRootContentId,
    workbenchSettings.maxDepth,
  );
  if (hops === null) return null;

  const existing = await prisma.contentWorkspace.findFirst({
    where: { ownerId, parentWorkspaceId, viewRootContentId: folderContentId },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status !== "active") {
      await prisma.contentWorkspace.update({
        where: { id: existing.id },
        data: { status: "active", archivedAt: null, dormantAt: null },
      });
    }
    return getWorkspace(ownerId, existing.id);
  }

  const slug = await uniqueWorkspaceSlug(
    ownerId,
    `${parent.slug}-${folder.title}`,
  );

  try {
    const created = await prisma.contentWorkspace.create({
      data: {
        ownerId,
        // Stored only as a fallback for a dead row: formatWorkspace mirrors
        // the folder's live title, so renaming the folder renames the bench.
        name: folder.title,
        slug,
        isMain: false,
        parentWorkspaceId,
        viewRootContentId: folderContentId,
        layoutMode: DEFAULT_LAYOUT_MODE,
        activePaneId: DEFAULT_PANE_ID,
        paneState: {},
        settings: {},
      },
      select: { id: true },
    });
    return getWorkspace(ownerId, created.id);
  } catch (error) {
    // Unique violation = a concurrent click won. Hand back their row.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await prisma.contentWorkspace.findFirst({
        where: { ownerId, parentWorkspaceId, viewRootContentId: folderContentId },
        select: { id: true },
      });
      if (winner) return getWorkspace(ownerId, winner.id);
    }
    throw error;
  }
}

/**
 * Archive every workbench whose backing folder sits inside a deleted subtree.
 *
 * Archive, not delete: a folder rescued from trash should bring its workbench
 * back with pane layouts intact (createWorkbench reactivates on reuse). The
 * hard delete belongs to the purge path, once the content itself is gone.
 *
 * Called from the content delete cascade, so it must never throw into it.
 */
export async function archiveWorkbenchesForContent(
  ownerId: string,
  contentIds: string[],
): Promise<number> {
  if (contentIds.length === 0) return 0;
  const { count } = await prisma.contentWorkspace.updateMany({
    where: {
      ownerId,
      parentWorkspaceId: { not: null },
      status: "active",
      viewRootContentId: { in: contentIds },
    },
    data: { status: "archived", archivedAt: new Date() },
  });
  return count;
}

/**
 * Dormant-clearout sweep. Self-healing by design: dormancy is DERIVED here
 * each run (is the folder still a first-level child of the parent's view
 * root?) rather than stamped by write paths, so a missed hook delays a stamp
 * by a day instead of leaking a row forever.
 */
export async function sweepDormantWorkbenches(now: Date): Promise<{
  stamped: number;
  cleared: number;
  deleted: number;
}> {
  const workbenches = await prisma.contentWorkspace.findMany({
    where: { parentWorkspaceId: { not: null } },
    select: {
      id: true,
      ownerId: true,
      dormantAt: true,
      viewRootContentId: true,
      parentWorkspace: {
        select: { id: true, status: true, viewRootContentId: true, settings: true },
      },
    },
  });

  let stamped = 0;
  let cleared = 0;
  let deleted = 0;

  for (const workbench of workbenches) {
    const parent = workbench.parentWorkspace;
    let attached = false;
    if (
      parent?.viewRootContentId &&
      workbench.viewRootContentId &&
      parent.status === "active"
    ) {
      // Same walk createWorkbench uses: attached means reachable within the
      // parent's CURRENT depth budget, so lowering maxDepth from 3 to 1
      // makes deeper benches dormant rather than leaving them stranded live.
      const maxDepth = normalizeWorkbenchSettings(
        normalizeSettings(parent.settings),
      ).maxDepth;
      const hops = await folderHopsToAncestor(
        workbench.ownerId,
        workbench.viewRootContentId,
        parent.viewRootContentId,
        maxDepth,
      );
      attached = hops !== null;
    }

    if (attached) {
      if (workbench.dormantAt) {
        await prisma.contentWorkspace.update({
          where: { id: workbench.id },
          data: { dormantAt: null },
        });
        cleared += 1;
      }
      continue;
    }

    if (!workbench.dormantAt) {
      await prisma.contentWorkspace.update({
        where: { id: workbench.id },
        data: { dormantAt: now },
      });
      stamped += 1;
      continue;
    }

    const days = normalizeWorkbenchSettings(
      normalizeSettings(parent?.settings ?? {}),
    ).dormantClearoutDays;
    const expiresAt = new Date(
      workbench.dormantAt.getTime() + days * 24 * 60 * 60 * 1000,
    );
    if (now >= expiresAt) {
      await prisma.contentWorkspace.delete({ where: { id: workbench.id } });
      deleted += 1;
    }
  }

  return { stamped, cleared, deleted };
}

async function getAncestorIds(ownerId: string, contentId: string) {
  const ancestors: string[] = [];
  let current = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, deletedAt: null },
    select: { id: true, parentId: true },
  });

  while (current?.parentId) {
    const parent = await prisma.contentNode.findFirst({
      where: { id: current.parentId, ownerId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    if (!parent) break;
    ancestors.push(parent.id);
    current = parent;
  }

  return ancestors;
}

async function findOverlappingPrimaryRecursiveClaims(
  ownerId: string,
  workspaceId: string,
  contentId: string,
  excludeWorkspaceIds: string[] = [],
) {
  const ancestorIds = await getAncestorIds(ownerId, contentId);
  const claims = await prisma.contentWorkspaceItem.findMany({
    where: {
      assignmentType: "primary",
      scope: "recursive",
      workspaceId: {
        notIn: [workspaceId, ...excludeWorkspaceIds],
      },
      workspace: {
        ownerId,
        status: "active",
      },
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      content: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  const overlaps = [];

  for (const claim of claims) {
    if (
      claim.contentId === contentId ||
      ancestorIds.includes(claim.contentId)
    ) {
      overlaps.push(claim);
      continue;
    }

    const claimAncestorIds = await getAncestorIds(ownerId, claim.contentId);
    if (claimAncestorIds.includes(contentId)) {
      overlaps.push(claim);
    }
  }

  return overlaps;
}

export async function resolveOpenIntent(
  ownerId: string,
  workspaceId: string,
  contentId: string,
): Promise<WorkspaceOpenIntentResponse> {
  await ensureMainWorkspace(ownerId);

  const [workspace, content, currentAssignment] = await Promise.all([
    prisma.contentWorkspace.findFirst({
      where: { id: workspaceId, ownerId, status: "active" },
      select: {
        id: true,
        name: true,
        isMain: true,
        isLocked: true,
        viewRootContentId: true,
        viewRoot: { select: { id: true, title: true } },
      },
    }),
    prisma.contentNode.findFirst({
      where: { id: contentId, ownerId, deletedAt: null },
      select: {
        id: true,
        title: true,
        contentType: true,
        parentId: true,
        parent: {
          select: {
            id: true,
            title: true,
            contentType: true,
          },
        },
      },
    }),
    prisma.contentWorkspaceItem.findUnique({
      where: { workspaceId_contentId: { workspaceId, contentId } },
      select: { id: true },
    }),
  ]);

  if (!workspace) return { allowed: false, conflict: null };
  if (!content) return { allowed: false, conflict: null };

  // The Main Workspace is the permanent catchall — opens from it are never
  // gated by other workspaces' claims, and no claims are minted from it
  // (alreadyCovered suppresses the client's auto-assignment).
  if (workspace.isMain) {
    return { allowed: true, alreadyCovered: true, conflict: null };
  }

  if (currentAssignment) {
    return { allowed: true, alreadyCovered: true, conflict: null };
  }

  const ancestorIds = await getAncestorIds(ownerId, contentId);

  // A recursive claim held by THIS workspace on the content or any ancestor
  // (primary folder claim, or a borrow/share taken with folder scope) is a
  // standing decision covering the whole subtree — honor it before the view
  // scope and overlap checks, or the conflict dialog re-asks for every
  // descendant despite the user having chosen "apply to folder and all
  // descendants". Expired borrows are already pruned by
  // cleanupExpiredWorkspaces (via ensureMainWorkspace above), so any
  // surviving claim is live.
  const coveringClaim = await prisma.contentWorkspaceItem.findFirst({
    where: {
      workspaceId,
      scope: "recursive",
      contentId: { in: [contentId, ...ancestorIds] },
    },
    select: { id: true },
  });
  if (coveringClaim) {
    return { allowed: true, alreadyCovered: true, conflict: null };
  }

  // View scope enforcement: if active workspace is a view, content must be inside the view root subtree
  if (workspace.viewRootContentId) {
    const isInScope =
      contentId === workspace.viewRootContentId ||
      ancestorIds.includes(workspace.viewRootContentId);

    if (!isInScope) {
      const folderScopeCandidate =
        content.contentType === "folder"
          ? { id: content.id, title: content.title }
          : content.parent?.contentType === "folder"
            ? { id: content.parent.id, title: content.parent.title }
            : null;

      return {
        allowed: false,
        conflict: {
          conflictType: "viewScope",
          workspaceId,
          workspaceName: workspace.name,
          contentId: content.id,
          contentTitle: content.title,
          claimContentId: workspace.viewRootContentId,
          claimContentTitle: workspace.viewRoot?.title ?? "View root",
          scope: "recursive",
          folderScopeContentId: folderScopeCandidate?.id ?? null,
          folderScopeContentTitle: folderScopeCandidate?.title ?? null,
        },
      };
    }
  }

  const claimFilters: Prisma.ContentWorkspaceItemWhereInput[] = [
    { contentId, scope: "item" },
    { contentId, scope: "recursive" },
  ];
  if (ancestorIds.length > 0) {
    claimFilters.push({
      contentId: { in: ancestorIds },
      scope: "recursive",
    });
  }

  const candidates = await prisma.contentWorkspaceItem.findMany({
    where: {
      assignmentType: "primary",
      workspaceId: { not: workspaceId },
      workspace: {
        ownerId,
        isLocked: true,
        status: "active",
      },
      OR: claimFilters,
    },
    include: {
      workspace: true,
      content: {
        select: { id: true, title: true, contentType: true, parentId: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });

  // Downstream sharing: if active workspace is a view, its viewRoot's ancestor chain
  // is used to exempt claims where the active view is downstream of the claiming workspace.
  let viewRootAncestorIds: string[] | null = null;
  if (workspace.viewRootContentId) {
    viewRootAncestorIds = await getAncestorIds(
      ownerId,
      workspace.viewRootContentId,
    );
  }

  let claim: (typeof candidates)[number] | undefined;
  for (const candidate of candidates) {
    const isActive =
      candidate.scope === "recursive" ||
      workspaceStateHasContent(candidate.workspace, candidate.contentId);
    if (!isActive) continue;

    // Downstream sharing exception: active view's root is inside the claiming workspace's
    // recursive scope → allow opening (vertically downstream overlap is permitted)
    if (
      candidate.scope === "recursive" &&
      viewRootAncestorIds !== null &&
      workspace.viewRootContentId &&
      (viewRootAncestorIds.includes(candidate.contentId) ||
        workspace.viewRootContentId === candidate.contentId)
    ) {
      continue;
    }

    // Nested-view exception: the claiming workspace is a view rooted strictly
    // above this view's root, so this view is a carve-out of that workspace's
    // area. The content already passed view-scope enforcement, so it belongs
    // to both views at once — the parent view's claims here (tab or folder)
    // are vertical overlap by construction, not duplicate work. Same-root
    // views still warn: that is horizontal duplication, not nesting.
    if (
      viewRootAncestorIds !== null &&
      candidate.workspace.viewRootContentId &&
      viewRootAncestorIds.includes(candidate.workspace.viewRootContentId)
    ) {
      continue;
    }

    claim = candidate;
    break;
  }
  if (!claim) return { allowed: true, conflict: null };

  const folderScopeCandidate =
    claim.scope === "recursive"
      ? {
          id: claim.content.id,
          title: claim.content.title,
        }
      : content.contentType === "folder"
        ? {
            id: content.id,
            title: content.title,
          }
        : content.parent && content.parent.contentType === "folder"
          ? {
              id: content.parent.id,
              title: content.parent.title,
            }
          : null;

  return {
    allowed: false,
    conflict: {
      conflictType: "overlap",
      workspaceId: claim.workspaceId,
      workspaceName: claim.workspace.name,
      contentId: content.id,
      contentTitle: content.title,
      claimContentId: claim.contentId,
      claimContentTitle: claim.content.title,
      scope: claim.scope,
      folderScopeContentId: folderScopeCandidate?.id ?? null,
      folderScopeContentTitle: folderScopeCandidate?.title ?? null,
    },
  };
}

export async function assignContentToWorkspace(
  ownerId: string,
  workspaceId: string,
  contentId: string,
  options: {
    assignmentType: ContentWorkspaceItemAssignmentType;
    scope?: ContentWorkspaceItemScope;
    expiresAt?: string | null;
    moveFromWorkspaceId?: string | null;
  },
) {
  const [workspace, content] = await Promise.all([
    prisma.contentWorkspace.findFirst({
      where: { id: workspaceId, ownerId, status: "active" },
      select: { id: true },
    }),
    prisma.contentNode.findFirst({
      where: { id: contentId, ownerId, deletedAt: null },
      select: { id: true },
    }),
  ]);

  if (!workspace || !content) return null;

  if (
    options.assignmentType === "primary" &&
    (options.scope ?? "item") === "recursive"
  ) {
    const overlaps = await findOverlappingPrimaryRecursiveClaims(
      ownerId,
      workspaceId,
      contentId,
      options.moveFromWorkspaceId ? [options.moveFromWorkspaceId] : [],
    );

    if (overlaps.length > 0) {
      const labels = overlaps
        .map((claim) => `${claim.workspace.name} (${claim.content.title})`)
        .slice(0, 3)
        .join(", ");
      throw new Error(
        `This folder overlaps with existing workspace claims: ${labels}. Resolve the overlap before saving.`,
      );
    }
  }

  const expiresAt =
    options.assignmentType === "borrowed" && options.expiresAt
      ? new Date(options.expiresAt)
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.contentWorkspaceItem.upsert({
      where: {
        workspaceId_contentId: {
          workspaceId,
          contentId,
        },
      },
      update: {
        assignmentType: options.assignmentType,
        scope: options.scope ?? "item",
        expiresAt,
      },
      create: {
        workspaceId,
        contentId,
        assignmentType: options.assignmentType,
        scope: options.scope ?? "item",
        expiresAt,
      },
    });

    if (
      options.moveFromWorkspaceId &&
      options.moveFromWorkspaceId !== workspaceId
    ) {
      await tx.contentWorkspaceItem.deleteMany({
        where: {
          workspaceId: options.moveFromWorkspaceId,
          contentId,
          workspace: { ownerId },
        },
      });
    }
  });

  return getWorkspace(ownerId, workspaceId);
}

export async function unassignContentFromWorkspace(
  ownerId: string,
  workspaceId: string,
  contentId: string,
) {
  await prisma.contentWorkspaceItem.deleteMany({
    where: {
      workspaceId,
      contentId,
      workspace: {
        ownerId,
        isMain: false,
      },
    },
  });

  return getWorkspace(ownerId, workspaceId);
}
