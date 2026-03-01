/**
 * AI Tool Metadata (Client-Safe)
 *
 * Static metadata about base AI tools for the settings UI.
 * This file has NO server-side imports (no Prisma, no fs, no Node.js builtins)
 * so it can be safely imported in client components.
 */

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
