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
import {
  DATA_TOOL_IDS as _DATA_TOOL_IDS,
  DATA_TOOL_METADATA as _DATA_TOOL_METADATA,
  type DataToolId as _DataToolId,
} from "./data-metadata";

/** Tool IDs for the base tools */
export const BASE_TOOL_IDS = [
  "search_web",
  "read_page",
  "phase_checkpoint",
  "create_folder",
  "create_shortcut",
  "read_folder_context",
  "create_docx",
  "searchNotes",
  "search_charters",
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
      "Pause a multi-phase charter for your verdict (approve / revise / tweak) and record the Run Ledger",
  },
  create_folder: {
    name: "Create Folder",
    description:
      "Find or create a folder (charter destinations like job-search/{Company})",
  },
  create_shortcut: {
    name: "Create Shortcut",
    description:
      "Mirror existing content into a second location via a shortcut — one canonical home plus pointers, never duplicates; deleting a shortcut never touches its target",
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
  search_charters: {
    name: "Search Charters",
    description: "List/search charters by name or topic (scoped, not generic note search)",
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

// Re-export database tool metadata (plan Phase 6 / B5)
export const DATA_TOOL_IDS = _DATA_TOOL_IDS;
export const DATA_TOOL_METADATA = _DATA_TOOL_METADATA;
export type DataToolId = _DataToolId;

/** All tool IDs (base + editor + flashcards + workflows) for settings UI */
export const ALL_TOOL_IDS = [
  ...BASE_TOOL_IDS,
  ..._EDITOR_TOOL_IDS,
  ..._FLASHCARD_TOOL_IDS,
  ..._WORKFLOW_TOOL_IDS,
  ..._DATA_TOOL_IDS,
] as const;

/**
 * Tools that exist but are deliberately NOT user-configurable — the harness
 * depends on them (loop state, approval plumbing, budget accounting), so a
 * settings toggle that disabled one would silently break runs mid-loop.
 *
 * Every tool must be classified exactly one way: in ALL_TOOL_IDS (settings
 * UI) or here. `pnpm ai:drift:check` enforces the classification — a new
 * tool that appears in neither list fails the build, forcing the decision.
 */
export const HARNESS_INTERNAL_TOOL_IDS: readonly string[] = [
  // Bounded research-run trio: the proposal is approval-gated in chat, and
  // the record tools ARE the run's ledger/loop state — disabling any of them
  // strands an approved run mid-loop.
  "propose_research_run",
  "extract_structured",
  "record_research_findings",
  // Per-item iteration harness: same shape — the ledger tools are the loop's
  // authoritative state, and the budget/step-cap derivations key off their
  // parts appearing in history.
  "propose_item_iteration",
  "record_item_result",
  "record_batch_checkpoint",
  "record_iteration_findings",
  // D8 mid-run ledger grace: only meaningful inside an active quest run —
  // a settings toggle would just strand the sculpting path mid-loop.
  "add_quest_ledger_column",
  // Browser/co-browse client tools: availability-gated by the extension and
  // its own trust settings (side panel, "open a tab to read blocked pages"),
  // not by the tool-config toggles — a second, independent off-switch here
  // would produce "extension connected but AI can't see it" states.
  "read_page_headless_or_browser",
  "open_tab_and_read",
  "co_browse_open",
  "co_browse_act",
  "read_current_page",
  "list_tabs",
];

/** All tool metadata combined */
export const ALL_TOOL_METADATA: Record<
  string,
  { name: string; description: string }
> = {
  ...BASE_TOOL_METADATA,
  ..._EDITOR_TOOL_METADATA,
  ..._FLASHCARD_TOOL_METADATA,
  ..._WORKFLOW_TOOL_METADATA,
  ..._DATA_TOOL_METADATA,
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
    description: "Web, notes, folders, charters, media, and notifications.",
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
  {
    label: "Databases",
    description:
      "Reading and appending rows in databases mentioned in the chat. Read is paged and bounded; writes are append-only.",
    ids: _DATA_TOOL_IDS,
  },
];
