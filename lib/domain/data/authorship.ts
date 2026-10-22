/**
 * Who drafted a database row — the durable record behind one owner rule
 * (2026-10-21): an assistant may delete the rows it wrote itself without
 * asking, under a table whose delete policy is "Ask me"; rows the user
 * wrote still need the user's confirmation.
 *
 * Why a stamp and not a guess: `DataRow.createdBy` is the USER's id on
 * every path — chat's `insert_rows` and the MCP's `garden_insert_rows`
 * both act as the user — so before this column an AI-written row was
 * indistinguishable from a hand-written one, and the policy had to ask
 * about every row. The ask is the right default for the user's data; for
 * the assistant's own scratch rows it was friction with no safety behind
 * it, and on an MCP client that cannot show a confirmation (the ChatGPT
 * connector, every 2025-era client on the stateless route) it was a dead
 * end: "I wrote these, and I cannot remove them."
 *
 * Stamped ONCE, at creation, by the AI insert paths; a cell edit never
 * changes it, so an assistant editing the user's row does not make it
 * AI-drafted. Rows from before the column read as user-written: nothing
 * recorded who inserted them, so there is no honest backfill.
 *
 * Same vocabulary as content authorship (`draftedBy` on ContentNode):
 * "ai-chat" (a Conversation id as the ref) or "mcp" (a McpToken id).
 *
 * Pure (no Prisma) — safe to import anywhere.
 */

export type RowDrafterKind = "ai-chat" | "mcp";

export interface RowDrafter {
  kind: RowDrafterKind;
  /** Conversation id (ai-chat) or McpToken id (mcp). */
  ref?: string | null;
}

/** Prisma `data` fields for a row create; empty when no AI drafted it. */
export function draftedRowFields(drafter: RowDrafter | null | undefined): {
  draftedBy?: string;
  draftedByRef?: string | null;
  draftedAt?: Date;
} {
  if (!drafter) return {};
  return {
    draftedBy: drafter.kind,
    draftedByRef: drafter.ref?.slice(0, 64) ?? null,
    draftedAt: new Date(),
  };
}

/** Any AI drafted it — chat or MCP. The delete rule does not care which. */
export function isAiDraftedRow(
  row: { draftedBy?: string | null } | null | undefined
): boolean {
  return row?.draftedBy === "ai-chat" || row?.draftedBy === "mcp";
}

/**
 * Split a set of rows into the ones an assistant may delete on its own
 * authority and the ones that are the user's. Order is preserved within
 * each half so receipts read in the order the caller named them.
 */
export function partitionByAuthorship<T extends { draftedBy?: string | null }>(
  rows: T[]
): { aiDrafted: T[]; userWritten: T[] } {
  const aiDrafted: T[] = [];
  const userWritten: T[] = [];
  for (const row of rows) (isAiDraftedRow(row) ? aiDrafted : userWritten).push(row);
  return { aiDrafted, userWritten };
}
