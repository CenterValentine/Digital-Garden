/**
 * Context-mode resolution (FOLDER-CONTEXT-CAPSULE-PLAN → D6/D7).
 *
 * One ordered ladder — OPT_OUT < REFERENCE < STANDARD < ENHANCED — stored as
 * a nullable per-node override on AgenticMetadata. Resolution is
 * nearest-explicit-ancestor-wins with one exception: OPT_OUT is ABSOLUTE
 * downward — a descendant cannot opt back in under an opted-out ancestor
 * (privacy trumps specificity). No ancestor sets anything → STANDARD.
 *
 * Expand/contract transition (sweep B4): rows written before the enum landed
 * carry only the legacy `contextOptOut` boolean; `explicitMode` folds it in
 * so both generations of rows resolve identically. The boolean is dropped in
 * a later cleanup migration.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import { ContextMode } from "@/lib/database/generated/prisma";

/** Safety bound on the resolved ancestor chain — mirrors context-dirty. */
const MAX_CHAIN_NODES = 400;

interface ChainRow {
  id: string;
  depth: number;
  contextMode: ContextMode | null;
  contextOptOut: boolean | null;
}

/**
 * The explicit (non-inherited) mode a metadata row declares, folding the
 * legacy opt-out boolean in during the expand/contract window. Null = the
 * node inherits from its nearest explicit ancestor.
 */
export function explicitMode(
  row:
    | { contextMode?: ContextMode | null; contextOptOut?: boolean | null }
    | null
    | undefined
): ContextMode | null {
  if (!row) return null;
  if (row.contextMode) return row.contextMode;
  if (row.contextOptOut) return ContextMode.OPT_OUT;
  return null;
}

/**
 * Resolve one child's mode given its parent's already-resolved mode — the
 * cheap top-down step scope collection uses during BFS (the parent's
 * resolution already folded in everything above it). OPT_OUT absoluteness
 * holds structurally: an OPT_OUT parent never descends, so a child override
 * under one is never consulted.
 */
export function resolveChildMode(
  child:
    | { contextMode?: ContextMode | null; contextOptOut?: boolean | null }
    | null
    | undefined,
  parentResolved: ContextMode
): ContextMode {
  if (parentResolved === ContextMode.OPT_OUT) return ContextMode.OPT_OUT;
  return explicitMode(child) ?? parentResolved;
}

/**
 * Resolve a node's effective context mode by walking its ancestor chain.
 * One recursive CTE (same shape as markContextDirty's), then the ladder
 * rules in process: any OPT_OUT anywhere in the chain wins; otherwise the
 * nearest explicit setting; otherwise STANDARD.
 */
export async function resolveContextMode(nodeId: string): Promise<ContextMode> {
  const chain = await prisma.$queryRaw<ChainRow[]>`
    WITH RECURSIVE chain AS (
      SELECT id, "parentId", 0 AS depth
      FROM "ContentNode"
      WHERE id = ${nodeId}::uuid
      UNION
      SELECT p.id, p."parentId", c.depth + 1
      FROM "ContentNode" p
      JOIN chain c ON p.id = c."parentId"
    )
    SELECT chain.id,
           chain.depth,
           am."contextMode"   AS "contextMode",
           am."contextOptOut" AS "contextOptOut"
    FROM chain
    LEFT JOIN "AgenticMetadata" am ON am."nodeId" = chain.id
    ORDER BY chain.depth ASC
    LIMIT ${MAX_CHAIN_NODES}
  `;

  let nearest: ContextMode | null = null;
  for (const row of chain) {
    const explicit = explicitMode(row);
    if (explicit === ContextMode.OPT_OUT) return ContextMode.OPT_OUT;
    if (explicit && nearest === null) nearest = explicit;
  }
  return nearest ?? ContextMode.STANDARD;
}
