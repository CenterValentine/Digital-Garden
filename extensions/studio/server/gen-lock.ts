/**
 * GEN lock — the anti-feedback-loop rule (plan → "Decisions of record").
 *
 * Studio-generated outputs are excluded from chat/tool sources until a human
 * edits them: a run records the output's bodyHash at creation, and the lock
 * releases when the node's live hash diverges ("EDITED — eligible"). Without
 * this, the AI summarizes its own summaries and the folder's context
 * launders itself. Standalone module: both runs.ts and source-selection.ts
 * need it, and importing either into the other would cycle.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";

/**
 * Which of the given node ids are currently GEN-locked: produced by a
 * completed studio run AND unedited since. Missing hashes lock
 * conservatively — an un-hashed artifact can't prove it was edited, and the
 * feedback-loop risk outweighs the inconvenience.
 */
export async function getGenLockedNodeIds(
  userId: string,
  nodeIds: string[]
): Promise<Set<string>> {
  if (nodeIds.length === 0) return new Set();
  const [runs, nodes] = await Promise.all([
    prisma.studioGenerationRun.findMany({
      where: {
        ownerId: userId,
        outputNodeId: { in: nodeIds },
        status: "done",
      },
      select: { outputNodeId: true, outputBodyHash: true },
    }),
    prisma.contentNode.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true, bodyHash: true },
    }),
  ]);
  const liveHash = new Map(nodes.map((n) => [n.id, n.bodyHash]));
  const locked = new Set<string>();
  for (const run of runs) {
    if (!run.outputNodeId) continue;
    const live = liveHash.get(run.outputNodeId);
    if (run.outputBodyHash === null || live === run.outputBodyHash) {
      locked.add(run.outputNodeId);
    }
  }
  return locked;
}
