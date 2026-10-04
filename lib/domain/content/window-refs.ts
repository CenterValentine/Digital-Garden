/**
 * Note Window Reference Extraction + Sync
 *
 * Extracts `noteWindow` block targets from TipTap JSON and syncs ContentLink
 * records (linkType "window-ref") so windowed notes have a queryable edge
 * graph — consumed by the file tree to surface a note's windowed targets in
 * its Reference Drawer without walking every note body per request.
 *
 * Deliberately SIMPLER than image-refs.ts, not a variant of it:
 *  - No ref-count-gated cleanup and no soft-delete. A window's target is a
 *    real user note living at its own tree location; removing the window must
 *    never touch the target. Media refs own their targets — windows only
 *    point at theirs.
 *  - No userId needed, for the same reason: nothing here mutates ContentNode.
 *
 * Freshness contract: edges are derived from note content on every save and
 * are self-healing — a retargeted or deleted window rewrites its edges on the
 * next save that runs this sync. Callers cover all three write paths: the
 * REST PATCH route, the browser-extension apply path, and the collaboration
 * store hook (the primary path — Y.js-first writes never hit the REST route).
 */

// NOTE: client-reachable via transitive imports — see tag-sync.ts header.
import type { JSONContent } from "@tiptap/core";
import type { PrismaClient } from "@/lib/database/generated/prisma";

export const WINDOW_REF_LINK_TYPE = "window-ref";

/**
 * Distinct note ids targeted by `noteWindow` blocks anywhere in a document.
 * Unassigned windows (targetContentId null — user is mid-picking) carry no
 * edge, and a note windowing itself is dropped: a self-edge would render the
 * note inside its own drawer, which informs nobody.
 */
export function extractNoteWindowTargetIds(
  doc: JSONContent,
  hostNoteId: string,
): string[] {
  const ids = new Set<string>();
  function walk(node: JSONContent) {
    if (node.type === "noteWindow") {
      const targetId = (node.attrs as { targetContentId?: string | null } | undefined)
        ?.targetContentId;
      if (targetId && targetId !== hostNoteId) {
        ids.add(targetId);
      }
    }
    if (node.content) {
      for (const child of node.content) walk(child);
    }
  }
  walk(doc);
  return [...ids];
}

/**
 * Sync window-ref edges for a note after save: create edges for new window
 * targets, delete edges whose window was removed or retargeted. Never touches
 * the target nodes themselves.
 *
 * Takes the Prisma client as a parameter (unlike image-refs' singleton)
 * because one caller is the collaboration store hook, which runs inside the
 * Hocuspocus server with its own client instance.
 *
 * Non-throwing: logs errors but does not propagate them (ref syncing is not
 * critical enough to fail the save).
 */
export async function syncWindowReferences(
  prisma: PrismaClient,
  noteId: string,
  tiptapJson: JSONContent,
): Promise<void> {
  try {
    const currentIds = extractNoteWindowTargetIds(tiptapJson, noteId);
    const currentIdSet = new Set(currentIds);

    const existingLinks = await prisma.contentLink.findMany({
      where: { sourceId: noteId, linkType: WINDOW_REF_LINK_TYPE },
      select: { id: true, targetId: true },
    });
    const existingTargetIds = new Set(existingLinks.map((l) => l.targetId));

    const orphanedLinkIds = existingLinks
      .filter((l) => !currentIdSet.has(l.targetId))
      .map((l) => l.id);
    const newIds = currentIds.filter((id) => !existingTargetIds.has(id));

    if (orphanedLinkIds.length > 0) {
      await prisma.contentLink.deleteMany({
        where: { id: { in: orphanedLinkIds } },
      });
    }

    let addedCount = 0;
    if (newIds.length > 0) {
      // Windows can target ids the user typed or pasted, so targets are
      // validated before insert: a nonexistent id would trip the FK, and a
      // target belonging to ANOTHER owner must never get an edge. Such an
      // edge would be inert today — the tree route only renders nodes it
      // fetched for the current owner — but an edge crossing a tenancy
      // boundary is a trap for the next consumer that reads this link type
      // without scoping. Host and targets are fetched in one query so the
      // ownership check costs nothing extra.
      const rows = await prisma.contentNode.findMany({
        where: { id: { in: [noteId, ...newIds] }, deletedAt: null },
        select: { id: true, ownerId: true },
      });
      const hostOwnerId = rows.find((row) => row.id === noteId)?.ownerId;
      const validTargets = hostOwnerId
        ? rows.filter((row) => row.id !== noteId && row.ownerId === hostOwnerId)
        : [];

      if (validTargets.length > 0) {
        const { count } = await prisma.contentLink.createMany({
          data: validTargets.map(({ id }) => ({
            sourceId: noteId,
            targetId: id,
            linkType: WINDOW_REF_LINK_TYPE,
          })),
          skipDuplicates: true, // Respect @@unique([sourceId, targetId, linkType])
        });
        addedCount = count;
      }
    }

    if (orphanedLinkIds.length > 0 || addedCount > 0) {
      // Reports rows actually written, not candidates found — targets
      // rejected as dead or cross-owner must not inflate the count.
      console.log(
        `[syncWindowReferences] note=${noteId}: +${addedCount} -${orphanedLinkIds.length} window refs`,
      );
    }
  } catch (error) {
    console.error("[syncWindowReferences] Error:", error);
    // Don't throw — window ref syncing is not critical enough to fail the save.
  }
}
