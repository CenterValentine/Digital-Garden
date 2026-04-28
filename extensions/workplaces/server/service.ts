import { prisma } from "@/lib/database/client";
import {
  ContentWorkspaceItemAssignmentType,
  ContentWorkspaceItemScope,
  type ContentWorkspace,
  type ContentWorkspaceItem,
  type ContentNode,
  type Prisma,
} from "@/lib/database/generated/prisma";
import { generateSlug } from "@/lib/domain/content";
import type {
  ContentWorkspaceResponse,
  WorkspaceOpenIntentResponse,
  WorkspacePaneId,
  WorkspacePaneSnapshot,
  WorkspaceStatePayload,
  WorkspacePaneStatePayload,
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
};

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

function normalizeWorkspaceState(workspace: ContentWorkspace): WorkspaceStatePayload {
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
              (contentId): contentId is string => typeof contentId === "string"
            )
          )
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
      typeof rawState.activeContentId === "string" ? rawState.activeContentId : null,
    paneTabContentIds,
  };
}

function filterWorkspaceStateToContentIds(
  state: WorkspaceStatePayload,
  allowedContentIds: Set<string>
): WorkspaceStatePayload {
  const paneTabContentIds: WorkspacePaneStatePayload = {};

  for (const paneId of WORKSPACE_PANE_IDS) {
    const pane = state.paneTabContentIds[paneId];
    const contentIds = (pane?.contentIds ?? []).filter((contentId) =>
      allowedContentIds.has(contentId)
    );
    const activeContentId =
      pane?.activeContentId && allowedContentIds.has(pane.activeContentId)
        ? pane.activeContentId
        : contentIds[0] ?? null;

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
        : paneTabContentIds[state.activePaneId]?.activeContentId ?? null,
    paneTabContentIds,
  };
}

function normalizeSettings(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function workspaceStateHasContent(
  workspace: Pick<ContentWorkspace, "paneState" | "layoutMode" | "activePaneId">,
  contentId: string
) {
  const normalizedState = normalizeWorkspaceState(workspace as ContentWorkspace);

  if (normalizedState.activeContentId === contentId) return true;

  return Object.values(normalizedState.paneTabContentIds).some((pane) => {
    if (!pane) return false;
    return (
      pane.activeContentId === contentId ||
      (pane.contentIds ?? []).includes(contentId)
    );
  });
}

export function formatWorkspace(workspace: WorkspaceWithItems): ContentWorkspaceResponse {
  const normalizedState = normalizeWorkspaceState(workspace);
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    isMain: workspace.isMain,
    isLocked: workspace.isLocked,
    isView: workspace.viewRootContentId !== null,
    viewRootContentId: workspace.viewRootContentId ?? null,
    viewRoot: workspace.viewRoot
      ? { id: workspace.viewRoot.id, title: workspace.viewRoot.title }
      : null,
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
  };
}

async function uniqueWorkspaceSlug(ownerId: string, name: string, excludeId?: string) {
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
    },
    orderBy: [{ isMain: "desc" }, { updatedAt: "desc" }],
  });

  return workspaces.map(formatWorkspace);
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
            select: { id: true, title: true, contentType: true, parentId: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
      viewRoot: { select: { id: true, title: true } },
    },
  });

  return workspace ? formatWorkspace(workspace) : null;
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
            select: { id: true, title: true, contentType: true, parentId: true },
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
  name?: string
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
              select: { id: true, title: true, contentType: true, parentId: true },
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
              select: { id: true, title: true, contentType: true, parentId: true },
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
  }
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
            select: { id: true, title: true, contentType: true, parentId: true },
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

export async function saveWorkspaceState(
  ownerId: string,
  workspaceId: string,
  state: unknown
) {
  const workspace = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId, status: "active" },
  });

  if (!workspace) return null;

  const normalizedState = normalizeWorkspaceStatePayload(state);
  const requestedContentIds = getStateContentIds(normalizedState);
  const ownedContent = requestedContentIds.length
    ? await prisma.contentNode.findMany({
        where: { ownerId, id: { in: requestedContentIds }, deletedAt: null },
        select: { id: true },
      })
    : [];
  const allowedContentIds = new Set(ownedContent.map((content) => content.id));
  const filteredState = filterWorkspaceStateToContentIds(normalizedState, allowedContentIds);
  const contentIds = getStateContentIds(filteredState);

  await prisma.$transaction(async (tx) => {
    await tx.contentWorkspace.update({
      where: { id: workspaceId },
      data: {
        layoutMode: filteredState.layoutMode,
        activePaneId: filteredState.activePaneId,
        paneState: filteredState as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.contentWorkspaceItem.deleteMany({
      where: {
        workspaceId,
        assignmentType: "primary",
        scope: "item",
        contentId: contentIds.length > 0 ? { notIn: contentIds } : undefined,
      },
    });

    if (contentIds.length === 0) return;

    await Promise.all(
      ownedContent.map((content) =>
        tx.contentWorkspaceItem.upsert({
          where: {
            workspaceId_contentId: {
              workspaceId,
              contentId: content.id,
            },
          },
          update: {},
          create: {
            workspaceId,
            contentId: content.id,
            assignmentType: "primary",
            scope: "item",
          },
        })
      )
    );
  });

  return getWorkspace(ownerId, workspaceId);
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
  excludeWorkspaceIds: string[] = []
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
    if (claim.contentId === contentId || ancestorIds.includes(claim.contentId)) {
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
  contentId: string
): Promise<WorkspaceOpenIntentResponse> {
  await ensureMainWorkspace(ownerId);

  const [workspace, content, currentAssignment] = await Promise.all([
    prisma.contentWorkspace.findFirst({
      where: { id: workspaceId, ownerId, status: "active" },
      select: {
        id: true,
        name: true,
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
  if (currentAssignment) return { allowed: true, conflict: null };

  const ancestorIds = await getAncestorIds(ownerId, contentId);

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
    viewRootAncestorIds = await getAncestorIds(ownerId, workspace.viewRootContentId);
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
  }
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
      options.moveFromWorkspaceId ? [options.moveFromWorkspaceId] : []
    );

    if (overlaps.length > 0) {
      const labels = overlaps
        .map((claim) => `${claim.workspace.name} (${claim.content.title})`)
        .slice(0, 3)
        .join(", ");
      throw new Error(
        `This folder overlaps with existing workspace claims: ${labels}. Resolve the overlap before saving.`
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

    if (options.moveFromWorkspaceId && options.moveFromWorkspaceId !== workspaceId) {
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
  contentId: string
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
