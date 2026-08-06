/**
 * AI-context substrate types — the per-node agentic metadata layer.
 *
 * Graduated out of `extensions/studio/` (2026-08 — see
 * docs/notes-feature/work-tracking/FOLDER-CONTEXT-CAPSULE-PLAN.md): the layer
 * is per-ContentNode content-graph infrastructure consumed by studio, chat
 * folder mentions, and playbooks. Pure types only — no React, no Prisma — so
 * both client and server code can import them freely.
 *
 * Studio-specific types (shelves, tools, source selection, generation runs)
 * remain in `extensions/studio/types.ts`, which re-exports these for its
 * internal consumers.
 */

// ── Source content resolution ────────────────────────────────────────────

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
 * overwrite it:
 *  - `ai`          → regenerated freely
 *  - `human`       → never machine-written; the AI reads it only
 *
 * `ai-proposed` (regenerate-as-a-diff-the-human-confirms) is RETIRED (owner
 * call 2026-08-06 during smoke: "just go with whatever the AI comes up
 * with"). The union keeps the literal so rows written before retirement
 * still parse; renderers normalize it to `ai`.
 */
export type MetadataSectionOwner = "ai" | "ai-proposed" | "human";

export type MetadataSectionKind =
  | "summary"
  | "structure"
  | "role-strategy"
  | "directives"
  | "signals";

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
  "role-strategy": "ai",
  directives: "human",
  // Gaps / ambiguities / misalignment notes — generated only for nodes whose
  // resolved contextMode is ENHANCED (plan D10); pruned on downgrade (D8).
  signals: "ai",
};
