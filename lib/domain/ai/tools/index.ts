/**
 * AI Tools Barrel Export
 *
 * IMPORTANT: createBaseTools imports Prisma and is SERVER-ONLY.
 * BASE_TOOL_IDS and BASE_TOOL_METADATA are client-safe (from metadata.ts).
 *
 * Client components should import from "./metadata" directly or use the
 * re-exports here, but must NOT import createBaseTools.
 */

export { createBaseTools } from "./registry";
export { BASE_TOOL_IDS, BASE_TOOL_METADATA } from "./metadata";
export type { BaseToolId } from "./metadata";
export type { ToolExecuteContext } from "./types";
