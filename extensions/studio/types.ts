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

// ── Source content resolution (the web-search seam) ──────────────────────

/**
 * Content types the resolver knows how to turn into prompt-ready text.
 * Kept as a string union rather than importing the Prisma `ContentType` so
 * this file stays dependency-free.
 */
export type ResolvableContentType =
  | "note"
  | "file"
  | "html"
  | "code"
  | "external"
  | "folder";

/** Minimal node descriptor the resolver needs. */
export interface ResolverNodeRef {
  id: string;
  contentType: ResolvableContentType | string;
  title: string;
}

/** Result of resolving one node to text. */
export interface ResolvedSourceContent {
  nodeId: string;
  /** Prompt-ready text. Empty string when `empty` is true. */
  text: string;
  estimatedTokens: number;
  /**
   * No usable text was available (blank extraction, folder, unsupported type).
   * The picker surfaces this as a "NO TEXT" flag — the file is moot in studio.
   */
  empty: boolean;
  /** Text was cut to fit a per-node ceiling. */
  truncated: boolean;
  /**
   * Human-readable caveat for the picker, e.g. "No extractable text" or
   * "Link preview only — full-page text not yet supported".
   */
  warning?: string;
}

/**
 * Turns any ContentNode into prompt-ready text. The `external` resolver is an
 * OG-metadata-only stub in v1; the future web-search plan fills it in place
 * without touching callers.
 */
export interface SourceContentResolver {
  resolve(node: ResolverNodeRef): Promise<ResolvedSourceContent>;
}

// ── Agentic metadata ─────────────────────────────────────────────────────

/**
 * Ownership of a metadata section, which governs whether the generator may
 * overwrite it (see plan → "Metadata doc sections by ownership"):
 *  - `ai`          → regenerated freely
 *  - `ai-proposed` → regenerated as a diff the human confirms
 *  - `human`       → never machine-written; the AI reads it only
 */
export type MetadataSectionOwner = "ai" | "ai-proposed" | "human";

export type MetadataSectionKind =
  | "summary"
  | "structure"
  | "role-strategy"
  | "directives";

/** Per-section provenance stored in `AgenticMetadata.sectionsMeta`. */
export interface MetadataSectionMeta {
  owner: MetadataSectionOwner;
  /** ISO timestamp of last generation, if machine-written. */
  generatedAt?: string;
  model?: string;
}

/** Default ownership per section kind. */
export const METADATA_SECTION_OWNERS: Record<
  MetadataSectionKind,
  MetadataSectionOwner
> = {
  summary: "ai",
  structure: "ai",
  "role-strategy": "ai-proposed",
  directives: "human",
};

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
