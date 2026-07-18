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
import {
  FLASHCARD_TOOL_IDS as _FLASHCARD_TOOL_IDS,
  FLASHCARD_TOOL_METADATA as _FLASHCARD_TOOL_METADATA,
  type FlashcardToolId as _FlashcardToolId,
} from "./flashcard-metadata";

/** Tool IDs for the base tools */
export const BASE_TOOL_IDS = [
  "search_web",
  "read_page",
  "phase_checkpoint",
  "create_folder",
  "create_docx",
  "searchNotes",
  "getCurrentNote",
  "createNote",
  "updateNote",
  "generate_image",
  "generate_speech",
  "notify_user",
] as const;

export type BaseToolId = (typeof BASE_TOOL_IDS)[number];

/**
 * Tool metadata for the settings UI.
 *
 * - `callsAi: true` means the tool itself invokes a remote AI provider
 *   as part of its execution (currently only `generate_image`). Tools
 *   with this flag get an optional provider override in settings so the
 *   user can pin which Connection's key serves that tool.
 * - `requiredCapabilities` constrains the override picker — only
 *   Connections whose models satisfy these flags can serve as overrides.
 */
export interface BaseToolMeta {
  name: string;
  description: string;
  callsAi?: boolean;
  requiredCapabilities?: ReadonlyArray<string>;
}

export const BASE_TOOL_METADATA: Record<BaseToolId, BaseToolMeta> = {
  search_web: {
    name: "Web Search",
    description:
      "Search the web with cited results using the active provider's native search (Anthropic, OpenAI, Google, xAI)",
  },
  read_page: {
    name: "Read Web Page",
    description:
      "Fetch and read a public web page's main content with source provenance (Acquisition Service)",
  },
  phase_checkpoint: {
    name: "Phase Checkpoint",
    description:
      "Pause a multi-phase playbook for your verdict (approve / revise / tweak) and record the Run Ledger",
  },
  create_folder: {
    name: "Create Folder",
    description:
      "Find or create a folder (playbook destinations like job-search/{Company})",
  },
  create_docx: {
    name: "Create Word Document",
    description:
      "Generate a .docx from markdown and file it in the target folder (approval-gated)",
  },
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
  updateNote: {
    name: "Update Note",
    description: "Update an existing note's content (and optionally its title)",
  },
  generate_image: {
    name: "Generate Image",
    description:
      "Generate an AI image from a text prompt using DALL·E, Imagen, FLUX, and other providers",
    callsAi: true,
    requiredCapabilities: ["image-generation"],
  },
  generate_speech: {
    name: "Generate Speech",
    description:
      "Convert text to spoken audio using OpenAI, ElevenLabs, or Google text-to-speech voices",
    callsAi: true,
    requiredCapabilities: ["speech"],
  },
  notify_user: {
    name: "Notify User",
    description:
      "Post a reminder or task result to your inbox (rate limited, badged as AI)",
  },
};

// Re-export editor tool metadata for unified access
export const EDITOR_TOOL_IDS = _EDITOR_TOOL_IDS;
export const EDITOR_TOOL_METADATA = _EDITOR_TOOL_METADATA;
export type EditorToolId = _EditorToolId;

// Re-export flashcard tool metadata for unified access
export const FLASHCARD_TOOL_IDS = _FLASHCARD_TOOL_IDS;
export const FLASHCARD_TOOL_METADATA = _FLASHCARD_TOOL_METADATA;
export type FlashcardToolId = _FlashcardToolId;

/** All tool IDs (base + editor + flashcards) for settings UI */
export const ALL_TOOL_IDS = [
  ...BASE_TOOL_IDS,
  ..._EDITOR_TOOL_IDS,
  ..._FLASHCARD_TOOL_IDS,
] as const;

/** All tool metadata combined */
export const ALL_TOOL_METADATA: Record<
  string,
  { name: string; description: string }
> = {
  ...BASE_TOOL_METADATA,
  ..._EDITOR_TOOL_METADATA,
  ..._FLASHCARD_TOOL_METADATA,
};
