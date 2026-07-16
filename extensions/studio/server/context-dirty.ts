/**
 * Dirty-bit propagation for AI context (Folder Studio auto-context V1).
 *
 * Content mutations call markContextDirty with the touched node (edits) or
 * the affected parent(s) (create/move/delete). One recursive CTE resolves the
 * full ancestor chain in a single round trip; one updateMany flags every
 * EXISTING AgenticMetadata row on that chain. Nodes without metadata carry no
 * bit — they're "uncovered" and the refresh engine discovers them by row
 * absence instead.
 *
 * Marking is passive bookkeeping (two cheap queries, no LLM spend) and runs
 * regardless of the user's auto-context mode — spending is gated later, in
 * the refresh engine. Failures are logged and swallowed: a save must never
 * fail because staleness tracking hiccuped.
 */

import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";

/** Safety bound on the resolved chain (ids in + all their ancestors). */
const MAX_CHAIN_NODES = 400;

export async function markContextDirty(
  startNodeIds: Array<string | null | undefined>
): Promise<void> {
  const ids = [...new Set(startNodeIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;

  try {
    const chain = await prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE chain AS (
        SELECT id, "parentId"
        FROM "ContentNode"
        WHERE id = ANY(${ids}::uuid[])
        UNION
        SELECT p.id, p."parentId"
        FROM "ContentNode" p
        JOIN chain c ON p.id = c."parentId"
      )
      SELECT id FROM chain
      LIMIT ${MAX_CHAIN_NODES}
    `;
    if (chain.length === 0) return;

    await prisma.agenticMetadata.updateMany({
      where: { nodeId: { in: chain.map((row) => row.id) } },
      data: { contextDirty: true },
    });
  } catch (error) {
    logger.error({
      layer: "content",
      event: "studio:context_dirty:caught",
      summary: "context dirty-bit propagation failed",
      error,
      attrs: { startNodeIds: ids.join(",") },
    });
  }
}
