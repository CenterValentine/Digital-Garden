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

function normalizeSettings(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function formatWorkspace(workspace: WorkspaceWithItems): ContentWorkspaceResponse {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    isMain: workspace.isMain,
    isLocked: workspace.isLocked,
    status: workspace.status,
    expiresAt: workspace.expiresAt?.toISOString() ?? null,
    archivedAt: workspace.archivedAt?.toISOString() ?? null,
    layoutMode: normalizeWorkspaceState(workspace).layoutMode,
    activePaneId: normalizeWorkspaceState(workspace).activePaneId,
    paneState: normalizeWorkspaceState(workspace),
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
        include: {
          content: {
            select: { id: true, title: true, contentType: true, parentId: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
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
        include: {
          content: {
            select: { id: true, title: true, contentType: true, parentId: true },
          },
        },
      },
    },
  });

  return formatWorkspace(workspace);
}

export async function updateWorkspace(
  ownerId: string,
  workspaceId: string,
  updates: {
    name?: string;
    isLocked?: boolean;
    expiresAt?: string | null;
    settings?: Record<string, unknown>;
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

  const workspace = await prisma.contentWorkspace.update({
    where: { id: workspaceId },
    data,
    include: {
      items: {
        include: {
          content: {
            select: { id: true, title: true, contentType: true, parentId: true },
          },
        },
      },
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
  state: WorkspaceStatePayload
) {
  const workspace = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId, status: "active" },
  });

  if (!workspace) return null;

  const contentIds = getStateContentIds(state);

  await prisma.$transaction(async (tx) => {
    await tx.contentWorkspace.update({
      where: { id: workspaceId },
      data: {
        layoutMode: state.layoutMode,
        activePaneId: state.activePaneId,
        paneState: state as unknown as Prisma.InputJsonValue,
      },
    });

    if (contentIds.length === 0) return;

    const ownedContent = await tx.contentNode.findMany({
      where: { ownerId, id: { in: contentIds }, deletedAt: null },
      select: { id: true },
    });

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

export async function resolveOpenIntent(
  ownerId: string,
  workspaceId: string,
  contentId: string
): Promise<WorkspaceOpenIntentResponse> {
  await ensureMainWorkspace(ownerId);

  const [content, currentAssignment] = await Promise.all([
    prisma.contentNode.findFirst({
      where: { id: contentId, ownerId, deletedAt: null },
      select: { id: true, title: true },
    }),
    prisma.contentWorkspaceItem.findUnique({
      where: { workspaceId_contentId: { workspaceId, contentId } },
      select: { id: true },
    }),
  ]);

  if (!content) return { allowed: false, conflict: null };
  if (currentAssignment) return { allowed: true, conflict: null };

  const ancestorIds = await getAncestorIds(ownerId, contentId);
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
        select: { id: true, title: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 1,
  });

  const claim = candidates[0];
  if (!claim) return { allowed: true, conflict: null };

  return {
    allowed: false,
    conflict: {
      workspaceId: claim.workspaceId,
      workspaceName: claim.workspace.name,
      contentId: content.id,
      contentTitle: content.title,
      claimContentId: claim.contentId,
      claimContentTitle: claim.content.title,
      scope: claim.scope,
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
