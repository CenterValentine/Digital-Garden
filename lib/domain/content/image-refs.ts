/**
 * Media Reference Extraction + Sync
 *
 * Extracts embedded media contentIds (images + audio) from TipTap JSON and
 * syncs ContentLink records so generated/referenced media has a usage graph:
 * - Extract media refs from a note document (image + audioEmbed contentIds)
 * - Diff against existing ContentLink records (linkType "image-ref"/"audio-ref")
 * - Create links for newly added media
 * - Remove orphaned links and soft-delete the referenced ContentNode ONLY when
 *   no other live reference remains (usage ref-counting — never unilateral)
 *
 * Sprint 37: Images in TipTap + Referenced Content Lifecycle
 * Generated-media lifecycle: audio coverage + ref-count-gated cleanup.
 */

// NOTE: client-reachable via transitive imports — see tag-sync.ts header.
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";

/** linkType ⇄ TipTap node type for the media kinds we ref-count. */
const MEDIA_LINK_TYPES = ["image-ref", "audio-ref"] as const;
type MediaLinkType = (typeof MEDIA_LINK_TYPES)[number];

/**
 * Recursively collect contentIds for a given TipTap node type. Only nodes that
 * carry a `contentId` attr are collected (uploaded/generated media — not
 * URL-pasted media that the app doesn't own).
 */
function extractContentIdsForNodeType(
  doc: JSONContent,
  nodeType: string,
): string[] {
  const ids: string[] = [];
  function walk(node: JSONContent) {
    if (node.type === nodeType && node.attrs?.contentId) {
      ids.push(node.attrs.contentId as string);
    }
    if (node.content) {
      for (const child of node.content) walk(child);
    }
  }
  walk(doc);
  return [...new Set(ids)];
}

/** Image contentIds embedded in a document. */
export function extractImageContentIds(doc: JSONContent): string[] {
  return extractContentIdsForNodeType(doc, "image");
}

/** Audio contentIds embedded in a document (audioEmbed nodes). */
export function extractAudioContentIds(doc: JSONContent): string[] {
  return extractContentIdsForNodeType(doc, "audioEmbed");
}

function extractMediaRefs(doc: JSONContent): Record<MediaLinkType, string[]> {
  return {
    "image-ref": extractImageContentIds(doc),
    "audio-ref": extractAudioContentIds(doc),
  };
}

/**
 * Count LIVE usages of a referenced media node across the whole graph — the
 * single source of truth for "is this safe to delete?". Counts:
 *  - ContentLink edges from notes whose source node is not soft-deleted, and
 *  - live flashcards that embed the contentId in their front/back content.
 *
 * Flashcards can't be ContentLink sources (the FK targets ContentNode), so we
 * scan their JSON as a safety net. The scan is a substring match, which can
 * only *over*-count — and over-counting preserves media, the safe direction.
 *
 * Returns the number of live references (short-circuits at the first found).
 */
export async function countLiveContentReferences(
  targetId: string,
): Promise<number> {
  const linkCount = await prisma.contentLink.count({
    where: { targetId, source: { deletedAt: null } },
  });
  if (linkCount > 0) return linkCount;

  // No note edges — check flashcard usage (front/back content JSON).
  const like = `%${targetId}%`;
  const rows = await prisma.$queryRaw<Array<{ one: number }>>`
    SELECT 1 AS one
    FROM "Flashcard"
    WHERE "deletedAt" IS NULL
      AND (
        ("frontContent")::text LIKE ${like}
        OR ("backContent")::text LIKE ${like}
      )
    LIMIT 1
  `;
  return rows.length > 0 ? 1 : 0;
}

/**
 * Soft-delete a referenced media node only when it has no remaining live
 * references. Never touches `primary` content. Safe to call repeatedly.
 */
export async function softDeleteIfOrphaned(
  targetId: string,
  userId: string,
): Promise<boolean> {
  const refs = await countLiveContentReferences(targetId);
  if (refs > 0) return false;
  const { count } = await prisma.contentNode.updateMany({
    where: { id: targetId, role: "referenced", deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: userId },
  });
  return count > 0;
}

/** Sync one media linkType (image-ref or audio-ref) for a note. */
async function syncOneLinkType(
  noteId: string,
  userId: string,
  linkType: MediaLinkType,
  currentIds: string[],
): Promise<{ added: number; removed: number }> {
  const existingLinks = await prisma.contentLink.findMany({
    where: { sourceId: noteId, linkType },
  });
  const existingTargetIds = new Set(existingLinks.map((l) => l.targetId));
  const currentIdSet = new Set(currentIds);

  const orphanedLinks = existingLinks.filter(
    (l) => !currentIdSet.has(l.targetId),
  );
  const newIds = currentIds.filter((id) => !existingTargetIds.has(id));

  if (orphanedLinks.length > 0) {
    await prisma.contentLink.deleteMany({
      where: { id: { in: orphanedLinks.map((l) => l.id) } },
    });
    // Ref-count-gated cleanup: only remove media no longer used ANYWHERE.
    // We delete this note's edges first (above) so the count reflects reality.
    for (const targetId of orphanedLinks.map((l) => l.targetId)) {
      await softDeleteIfOrphaned(targetId, userId);
    }
  }

  if (newIds.length > 0) {
    await prisma.contentLink.createMany({
      data: newIds.map((targetId) => ({ sourceId: noteId, targetId, linkType })),
      skipDuplicates: true, // Respect @@unique([sourceId, targetId, linkType])
    });
  }

  return { added: newIds.length, removed: orphanedLinks.length };
}

/**
 * Sync media references for a note after save (images + audio).
 *
 * - Creates ContentLink records for newly added media
 * - Removes orphaned links and soft-deletes referenced media that has no other
 *   live reference (ref-count-gated — protects media reused elsewhere)
 *
 * Non-throwing: logs errors but does not propagate them (ref syncing is not
 * critical enough to fail the save).
 */
export async function syncImageReferences(
  noteId: string,
  tiptapJson: JSONContent,
  userId: string,
): Promise<void> {
  try {
    const refsByType = extractMediaRefs(tiptapJson);
    let added = 0;
    let removed = 0;
    for (const linkType of MEDIA_LINK_TYPES) {
      const r = await syncOneLinkType(
        noteId,
        userId,
        linkType,
        refsByType[linkType],
      );
      added += r.added;
      removed += r.removed;
    }
    if (added > 0 || removed > 0) {
      console.log(
        `[syncImageReferences] note=${noteId}: +${added} -${removed} media refs`,
      );
    }
  } catch (error) {
    console.error("[syncImageReferences] Error:", error);
    // Don't throw — media ref syncing is not critical enough to fail the save.
  }
}
