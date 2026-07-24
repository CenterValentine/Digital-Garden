/**
 * Page-node creation (AI v3 core S3) — settle-then-associate, umbrella
 * decisions #2 / #7 / #14.
 *
 * When a conversation with a target folder reads a page, the page earns a
 * permanent home in the garden: find-or-create its ExternalPayload node.
 * The FIND is owner-wide (a URL captured anywhere in the garden is reused,
 * never duplicated — pages get ONE tree home); the CREATE files it under
 * the conversation's target folder. The first read in a chat IS the settle
 * signal, so this is eager relative to the message but lazy relative to
 * browsing. Best-effort: a failure here never disturbs the read.
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import { generateUniqueSlug } from "@/lib/domain/content";
import { normalizeUrl } from "@/lib/domain/content/external-validation";
import type { AcquiredContent } from "./types";

export async function findOrCreatePageNode(
  userId: string,
  targetFolderId: string | null,
  content: AcquiredContent,
  options: { ownerContentId?: string } = {},
): Promise<{ contentNodeId: string; created: boolean } | null> {
  try {
    const normalized = normalizeUrl(content.url);
    const canonical = content.canonicalUrl
      ? normalizeUrl(content.canonicalUrl)
      : normalized;

    const existing = await prisma.externalPayload.findFirst({
      where: {
        OR: [
          { url: content.url },
          { normalizedUrl: normalized },
          { canonicalUrl: canonical },
        ],
        content: { ownerId: userId, deletedAt: null },
      },
      select: { contentId: true },
    });
    if (existing) {
      return { contentNodeId: existing.contentId, created: false };
    }

    const title = (content.title ?? content.url).slice(0, 255);
    const slug = await generateUniqueSlug(title, userId);

    let hostname = "";
    try {
      hostname = new URL(content.canonicalUrl ?? content.url).hostname;
    } catch {
      /* unparseable — leave domain fields null */
    }
    const domain = hostname.split(".").slice(-2).join(".");

    const node = await prisma.contentNode.create({
      data: {
        ownerId: userId,
        title,
        slug,
        contentType: "external",
        parentId: targetFolderId,
        ...(options.ownerContentId
          ? {
              role: "referenced" as const,
              ownedByNoteId: options.ownerContentId,
            }
          : {}),
        externalPayload: {
          create: {
            url: content.url,
            normalizedUrl: normalized,
            canonicalUrl: canonical,
            subtype: "website",
            description: content.excerpt?.slice(0, 500) ?? null,
            sourceDomain: domain || null,
            sourceHostname: hostname || null,
            preview: {},
            captureMetadata: {
              source: "ai-acquisition",
              provider: content.provider,
              retrievedAt: content.retrievedAt,
            } as unknown as Prisma.InputJsonValue,
            matchMetadata: {},
          },
        },
      },
      select: { id: true },
    });

    logger.info({
      layer: "ai",
      event: "acquisition:page_node_created",
      summary: `page node created for ${content.url} at configured output target`,
      attrs: {
        contentId: node.id,
        url: content.url,
        targetFolderId,
        ownerContentId: options.ownerContentId,
      },
    });
    return { contentNodeId: node.id, created: true };
  } catch (error) {
    logger.info({
      layer: "ai",
      event: "acquisition:page_node_failed",
      summary: `page node creation failed for ${content.url}`,
      attrs: {
        url: content.url,
        reason: error instanceof Error ? error.message : "unknown",
      },
    });
    return null;
  }
}
