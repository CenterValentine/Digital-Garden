/**
 * AI Editor Utilities — Barrel Export
 *
 * Client-side utilities for AI-powered document editing:
 * - Text search in ProseMirror documents
 * - Edit orchestrator with animation engine
 */

export { findTextInDoc, type TextSearchResult } from "./text-search";
export {
  AiEditOrchestrator,
  parseEditPayload,
  type ApplyDiffPayload,
  type ReplaceDocumentPayload,
  type InsertImagePayload,
  type EditPayload,
  type EditResult,
} from "./edit-orchestrator";
