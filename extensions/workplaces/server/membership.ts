/**
 * Workspace tab membership (layout-intent spec R1).
 *
 * Membership is the always-synced, workspace-scoped SET of open content —
 * deliberately separate from pane placement and order, which live in
 * per-family layout records. Open events upsert here; close events delete;
 * every session of a workspace converges on this set regardless of surface.
 *
 * Affinity is a placement HINT captured from the pane the content was opened
 * into, consumed by the ordinal compatibility layer (spec §4) when another
 * layout has to land the tab. It is set at open and left alone afterwards —
 * snapshot reconciles do not churn it.
 */

import { prisma } from "@/lib/database/client";
import type { WorkspacePaneId } from "./types";

export type WorkspaceTabAffinityH = "left" | "right";
export type WorkspaceTabAffinityV = "top" | "bottom";

export interface WorkspaceTabAffinity {
  h: WorkspaceTabAffinityH | null;
  v: WorkspaceTabAffinityV | null;
}

/** Pane → affinity capture (spec §4: quadrant decomposed into both axes). */
export function affinityForPane(paneId: WorkspacePaneId): WorkspaceTabAffinity {
  switch (paneId) {
    case "top-left":
      return { h: "left", v: "top" };
    case "top-right":
      return { h: "right", v: "top" };
    case "bottom-left":
      return { h: "left", v: "bottom" };
    case "bottom-right":
      return { h: "right", v: "bottom" };
  }
}

function normalizeAffinity(value: unknown): WorkspaceTabAffinity {
  if (typeof value !== "object" || value === null) return { h: null, v: null };
  const record = value as Record<string, unknown>;
  return {
    h: record.h === "left" || record.h === "right" ? record.h : null,
    v: record.v === "top" || record.v === "bottom" ? record.v : null,
  };
}

async function findOwnedActiveWorkspace(ownerId: string, workspaceId: string) {
  return prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId, status: "active" },
    select: { id: true },
  });
}

/**
 * Open event: idempotently add content to the workspace's membership set.
 * Ownership of both the workspace and the content is enforced; re-opening
 * updates the affinity hint (the user expressed a fresh placement).
 */
export async function openWorkspaceTab(
  ownerId: string,
  workspaceId: string,
  contentId: string,
  affinity?: unknown,
) {
  const workspace = await findOwnedActiveWorkspace(ownerId, workspaceId);
  if (!workspace) return null;

  const content = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!content) return null;

  const { h, v } = normalizeAffinity(affinity);
  return prisma.contentWorkspaceTab.upsert({
    where: { workspaceId_contentId: { workspaceId, contentId } },
    create: { workspaceId, contentId, affinityH: h, affinityV: v },
    update: { affinityH: h, affinityV: v },
  });
}

/**
 * Close event: idempotently remove content from the membership set.
 * Returns null only when the workspace itself isn't the owner's; a close
 * for a tab that's already gone is a success (count 0).
 */
export async function closeWorkspaceTab(
  ownerId: string,
  workspaceId: string,
  contentId: string,
) {
  const workspace = await findOwnedActiveWorkspace(ownerId, workspaceId);
  if (!workspace) return null;

  return prisma.contentWorkspaceTab.deleteMany({
    where: { workspaceId, contentId },
  });
}

export async function listWorkspaceTabs(ownerId: string, workspaceId: string) {
  const workspace = await findOwnedActiveWorkspace(ownerId, workspaceId);
  if (!workspace) return null;

  return prisma.contentWorkspaceTab.findMany({
    where: { workspaceId, content: { ownerId, deletedAt: null } },
    orderBy: { addedAt: "asc" },
    select: {
      contentId: true,
      affinityH: true,
      affinityV: true,
      isPinned: true,
      addedAt: true,
    },
  });
}

/**
 * Rollout dual-write (spec §8 P1): legacy clients persist full
 * WorkspaceStatePayload snapshots; membership is reconciled to the snapshot's
 * tab union so old and new clients agree on R1 truth. Creates missing rows
 * (with pane-derived affinity), deletes rows absent from the snapshot, and
 * leaves existing rows' affinity untouched. Caller has already verified
 * workspace ownership and filtered content ids to owned, live content.
 *
 * `additive: true` skips deletion — for surfaces whose snapshot is a NARROW
 * view of the workspace (the extension side panel projects to few panes),
 * so their opens must reach membership without pruning tabs that only wider
 * surfaces have open.
 */
export async function reconcileMembershipFromSnapshot(
  workspaceId: string,
  paneContentIds: Partial<Record<WorkspacePaneId, string[]>>,
  options: { additive?: boolean } = {},
) {
  const desired = new Map<string, WorkspaceTabAffinity>();
  for (const [paneId, contentIds] of Object.entries(paneContentIds)) {
    if (!contentIds) continue;
    const affinity = affinityForPane(paneId as WorkspacePaneId);
    for (const contentId of contentIds) {
      if (!desired.has(contentId)) desired.set(contentId, affinity);
    }
  }

  const existing = await prisma.contentWorkspaceTab.findMany({
    where: { workspaceId },
    select: { contentId: true },
  });
  const have = new Set(existing.map((row) => row.contentId));

  const toCreate = [...desired.entries()].filter(([id]) => !have.has(id));
  const toDelete = options.additive
    ? []
    : [...have].filter((id) => !desired.has(id));
  if (!toCreate.length && !toDelete.length) return;

  await prisma.$transaction([
    ...(toCreate.length
      ? [
          prisma.contentWorkspaceTab.createMany({
            data: toCreate.map(([contentId, affinity]) => ({
              workspaceId,
              contentId,
              affinityH: affinity.h,
              affinityV: affinity.v,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...(toDelete.length
      ? [
          prisma.contentWorkspaceTab.deleteMany({
            where: { workspaceId, contentId: { in: toDelete } },
          }),
        ]
      : []),
  ]);
}

/**
 * Membership-only sync for surfaces that must NOT write workspace layout
 * (extension iframes — spec §6.3). Takes the surface's pane snapshot, filters
 * content ids to the owner's live content, and reconciles membership
 * ADDITIVELY: the panel is a narrow projection, so it may add tabs it opened
 * but never prune tabs only wider surfaces have open. Explicit closes are
 * their own event (closeWorkspaceTab), not inferred from absence.
 *
 * Fixes the prod R1 gap where extension-originated opens were invisible to
 * other surfaces: the ext:* persist path bypasses the legacy PATCH (correctly,
 * for layout) and thus bypassed the dual-write that carried membership.
 */
export async function syncMembershipFromSurfaceSnapshot(
  ownerId: string,
  workspaceId: string,
  paneContentIds: unknown,
) {
  const workspace = await findOwnedActiveWorkspace(ownerId, workspaceId);
  if (!workspace) return null;

  const requested: Partial<Record<WorkspacePaneId, string[]>> = {};
  const allIds = new Set<string>();
  if (typeof paneContentIds === "object" && paneContentIds !== null) {
    for (const [paneId, ids] of Object.entries(
      paneContentIds as Record<string, unknown>,
    )) {
      if (!Array.isArray(ids)) continue;
      const clean = ids.filter((id): id is string => typeof id === "string");
      requested[paneId as WorkspacePaneId] = clean;
      for (const id of clean) allIds.add(id);
    }
  }
  if (!allIds.size) return { added: 0 };

  const owned = await prisma.contentNode.findMany({
    where: { id: { in: [...allIds] }, ownerId, deletedAt: null },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((row) => row.id));
  const filtered: Partial<Record<WorkspacePaneId, string[]>> = {};
  for (const [paneId, ids] of Object.entries(requested)) {
    filtered[paneId as WorkspacePaneId] = (ids ?? []).filter((id) =>
      ownedSet.has(id),
    );
  }

  const before = await prisma.contentWorkspaceTab.count({ where: { workspaceId } });
  await reconcileMembershipFromSnapshot(workspaceId, filtered, { additive: true });
  const after = await prisma.contentWorkspaceTab.count({ where: { workspaceId } });
  const added = after - before;

  // Other surfaces detect change via ContentWorkspace.updatedAt (the client
  // reconcile is keyed on it). Membership rows live in their own table, so a
  // membership-only change would otherwise never trigger anyone's refresh —
  // bump the workspace's timestamp when membership actually changed. Honest:
  // the workspace's synced state did change.
  if (added !== 0) {
    await prisma.contentWorkspace.update({
      where: { id: workspaceId },
      data: { updatedAt: new Date() },
    });
  }
  return { added };
}
