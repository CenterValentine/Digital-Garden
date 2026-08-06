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
import {
  WORKFLOW_TOOL_IDS as _WORKFLOW_TOOL_IDS,
  WORKFLOW_TOOL_METADATA as _WORKFLOW_TOOL_METADATA,
  type WorkflowToolId as _WorkflowToolId,
} from "./workflow-metadata";

/** Tool IDs for the base tools */
export const BASE_TOOL_IDS = [
  "search_web",
  "read_page",
  "phase_checkpoint",
  "create_folder",
  "read_folder_context",
  "create_docx",
  "searchNotes",
  "search_playbooks",
  "getCurrentNote",
  "createNote",
  "updateNote",
  "renameNote",
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
      "Search the web with cited results — the active provider's native search (Anthropic, OpenAI, Google, xAI), or an app-run backend (Tavily/Brave) for every other model when configured",
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
  read_folder_context: {
    name: "Read Folder Context",
    description:
      "Read a folder's context capsule — purpose, summary, signals, and an indexed list of its children with ids and token estimates (the walk primitive for folder mentions)",
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
  search_playbooks: {
    name: "Search Playbooks",
    description: "List/search playbooks by name or topic (scoped, not generic note search)",
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
    description: "Update an existing note's content (content only — never the title)",
  },
  renameNote: {
    name: "Rename Note",
    description: "Rename (retitle) an existing note, chat, or folder — title only",
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

// Re-export workflow tool metadata for unified access (AI v3 core S6)
export const WORKFLOW_TOOL_IDS = _WORKFLOW_TOOL_IDS;
export const WORKFLOW_TOOL_METADATA = _WORKFLOW_TOOL_METADATA;
export type WorkflowToolId = _WorkflowToolId;

/** All tool IDs (base + editor + flashcards + workflows) for settings UI */
export const ALL_TOOL_IDS = [
  ...BASE_TOOL_IDS,
  ..._EDITOR_TOOL_IDS,
  ..._FLASHCARD_TOOL_IDS,
  ..._WORKFLOW_TOOL_IDS,
] as const;

/** All tool metadata combined */
export const ALL_TOOL_METADATA: Record<
  string,
  { name: string; description: string }
> = {
  ...BASE_TOOL_METADATA,
  ..._EDITOR_TOOL_METADATA,
  ..._FLASHCARD_TOOL_METADATA,
  ..._WORKFLOW_TOOL_METADATA,
};

/**
 * Tool groups for the settings UI (owner call 2026-08-06): the flat list
 * grew past scannability. Sections mirror how the tool modules are already
 * organized — the base set, then one section per contributing extension.
 */
export const TOOL_GROUPS: ReadonlyArray<{
  label: string;
  description: string;
  ids: readonly string[];
}> = [
  {
    label: "Core",
    description: "Web, notes, folders, playbooks, media, and notifications.",
    ids: BASE_TOOL_IDS,
  },
  {
    label: "Editor",
    description: "Reading and editing the open document.",
    ids: _EDITOR_TOOL_IDS,
  },
  {
    label: "Flashcards",
    description: "Contributed by the Flashcards extension.",
    ids: _FLASHCARD_TOOL_IDS,
  },
  {
    label: "Workflows",
    description: "Contributed by the Workflows extension.",
    ids: _WORKFLOW_TOOL_IDS,
  },
];
