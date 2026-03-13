/**
 * AI Tool Metadata (Client-Safe)
 *
 * Static metadata about base AI tools for the settings UI.
 * This file has NO server-side imports (no Prisma, no fs, no Node.js builtins)
 * so it can be safely imported in client components.
 */

import {
  EDITOR_TOOL_IDS as _EDITOR_TOOL_IDS,
  EDITOR_TOOL_METADATA as _EDITOR_TOOL_METADATA,
  type EditorToolId as _EditorToolId,
} from "./editor-metadata";

/** Tool IDs for the base tools */
export const BASE_TOOL_IDS = [
  "searchNotes",
  "getCurrentNote",
  "createNote",
] as const;

export type BaseToolId = (typeof BASE_TOOL_IDS)[number];

/** Tool metadata for the settings UI */
export const BASE_TOOL_METADATA: Record<
  BaseToolId,
  { name: string; description: string }
> = {
  searchNotes: {
    name: "Search Notes",
    description: "Search through your notes by title or content",
  },
  getCurrentNote: {
    name: "Read Note",
    description: "Read the full content of a specific note",
  },
  createNote: {
    name: "Create Note",
    description: "Create a new note with a title and optional content",
  },
};

// Re-export editor tool metadata for unified access
export const EDITOR_TOOL_IDS = _EDITOR_TOOL_IDS;
export const EDITOR_TOOL_METADATA = _EDITOR_TOOL_METADATA;
export type EditorToolId = _EditorToolId;

/** All tool IDs (base + editor) for settings UI */
export const ALL_TOOL_IDS = [
  ...BASE_TOOL_IDS,
  ..._EDITOR_TOOL_IDS,
] as const;

/** All tool metadata combined */
export const ALL_TOOL_METADATA: Record<
  string,
  { name: string; description: string }
> = { ...BASE_TOOL_METADATA, ..._EDITOR_TOOL_METADATA };
