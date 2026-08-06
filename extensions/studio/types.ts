/**
 * Folder Studio — frozen contracts.
 *
 * These types are the stable interface the whole feature stubs against
 * (see docs/notes-feature/work-tracking/FOLDER-STUDIO-PLAN.md → "Contracts").
 * Pure types only — no React, no Prisma, no side effects — so both client
 * and server code can import them freely.
 *
 * Phase 0. Adding fields is cheap; renaming/removing is a breaking change to
 * every phase downstream, so change deliberately.
 */

// ── Tool taxonomy ────────────────────────────────────────────────────────

/**
 * The three studio shelves. A shelf tells the user what they get back:
 *  - `create`   → a file lands in the folder (report, flashcards, map, audio…)
 *  - `practice` → a graded session opens; no file is produced (oral exam, quiz…)
 *  - `analyze`  → an insight artifact leaning on the metadata layer (glossary…)
 */
export type StudioShelf = "create" | "practice" | "analyze";

/** Ordered shelf list — the grid renders shelves in this order. */
export const STUDIO_SHELVES: readonly StudioShelf[] = [
  "create",
  "practice",
  "analyze",
] as const;

/**
 * Execution routing (see plan → "Tool routing rule"):
 *  - `chat` → runs as a chat invocation (reuses the conversation engine,
 *    proposal flow, rate limiting, undo). For refinable text/TipTap artifacts.
 *  - `job`  → runs as a server-owned GenerationRun (survives tab close,
 *    structured/multi-step output, step retry). For binary/multi-step artifacts.
 */
export type StudioExecution = "chat" | "job";

/**
 * A sub-tool / variant surfaced in a flyout on the tool tile. Adding a variant
 * never reflows the grid (UI contract: one tile per tool). `custom` variants
 * are user-defined (e.g. a custom report backed by a ChatContext preset).
 */
export interface StudioToolVariant {
  id: string;
  label: string;
  description?: string;
  custom?: boolean;
}

/**
 * Variants may be a static list OR a runtime resolver — custom reports resolve
 * from the user's ChatContext presets at open time, so they can't be static.
 */
export type StudioToolVariants =
  | StudioToolVariant[]
  | (() => StudioToolVariant[] | Promise<StudioToolVariant[]>);

/**
 * Registry entry for one studio tool. Pure data: the grid is rendered entirely
 * from these, so a new tool (or a whole new shelf) is an insert, not a redesign.
 * Other extensions contribute their own via `registerStudioTool()`.
 */
export interface StudioToolDefinition {
  /** Unique id, e.g. "report", "flashcards", "mind-map". */
  id: string;
  shelf: StudioShelf;
  label: string;
  description?: string;
  /** Lucide icon name (resolved to a component at render time). */
  iconName: string;
  execution: StudioExecution;
  /** Sub-tools shown in the tile flyout. Omit for single-shot tools. */
  variants?: StudioToolVariants;
  /**
   * Extension id that contributed this tool (for provenance and disable
   * filtering). Omitted for tools owned by the studio extension itself.
   */
  contributedBy?: string;
  /** Present but non-functional (e.g. video). Renders disabled with a hint. */
  stub?: boolean;
  /** Display order within the shelf (lower = first; use 10/20/30 gaps). */
  order?: number;
}

// ── Source selection ─────────────────────────────────────────────────────

/**
 * Which folder contents feed a given studio conversation. Persisted via a new
 * `ConversationAssociation` source kind (see plan → Phase 3), not a new table.
 * Tri-state in the UI is derived client-side from included/excluded + hierarchy.
 */
export interface SourceSelection {
  /** null until the backing conversation exists. */
  conversationId: string | null;
  folderId: string;
  /** Explicitly included node ids (files or subtree roots). */
  includedNodeIds: string[];
  /** Explicit exclusions carved out of an included subtree. */
  excludedNodeIds: string[];
  /** Token ceiling for assembled context (from settings; per-convo override). */
  tokenBudget: number;
  /** Running estimate for the current selection. */
  estimatedTokens: number;
  /** True when the default selection hit the cap — drives the one-time tooltip. */
  capApplied: boolean;
}

// ── Graduated substrate types (re-exported for studio-internal consumers) ─
//
// The source-resolution and agentic-metadata types moved to
// `lib/domain/ai-context/types.ts` when the context layer graduated to
// content-graph infrastructure (FOLDER-CONTEXT-CAPSULE-PLAN → Phase 0).
// Re-exported here so studio components keep importing from "../types".

export type {
  ResolvableContentType,
  ResolverNodeRef,
  ResolvedSourceContent,
  SourceContentResolver,
  MetadataSectionOwner,
  MetadataSectionKind,
  MetadataSectionMeta,
} from "@/lib/domain/ai-context/types";
export { METADATA_SECTION_OWNERS } from "@/lib/domain/ai-context/types";

// ── Generation runs ──────────────────────────────────────────────────────

export type GenerationRunStatus = "idle" | "running" | "failed" | "done";

export interface GenerationRunStep {
  index: number;
  total: number;
  label: string;
}

/**
 * A single studio generation. `job`-execution tools persist this server-side so
 * it survives tab close and mirrors progress to the inbox. `promptSnapshot` +
 * `model` are the artifact's provenance record (see plan → Phase 5).
 */
export interface GenerationRun {
  id: string;
  toolId: string;
  variantId?: string;
  folderId: string;
  sourceNodeIds: string[];
  status: GenerationRunStatus;
  step?: GenerationRunStep;
  /** ContentNode id of the produced artifact once `status === "done"`. */
  outputNodeId?: string;
  error?: string;
  promptSnapshot: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}
