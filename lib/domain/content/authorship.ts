/**
 * Who drafted a content node — the durable record behind two owner rules
 * (2026-10-14):
 *
 *  1. An AI may rewrite a note an AI drafted without the destructive-
 *     rewrite guard (writeNoteContent keeps a history snapshot first).
 *  2. The MCP may trash content the MCP drafted (`garden_delete_content`),
 *     with any of the user's tokens.
 *
 * Stamped ONCE, at creation, by the AI create paths (chat tools and MCP
 * tools); an overwrite never changes it, so an AI rewriting the user's file
 * does not make it AI-drafted. Rows from before 2026-10-14 read as
 * user-drafted: the old conversation links cannot tell a creation from a
 * mention, so there is no honest backfill.
 *
 * Pure (no Prisma) — safe to import anywhere.
 */

export type ContentDrafterKind = "ai-chat" | "mcp";

export interface ContentDrafter {
  kind: ContentDrafterKind;
  /** Conversation id (ai-chat) or McpToken id (mcp). */
  ref?: string | null;
}

/** Prisma `data` fields for a create; empty when no AI drafted it. */
export function draftedFields(drafter: ContentDrafter | null | undefined): {
  draftedBy?: string;
  draftedByRef?: string | null;
  draftedAt?: Date;
} {
  if (!drafter) return {};
  return { draftedBy: drafter.kind, draftedByRef: drafter.ref?.slice(0, 64) ?? null, draftedAt: new Date() };
}

/** Any AI drafted it — chat or MCP. */
export function isAiDrafted(node: { draftedBy?: string | null } | null | undefined): boolean {
  return node?.draftedBy === "ai-chat" || node?.draftedBy === "mcp";
}

/** The MCP drafted it (any of the user's tokens). */
export function isMcpDrafted(node: { draftedBy?: string | null } | null | undefined): boolean {
  return node?.draftedBy === "mcp";
}
