/**
 * AI Tools Barrel Export
 *
 * IMPORTANT: createBaseTools and createEditorTools import Prisma and are SERVER-ONLY.
 * Tool IDs and metadata constants are client-safe (from metadata.ts / editor-metadata.ts).
 *
 * Client components should import from "./metadata" directly or use the
 * re-exports here, but must NOT import createBaseTools / createEditorTools.
 */

export { createBaseTools } from "./registry";
export { createEditorTools } from "./editor-tools";
export { BASE_TOOL_IDS, BASE_TOOL_METADATA, ALL_TOOL_IDS, ALL_TOOL_METADATA } from "./metadata";
export { EDITOR_TOOL_IDS, EDITOR_TOOL_METADATA } from "./editor-metadata";
export type { BaseToolId } from "./metadata";
export type { EditorToolId } from "./editor-metadata";
export type { ToolExecuteContext } from "./types";
