/**
 * AI Editor Utilities — Barrel Export
 *
 * Client-side utilities for AI-powered document editing:
 * - Text search in ProseMirror documents
 * - Edit orchestrator with animation engine
 */

export {
  findTextInDoc,
  type TextSearchResult,
  type SearchRange,
  type AmbiguousMatch,
} from "./text-search";
export {
  buildOutline,
  formatOutline,
  handleMissMessage,
  resolveHandle,
  type HandleResolution,
  type OutlineEntry,
} from "./block-handles";
export { visibleTextBetween, visibleTextOf } from "./visible-text";
export {
  AiEditOrchestrator,
  parseEditPayload,
  type ApplyDiffPayload,
  type ReplaceDocumentPayload,
  type InsertImagePayload,
  type AppendToDocumentPayload,
  type EditPayload,
  type EditResult,
} from "./edit-orchestrator";
