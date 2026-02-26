/**
 * Tag Sync Utility
 *
 * Extracts tags from TipTap JSON and syncs them with database records.
 * Creates missing tags, updates positions, removes orphaned associations.
 *
 * Used by:
 * - PATCH /api/content/content/[id] (on note save)
 * - POST /api/content/import (on import)
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { extractTags } from "./tag-extractor";

/**
 * Extract tags from content and sync with database.
 *
 * - Extracts tags from TipTap JSON (tag nodes + inline #tags)
 * - Creates missing Tag records for the user
 * - Updates ContentTag associations with position data
 * - Removes ContentTag associations for tags no longer in content
 *
 * Non-throwing: logs errors but does not propagate them.
 */
export async function syncContentTags(
  contentId: string,
  tiptapJson: JSONContent,
  userId: string
): Promise<void> {
  try {
    // Extract tags from content
    const extractedTags = extractTags(tiptapJson);

    // Get existing ContentTag associations for this content
    const existingContentTags = await prisma.contentTag.findMany({
      where: { contentId },
      include: { tag: true },
    });

    // Build set of tag slugs from extracted tags
    const extractedSlugs = new Set(extractedTags.map((t) => t.slug));

    // Determine which tags to remove (no longer in content)
    const tagsToRemove = existingContentTags.filter(
      (ct) => !extractedSlugs.has(ct.tag.slug)
    );

    // Delete removed tags
    if (tagsToRemove.length > 0) {
      await prisma.contentTag.deleteMany({
        where: {
          id: { in: tagsToRemove.map((ct) => ct.id) },
        },
      });
    }

    // Process each extracted tag
    for (const extractedTag of extractedTags) {
      // Find or create tag
      let tag = await prisma.tag.findUnique({
        where: {
          userId_slug: {
            userId,
            slug: extractedTag.slug,
          },
        },
      });

      if (!tag) {
        // Create new tag
        tag = await prisma.tag.create({
          data: {
            userId,
            name: extractedTag.name,
            slug: extractedTag.slug,
            color: extractedTag.color || null,
          },
        });
      }

      // Find existing ContentTag association
      const existingLink = existingContentTags.find(
        (ct) => ct.tag.slug === extractedTag.slug
      );

      if (existingLink) {
        // Update positions
        await prisma.contentTag.update({
          where: { id: existingLink.id },
          data: {
            positions: extractedTag.positions as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Prisma Json type
          },
        });
      } else {
        // Create new association
        await prisma.contentTag.create({
          data: {
            contentId,
            tagId: tag.id,
            positions: extractedTag.positions as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Prisma Json type
          },
        });
      }
    }

    console.log(
      `[syncContentTags] Synced ${extractedTags.length} tags for content ${contentId}`
    );
  } catch (error) {
    console.error("[syncContentTags] Error:", error);
    // Don't throw - tag syncing is not critical enough to fail the entire save
  }
}
