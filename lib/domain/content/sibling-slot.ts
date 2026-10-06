import "server-only";

/**
 * The database side of sibling order: the per-list lock, and claiming a slot
 * for a row arriving in a list (`slotForArrival` decides; this applies it).
 *
 * Every writer that places a row among its siblings takes the same advisory
 * lock — the move route, uploads, the Folder assistant, Studio outputs — so
 * two of them can't read the same list and write over each other. The lock is
 * transaction-scoped: call these inside `prisma.$transaction(async (tx) => …)`
 * and do the row's own write in that same transaction.
 */
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import {
  compareSiblings,
  isFolderLike,
  parseKeptSort,
  slotForArrival,
  type ArrivalPlacement,
  type KeptSort,
  type LevelSortRow,
} from "@/lib/domain/content/sibling-order";

type Tx = Prisma.TransactionClient;

/** The advisory-lock key for one owner's list of siblings under `parentId`. */
function siblingOrderLockKey(ownerId: string, parentId: string | null): string {
  return `sibling-order:${ownerId}:${parentId ?? "root"}`;
}

/**
 * Lock the order of each list named (null = the owner's top level) until the
 * transaction ends. Sorted, so two writers needing the same pair of locks
 * always take them in the same order and can't deadlock.
 */
export async function lockSiblingOrder(
  tx: Tx,
  ownerId: string,
  parentIds: ReadonlyArray<string | null>,
): Promise<void> {
  const keys = [...new Set(parentIds)].map((id) => siblingOrderLockKey(ownerId, id)).sort();
  for (const key of keys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

/**
 * Write new displayOrders in one statement, without `updatedAt` — reordering
 * is not editing (sibling-order.ts `renumbering`).
 */
export async function applyRenumbering(
  tx: Tx,
  changes: ReadonlyArray<{ id: string; displayOrder: number }>,
): Promise<void> {
  if (changes.length === 0) return;
  await tx.$executeRaw`
    UPDATE "ContentNode" AS node
    SET "displayOrder" = renumbered.position
    FROM unnest(
      ${changes.map((change) => change.id)}::uuid[],
      ${changes.map((change) => change.displayOrder)}::int[]
    ) AS renumbered(id, position)
    WHERE node.id = renumbered.id`;
}

/**
 * Claim the displayOrder for a row arriving under `parentId` (null = top
 * level) at `placement`, shifting siblings when it goes between them. Locks
 * the list; write the row in the same transaction.
 *
 * `arrivingId`: the row being filed, when it already exists — left out of the
 * siblings if it is already in this list. Omit it for a row about to be
 * created.
 */
export async function claimSiblingSlot(
  tx: Tx,
  args: {
    ownerId: string;
    parentId: string | null;
    placement: ArrivalPlacement;
    arrivingId?: string;
    /** People-scoped content (a top-level row filed under a group or person) is ordered among that scope. */
    peopleGroupId?: string | null;
    personId?: string | null;
  },
): Promise<number> {
  const { ownerId, parentId, placement, arrivingId, peopleGroupId, personId } = args;
  await lockSiblingOrder(tx, ownerId, [parentId]);
  const siblings = await tx.contentNode.findMany({
    where: {
      parentId,
      ownerId,
      deletedAt: null,
      ...(peopleGroupId ? { peopleGroupId } : {}),
      ...(personId ? { personId } : {}),
      ...(arrivingId ? { id: { not: arrivingId } } : {}),
    },
    select: { id: true, title: true, displayOrder: true },
  });
  siblings.sort(compareSiblings);
  const slot = slotForArrival(siblings, placement, arrivingId ?? "new-row");
  await applyRenumbering(tx, slot.changes);
  return slot.displayOrder;
}

/**
 * Put a row that already exists in its list at `placement` — for a writer
 * that creates or re-parents the row first (Studio outputs). The number is
 * written like any renumbering: without `updatedAt`.
 */
export async function placeExistingRow(args: {
  ownerId: string;
  rowId: string;
  parentId: string | null;
  placement: ArrivalPlacement;
}): Promise<void> {
  const { ownerId, rowId, parentId, placement } = args;
  await prisma.$transaction(async (tx) => {
    const displayOrder = await claimSiblingSlot(tx, { ownerId, parentId, placement, arrivingId: rowId });
    await applyRenumbering(tx, [{ id: rowId, displayOrder }]);
  });
}

// ── A folder's remembered sort (sibling-order.ts `KeptSort`) ────────────────

/** The sort `folderId` keeps, or null (no memory; the top level never has one). */
export async function readKeptSort(tx: Tx, ownerId: string, folderId: string | null): Promise<KeptSort | null> {
  if (!folderId) return null;
  const payload = await tx.folderPayload.findFirst({
    where: { contentId: folderId, content: { ownerId, deletedAt: null } },
    select: { viewPrefs: true },
  });
  const prefs = payload?.viewPrefs as { treeSort?: unknown } | null | undefined;
  return parseKeptSort(prefs?.treeSort);
}

/** Remember `kept` on the folder (null forgets it). Other view prefs are kept. */
export async function writeKeptSort(tx: Tx, folderId: string, kept: KeptSort | null): Promise<void> {
  const existing = await tx.folderPayload.findUnique({
    where: { contentId: folderId },
    select: { viewPrefs: true },
  });
  const prefs = { ...((existing?.viewPrefs as Record<string, unknown> | null) ?? {}) };
  if (kept) prefs.treeSort = kept;
  else delete prefs.treeSort;
  const viewPrefs = prefs as Prisma.InputJsonValue;
  await tx.folderPayload.upsert({
    where: { contentId: folderId },
    update: { viewPrefs },
    create: { contentId: folderId, viewPrefs },
  });
}

/**
 * The live rows directly under `parentId`, in `compareSiblings` order, with
 * what a sort reads: folder-likeness (a folder, or a shortcut to a live one)
 * and whether each holds other items (live primary children — a note's
 * attachments are stored in its folder, so they don't count).
 */
export async function loadLevelRows(tx: Tx, ownerId: string, parentId: string | null): Promise<LevelSortRow[]> {
  const siblings = await tx.contentNode.findMany({
    where: { parentId, ownerId, deletedAt: null },
    select: {
      id: true,
      title: true,
      displayOrder: true,
      contentType: true,
      shortcutPayload: {
        select: {
          targetContentId: true,
          target: { select: { contentType: true, deletedAt: true } },
        },
      },
      _count: { select: { children: { where: { deletedAt: null, role: "primary" } } } },
    },
  });
  siblings.sort(compareSiblings);
  return siblings.map((sibling) => ({
    id: sibling.id,
    title: sibling.title,
    displayOrder: sibling.displayOrder,
    folderLike: isFolderLike({
      contentType: sibling.contentType,
      shortcut: sibling.shortcutPayload
        ? {
            targetId: sibling.shortcutPayload.targetContentId,
            targetDeleted: Boolean(sibling.shortcutPayload.target?.deletedAt),
            targetContentType: sibling.shortcutPayload.target?.contentType ?? null,
          }
        : null,
    }),
    nested: sibling._count.children > 0,
  }));
}
