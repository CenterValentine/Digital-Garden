/**
 * AI Tool Type Definitions
 *
 * Types for the base AI tools registry.
 * These tools are hard-coded application tools (searchNotes, getCurrentNote, createNote).
 * User-created dynamic tools (webhook, LLM) are deferred to Sprint 35.
 */

/** Context passed to tool execute functions from the API route */
export interface ToolExecuteContext {
  userId: string;
}
