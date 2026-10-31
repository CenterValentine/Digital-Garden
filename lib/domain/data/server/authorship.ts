import "server-only";

/**
 * Row authorship, read side — ONE query every AI delete path uses to learn
 * which of the rows it was asked to remove it wrote itself
 * (`lib/domain/data/authorship.ts` has the rule and the pure helpers).
 */

import { prisma } from "@/lib/database/client";
import { partitionByAuthorship } from "../authorship";

export interface RowAuthorshipSplit {
  /** Live rows an AI drafted (chat or MCP) — deletable without asking. */
  aiDrafted: string[];
  /** Live rows the user wrote — the table's policy governs these. */
  userWritten: string[];
}

/**
 * Partition live row ids of one table by who drafted them. Ids that are not
 * live rows of the table are dropped, so callers resolve references first
 * (`resolveRowRefs`) and treat this as a classification, not a check.
 */
export async function splitRowsByAuthorship(
  tableId: string,
  rowIds: string[]
): Promise<RowAuthorshipSplit> {
  if (rowIds.length === 0) return { aiDrafted: [], userWritten: [] };
  const rows = await prisma.dataRow.findMany({
    where: { tableId, deletedAt: null, id: { in: rowIds } },
    select: { id: true, draftedBy: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = rowIds
    .map((id) => byId.get(id))
    .filter((r): r is { id: string; draftedBy: string | null } => !!r);
  const split = partitionByAuthorship(ordered);
  return {
    aiDrafted: split.aiDrafted.map((r) => r.id),
    userWritten: split.userWritten.map((r) => r.id),
  };
}
