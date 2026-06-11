/**
 * Shared helpers for AI-generated media (images, speech) persisted as
 * referenced ContentNodes.
 *
 * Two concerns both store paths share:
 *  - Placement: co-locate generated media under its SOURCE's parent and mark it
 *    owned by the source, so it's discoverable next to what produced it and the
 *    lifecycle can follow the source.
 *  - Idempotency: a duplicate generation request (e.g. a client effect that
 *    double-fires on a StrictMode remount) should reuse the just-created node
 *    instead of generating + storing a second copy. We dedup on the
 *    deterministic, prompt-derived FilePayload.searchText within a short window.
 *
 * The window dedup collapses *sequential* duplicate calls (the common remount
 * case); truly concurrent calls can still race, so the client gates keep their
 * in-flight guard as the first line of defense.
 */

import { prisma } from "@/lib/database/client";

/** Resolve where a generated node should live, given the source it came from. */
export async function resolveGeneratedMediaPlacement(
  userId: string,
  sourceContentId: string | null | undefined,
): Promise<{ parentId: string | null; ownedByNoteId: string | null }> {
  if (!sourceContentId) return { parentId: null, ownedByNoteId: null };
  const src = await prisma.contentNode.findFirst({
    where: { id: sourceContentId, ownerId: userId },
    select: { parentId: true },
  });
  if (!src) return { parentId: null, ownedByNoteId: null };
  // Co-locate beside the source (its parent folder) and record provenance.
  return { parentId: src.parentId, ownedByNoteId: sourceContentId };
}

export interface RecentGeneratedMedia {
  contentId: string;
  storageKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}

/**
 * Find a recent identical generated-media node to reuse (idempotency). Matches
 * the deterministic prompt-derived `searchText`, owner, owning source, and a
 * short recency window. Returns null when there's nothing fresh to reuse.
 */
export async function findRecentGeneratedMedia(
  userId: string,
  params: {
    searchText: string;
    ownedByNoteId: string | null;
    withinMs?: number;
  },
): Promise<RecentGeneratedMedia | null> {
  const within = params.withinMs ?? 30_000;
  const node = await prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      role: "referenced",
      deletedAt: null,
      ownedByNoteId: params.ownedByNoteId,
      createdAt: { gt: new Date(Date.now() - within) },
      filePayload: { searchText: params.searchText },
    },
    select: {
      id: true,
      filePayload: {
        select: { storageKey: true, mimeType: true, width: true, height: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!node?.filePayload?.storageKey) return null;
  return {
    contentId: node.id,
    storageKey: node.filePayload.storageKey,
    mimeType: node.filePayload.mimeType ?? "application/octet-stream",
    width: node.filePayload.width ?? null,
    height: node.filePayload.height ?? null,
  };
}
