/**
 * Image Reference Extraction + Sync
 *
 * Extracts image contentIds from TipTap JSON and syncs ContentLink records.
 * Follows the same pattern as tag-sync.ts:
 * - Extract image refs from document
 * - Diff against existing ContentLink records (linkType = "image-ref")
 * - Delete orphaned links + soft-delete orphaned referenced ContentNodes
 * - Create new links for newly added images
 *
 * Sprint 37: Images in TipTap + Referenced Content Lifecycle
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";

/**
 * Recursively extract image contentIds from TipTap JSON.
 * Only collects images that have a contentId (uploaded images, not URL-pasted ones).
 */
export function extractImageContentIds(doc: JSONContent): string[] {
  const ids: string[] = [];

  function walk(node: JSONContent) {
    if (node.type === "image" && node.attrs?.contentId) {
      ids.push(node.attrs.contentId);
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }

  walk(doc);
  // Deduplicate (same image could theoretically appear twice)
  return [...new Set(ids)];
}

/**
 * Sync image references for a note after save.
 *
 * - Creates ContentLink records for newly added images (linkType = "image-ref")
 * - Soft-deletes orphaned referenced ContentNodes when images are removed
 * - Removes orphaned ContentLink records
 *
 * Non-throwing: logs errors but does not propagate them.
 */
export async function syncImageReferences(
  noteId: string,
  tiptapJson: JSONContent,
  userId: string
): Promise<void> {
  try {
    // Extract all image contentIds currently in the document
    const currentImageIds = extractImageContentIds(tiptapJson);

    // Get existing image-ref ContentLink records for this note
    const existingLinks = await prisma.contentLink.findMany({
      where: {
        sourceId: noteId,
        linkType: "image-ref",
      },
    });

    const existingTargetIds = new Set(existingLinks.map((l) => l.targetId));
    const currentIdSet = new Set(currentImageIds);

    // Determine orphans: linked images no longer in the document
    const orphanedLinks = existingLinks.filter(
      (l) => !currentIdSet.has(l.targetId)
    );

    // Determine new: images in document not yet linked
    const newImageIds = currentImageIds.filter(
      (id) => !existingTargetIds.has(id)
    );

    // Delete orphaned ContentLink records
    if (orphanedLinks.length > 0) {
      const orphanedTargetIds = orphanedLinks.map((l) => l.targetId);

      await prisma.contentLink.deleteMany({
        where: {
          id: { in: orphanedLinks.map((l) => l.id) },
        },
      });

      // Soft-delete the orphaned referenced ContentNodes
      await prisma.contentNode.updateMany({
        where: {
          id: { in: orphanedTargetIds },
          role: "referenced", // Only delete referenced content, never primary
        },
        data: {
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });
    }

    // Create new ContentLink records
    if (newImageIds.length > 0) {
      await prisma.contentLink.createMany({
        data: newImageIds.map((targetId) => ({
          sourceId: noteId,
          targetId,
          linkType: "image-ref",
        })),
        skipDuplicates: true, // Respect @@unique constraint
      });
    }

    if (orphanedLinks.length > 0 || newImageIds.length > 0) {
      console.log(
        `[syncImageReferences] note=${noteId}: +${newImageIds.length} -${orphanedLinks.length} image refs`
      );
    }
  } catch (error) {
    console.error("[syncImageReferences] Error:", error);
    // Don't throw — image ref syncing is not critical enough to fail the save
  }
}
