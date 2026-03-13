/**
 * AI Tool Type Definitions
 *
 * Types for the base AI tools registry.
 * These tools are hard-coded application tools (searchNotes, getCurrentNote, createNote)
 * plus editor tools (read_first_chunk, apply_diff, etc.) added in Sprint 39.
 */

/** Context passed to tool execute functions from the API route */
export interface ToolExecuteContext {
  userId: string;
  /** The content node being edited — required for editor tools */
  contentId?: string;
}
