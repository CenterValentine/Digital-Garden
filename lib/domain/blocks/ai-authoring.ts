/**
 * AI Block-Authoring Policy
 *
 * A policy layer over the block registry that answers a single question:
 * *what may an AI model create, and how?* It is deliberately kept OUT of
 * `BlockDefinition` so AI concerns don't leak into the shared block/UI system,
 * and so the entire policy is auditable in one file.
 *
 * Consumed by the AI content-authoring tools (the block catalog they expose to
 * models) and by `scripts/generate-block-catalog.ts` (the reviewable doc).
 *
 * Default bias: every registered block is authorable (`full`) unless it needs
 * children, a reference, derived content, or bespoke handling — give those an
 * explicit entry below.
 */

import type { BlockDefinition } from "./types";

/**
 * How an AI model is expected to author a given block.
 *
 * - `full`      — the model writes all content through the block's attrs.
 * - `container` — like `full`, but the block also needs nested child blocks
 *                 (columns, tabs, accordion…). Deferred to Phase 2.
 * - `seed`      — the model inserts an empty/unlinked block; the real payload
 *                 (uploaded media, etc.) is supplied later by a human or tool.
 * - `reference` — the block must point at existing content (a publishing path,
 *                 a flashcard deck…). The model supplies the reference, not the
 *                 content.
 * - `computed`  — the model sets config only; the block derives its own content
 *                 (summaries, table of contents, live widgets).
 * - `deferred`  — not yet AI-authorable. Content lives outside attrs and needs
 *                 a bespoke tool (mermaid, excalidraw) or a dedicated flow
 *                 (flashcards). Excluded from the authorable vocabulary.
 */
export type BlockAuthoringMode =
  | "full"
  | "container"
  | "seed"
  | "reference"
  | "computed"
  | "deferred";

/** Blocks authorable-by-default (`full`) are omitted; only exceptions listed. */
const AUTHORING_MODE: Record<string, BlockAuthoringMode> = {
  // --- Deferred: content lives outside attrs; needs bespoke handling. ---
  mermaidBlock: "deferred", // source is a Y.Text (blockMermaid:{id}) + a visualization node
  excalidrawBlock: "deferred", // scene is a Y.Array of elements; a model can't draw
  flashcardEmbed: "deferred", // needs a deckId; authored via the propose_* flow instead

  // --- Containers: authorable, but need nested children (Phase 2). ---
  accordion: "container",
  cardPanel: "container",
  listContainer: "container",
  columns: "container",
  blockColumns: "container",
  tabs: "container",

  // --- Computed: model sets config; block generates its own content. ---
  tableOfContents: "computed",
  dailySummary: "computed",
  weeklySummary: "computed",
  habitTracker: "computed",
  stopwatch: "computed",
  timestamp: "computed",
  calendarViewBlock: "computed",

  // --- Reference: must point at existing content. ---
  recentPosts: "reference",
  noteWindow: "reference", // targetContentId must be a real ContentNode id; never invented

  // --- Seed: inserted empty; media payload supplied later. ---
  gallery: "seed",
};

const DEFAULT_MODE: BlockAuthoringMode = "full";

/**
 * Synthetic / internal block types that are NEVER AI-authorable regardless of
 * mode (e.g. the placeholder emitted for unknown content on load).
 */
const NEVER_AUTHORABLE = new Set<string>(["unsupportedBlock"]);

/** The authoring mode for a block type (defaults to `full` when unlisted). */
export function getBlockAuthoringMode(type: string): BlockAuthoringMode {
  return AUTHORING_MODE[type] ?? DEFAULT_MODE;
}

/** True if a model may currently author this block through the AI tools. */
export function isBlockAuthorable(type: string): boolean {
  if (NEVER_AUTHORABLE.has(type)) return false;
  return getBlockAuthoringMode(type) !== "deferred";
}

/**
 * The blocks a model may author right now — the AI vocabulary. Excludes
 * `deferred` blocks and synthetic placeholders. Pass `getAllBlocks()` from the
 * registry at the call site so this module stays free of the registry import
 * chain (and thus safe to import from anywhere).
 */
export function getAuthorableBlocks(
  blocks: BlockDefinition[]
): BlockDefinition[] {
  return blocks.filter((b) => isBlockAuthorable(b.type));
}

/**
 * The description a model should see for a block: the calibrated `aiHint` when
 * present, else the human tooltip `description`.
 */
export function effectiveAiDescription(def: BlockDefinition): string {
  return def.aiHint?.trim() || def.description;
}
