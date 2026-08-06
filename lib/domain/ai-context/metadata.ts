/**
 * Agentic metadata service — the Context doc behind the Context tab.
 *
 * Ownership contract (frozen in types.ts): summary/structure/role-strategy/
 * signals are AI-owned and regenerated freely (the role-strategy proposal
 * flow was retired — plan D18); directives are human-owned and never
 * machine-written. Persistence is REST last-write-wins by design — this
 * surface is deliberately NOT collaborative and never joins publishing,
 * export, or the collab schema.
 *
 * SERVER-ONLY (Prisma + AI SDK). Section content is stored as restricted
 * TipTap fragments (paragraphs only) so a richer editor can adopt the stored
 * shape later without migration; `derivedText` is the prompt-assembly form.
 */

import { generateObject } from "ai";
import { z } from "zod/v4";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { ContextMode } from "@/lib/database/generated/prisma";
import { explicitMode, resolveContextMode } from "./mode-resolve";
import { markContextDirty } from "./context-dirty";
import { resolvePrimaryRoute } from "@/lib/domain/ai/features/router";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";
import { stableHash } from "@/lib/core/stable-hash";
import { logger } from "@/lib/core/logger";
import type { MetadataSectionKind, MetadataSectionOwner } from "./types";
import { METADATA_SECTION_OWNERS } from "./types";
import { createSourceContentResolver } from "./source-resolver";

// ── Shapes ────────────────────────────────────────────────────────────────

interface SectionMetaRecord {
  owner: MetadataSectionOwner;
  generatedAt?: string;
  model?: string;
  /** role-strategy only: pending machine proposal awaiting human review. */
  proposal?: string;
  proposedAt?: string;
}

type SectionsMeta = Partial<Record<MetadataSectionKind, SectionMetaRecord>>;

/** Client-facing view of the Context doc. */
export interface MetadataView {
  exists: boolean;
  sections: Record<MetadataSectionKind, string>;
  sectionsMeta: SectionsMeta;
  generatedAt: string | null;
  model: string | null;
  /** True when source content changed since the last generation. */
  stale: boolean;
  /** Privacy opt-out: AI context never reads this node. */
  optedOut: boolean;
  /** Explicit per-node mode override; null = inherits (plan D6/D7). */
  contextMode: ContextMode | null;
  /** Effective mode after ancestor resolution — what the engine acts on. */
  resolvedMode: ContextMode;
}

const SECTION_KINDS: MetadataSectionKind[] = [
  "summary",
  "structure",
  "role-strategy",
  "directives",
  "signals",
];

// ── Restricted TipTap helpers (paragraphs only) ───────────────────────────

function textToFragment(text: string): JSONContent {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    }));
  return { type: "doc", content: paragraphs };
}

function fragmentToText(fragment: unknown): string {
  if (!fragment || typeof fragment !== "object") return "";
  const content = (fragment as JSONContent).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((node) =>
      (node.content ?? [])
        .map((child) => (typeof child.text === "string" ? child.text : ""))
        .join("")
    )
    .filter(Boolean)
    .join("\n");
}

const SECTION_LABELS: Record<MetadataSectionKind, string> = {
  summary: "Summary",
  structure: "Structure",
  "role-strategy": "Role & Strategy",
  directives: "Directives",
  signals: "Signals",
};

function buildDerivedText(sections: Record<MetadataSectionKind, string>): string {
  // Signals ride along deliberately: a parent roll-up that reads a child's
  // derived Context sees the child's gaps too, which is what lets root-level
  // gap aggregation work compositionally.
  return SECTION_KINDS.filter((kind) => sections[kind].trim())
    .map((kind) => `## ${SECTION_LABELS[kind]}\n${sections[kind].trim()}`)
    .join("\n\n");
}

// ── Persistence helpers ───────────────────────────────────────────────────

interface StoredDoc {
  version: 1;
  sections: Partial<Record<MetadataSectionKind, JSONContent>>;
  /**
   * One-sentence index line for the parent capsule's child index (plan D3).
   * Scalar, not a section: it never joins derivedText or the roll-up input —
   * it exists purely so folder capsules don't truncate summaries crudely.
   */
  oneLiner?: string;
}

function readSections(tiptapJson: unknown): Record<MetadataSectionKind, string> {
  const doc = tiptapJson as StoredDoc | null;
  const out = {} as Record<MetadataSectionKind, string>;
  for (const kind of SECTION_KINDS) {
    out[kind] = fragmentToText(doc?.sections?.[kind]);
  }
  return out;
}

/** The stored one-liner index line, if any (plan D3 — scalar, not a section). */
export function readOneLiner(tiptapJson: unknown): string | null {
  const doc = tiptapJson as StoredDoc | null;
  const line = doc?.oneLiner;
  return typeof line === "string" && line.trim() ? line.trim() : null;
}

function writeSections(
  sections: Record<MetadataSectionKind, string>,
  oneLiner?: string | null
): StoredDoc {
  const stored: StoredDoc = { version: 1, sections: {} };
  for (const kind of SECTION_KINDS) {
    if (sections[kind].trim()) {
      stored.sections[kind] = textToFragment(sections[kind]);
    }
  }
  if (oneLiner && oneLiner.trim()) stored.oneLiner = oneLiner.trim();
  return stored;
}

function defaultMeta(): SectionsMeta {
  const meta: SectionsMeta = {};
  for (const kind of SECTION_KINDS) {
    meta[kind] = { owner: METADATA_SECTION_OWNERS[kind] };
  }
  return meta;
}

/** Load the node, enforcing ownership. Returns null when absent/foreign. */
async function loadOwnedNode(userId: string, nodeId: string) {
  return prisma.contentNode.findFirst({
    where: { id: nodeId, ownerId: userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      contentType: true,
      bodyHash: true,
      updatedAt: true,
      parent: { select: { title: true } },
    },
  });
}

/** Minimal node shape the hash/generation helpers need. */
export interface MetadataNodeShape {
  id: string;
  contentType: string;
  bodyHash: string | null;
  updatedAt: Date;
  title: string;
}

/**
 * Canonical hash of the generation inputs, used for staleness. Leaves hash
 * their own identity signal; folders hash their DIRECT children (the roll-up
 * unit — children roll up one level by design, parents flow down only as
 * prompt input).
 *
 * Folders hash children's OUTPUT (summaryHash), not their input signals:
 * this is the cascade damping cut. A child edit that doesn't change the
 * child's summary leaves the folder's computed hash unchanged, so the folder
 * never looks stale and the invalidation wave stops at the child. Uncovered
 * children (no metadata yet) fall back to input signals so they still make
 * the folder stale until first covered.
 *
 * `overrideSignals` substitutes a child's signal (keyed by child id) — the
 * refresh engine uses it to prove single-delta staleness before choosing
 * incremental patch mode over a full roll-up rebuild.
 */
export async function computeSourceHash(
  node: MetadataNodeShape,
  overrideSignals?: Map<string, string>
): Promise<string> {
  if (node.contentType === "folder") {
    const children = await prisma.contentNode.findMany({
      where: { parentId: node.id, deletedAt: null },
      select: {
        id: true,
        title: true,
        bodyHash: true,
        updatedAt: true,
        agenticMetadata: {
          select: { summaryHash: true, contextOptOut: true, contextMode: true },
        },
      },
      orderBy: { id: "asc" },
    });
    return stableHash({
      folder: node.id,
      title: node.title,
      children: children
        // Opted-out children are invisible to the roll-up, so they can't
        // churn the folder's staleness either.
        .filter((c) => explicitMode(c.agenticMetadata) !== ContextMode.OPT_OUT)
        .map((c) => ({
          id: c.id,
          title: c.title,
          signal:
            overrideSignals?.get(c.id) ??
            c.agenticMetadata?.summaryHash ??
            c.bodyHash ??
            c.updatedAt.toISOString(),
        })),
    });
  }
  // Leaf hash keeps updatedAt as a catch-all for non-note payload changes
  // (file replaced, external URL edited). A cosmetic touch can false-stale a
  // leaf, costing one packed regen slot — damping stops it from cascading.
  return stableHash({
    id: node.id,
    title: node.title,
    bodyHash: node.bodyHash,
    updatedAt: node.updatedAt.toISOString(),
  });
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getMetadataForNode(
  userId: string,
  nodeId: string
): Promise<MetadataView | null> {
  const node = await loadOwnedNode(userId, nodeId);
  if (!node) return null;

  const record = await prisma.agenticMetadata.findUnique({
    where: { nodeId },
  });
  const resolvedMode = await resolveContextMode(nodeId);

  if (!record) {
    return {
      exists: false,
      sections: readSections(null),
      sectionsMeta: defaultMeta(),
      generatedAt: null,
      model: null,
      stale: false,
      optedOut: resolvedMode === ContextMode.OPT_OUT,
      contextMode: null,
      resolvedMode,
    };
  }

  const currentHash = await computeSourceHash(node);
  return {
    exists: true,
    sections: readSections(record.tiptapJson),
    sectionsMeta: {
      ...defaultMeta(),
      ...(record.sectionsMeta as SectionsMeta),
    },
    generatedAt: record.generatedAt?.toISOString() ?? null,
    model: record.model,
    stale:
      record.sourceContentHash !== null &&
      record.sourceContentHash !== currentHash,
    optedOut: resolvedMode === ContextMode.OPT_OUT,
    contextMode: record.contextMode,
    resolvedMode,
  };
}

/**
 * Set (or clear, with null = inherit) a node's explicit context mode.
 *
 * One `$transaction` for the row write plus the subtree dirty-mark (sweep
 * B3 — the old opt-out toggle wrote flags in two statements, letting a
 * concurrent dirty-mark land between them). Side effects (plan D8):
 *  - Any mode change marks the SUBTREE dirty so the next drain re-evaluates
 *    every descendant under the new resolved mode — marking is free, damping
 *    bounds the actual spend.
 *  - OPT_OUT clears the node's own bit (there is deliberately no work to do)
 *    and skips subtree marking (the subtree is shielded from scope anyway).
 *  - Ancestors are re-marked after the transaction via markContextDirty —
 *    a child's mode change alters what the parent roll-up may read.
 * Stored sections are retained on OPT_OUT — the user can still read what was
 * generated before opting out; the mode stops all future READS by the
 * context system. Downgrade-from-ENHANCED signal pruning lands with signals
 * themselves (Phase 2).
 */
export async function setContextMode(
  userId: string,
  nodeId: string,
  mode: ContextMode | null
): Promise<MetadataView | null> {
  const node = await loadOwnedNode(userId, nodeId);
  if (!node) return null;

  const optedOut = mode === ContextMode.OPT_OUT;
  const emptyDoc = writeSections(
    readSections(null)
  ) as unknown as Prisma.InputJsonValue;
  const emptyMeta = defaultMeta() as unknown as Prisma.InputJsonValue;

  await prisma.$transaction(async (tx) => {
    await tx.agenticMetadata.upsert({
      where: { nodeId },
      create: {
        nodeId,
        tiptapJson: emptyDoc,
        sectionsMeta: emptyMeta,
        derivedText: "",
        contextMode: mode,
        contextOptOut: optedOut,
        contextDirty: !optedOut,
      },
      update: {
        contextMode: mode,
        contextOptOut: optedOut,
        contextDirty: optedOut ? false : true,
      },
    });
    if (!optedOut && node.contentType === "folder") {
      // Subtree re-evaluation mark (bounded like every chain walk). Rows
      // explicitly opted out keep their own shield.
      await tx.$executeRaw`
        WITH RECURSIVE sub AS (
          SELECT id FROM "ContentNode" WHERE id = ${nodeId}::uuid
          UNION
          SELECT c.id FROM "ContentNode" c JOIN sub s ON c."parentId" = s.id
        )
        UPDATE "AgenticMetadata"
        SET "contextDirty" = true
        WHERE "nodeId" IN (SELECT id FROM sub LIMIT 400)
          AND "contextOptOut" = false
          AND ("contextMode" IS NULL OR "contextMode" <> 'OPT_OUT')
      `;
    }
  });

  // Ancestor chain re-mark (outside the transaction by design — it swallows
  // its own failures and must never roll back the mode write).
  await markContextDirty([node.id]);

  // Prune-on-downgrade (plan D8): a stale gaps list nobody maintains is
  // worse than none, and it would ride into every capsule. Applies to this
  // node only — descendants prune at their own next write via the B8
  // write-time re-check.
  if ((await resolveContextMode(nodeId)) !== ContextMode.ENHANCED) {
    const record = await prisma.agenticMetadata.findUnique({
      where: { nodeId },
    });
    if (record) {
      const sections = readSections(record.tiptapJson);
      if (sections.signals.trim()) {
        sections.signals = "";
        await upsertRecord(nodeId, sections, {
          ...defaultMeta(),
          ...(record.sectionsMeta as SectionsMeta),
        }, {
          sourceContentHash: record.sourceContentHash,
          model: record.model,
          generatedAt: record.generatedAt,
          summaryHash: record.summaryHash,
          contextDirty: record.contextDirty,
          oneLiner: readOneLiner(record.tiptapJson),
        });
      }
    }
  }

  return getMetadataForNode(userId, nodeId);
}

/**
 * Legacy boolean toggle — thin wrapper over setContextMode so both surfaces
 * share one write path (and the old two-statement race is gone).
 */
export async function setContextOptOut(
  userId: string,
  nodeId: string,
  optedOut: boolean
): Promise<MetadataView | null> {
  return setContextMode(
    userId,
    nodeId,
    optedOut ? ContextMode.OPT_OUT : null
  );
}

export class StudioContextOptedOutError extends Error {
  constructor() {
    super("This content is opted out of AI context.");
    this.name = "StudioContextOptedOutError";
  }
}

/** Persist the human-owned Directives section. Last write wins by design. */
export async function saveDirectives(
  userId: string,
  nodeId: string,
  directives: string
): Promise<MetadataView | null> {
  const node = await loadOwnedNode(userId, nodeId);
  if (!node) return null;

  const record = await prisma.agenticMetadata.findUnique({ where: { nodeId } });
  const sections = readSections(record?.tiptapJson ?? null);
  sections.directives = directives;

  const meta: SectionsMeta = {
    ...defaultMeta(),
    ...((record?.sectionsMeta as SectionsMeta) ?? {}),
  };

  await upsertRecord(nodeId, sections, meta, {
    sourceContentHash: record?.sourceContentHash ?? null,
    model: record?.model ?? null,
    generatedAt: record?.generatedAt ?? null,
    summaryHash: record?.summaryHash ?? null,
    contextDirty: record?.contextDirty ?? false,
    oneLiner: readOneLiner(record?.tiptapJson),
  });
  return getMetadataForNode(userId, nodeId);
}

/**
 * Guidance sections for prompt assembly (tool prompts slot these in). Reads
 * the accepted Role & Strategy and the human Directives — never proposals.
 */
export async function getGuidanceText(nodeId: string): Promise<{
  roleStrategy: string;
  directives: string;
}> {
  const record = await prisma.agenticMetadata.findUnique({
    where: { nodeId },
    select: { tiptapJson: true },
  });
  const sections = readSections(record?.tiptapJson ?? null);
  return {
    roleStrategy: sections["role-strategy"],
    directives: sections.directives,
  };
}

// ── Generation ────────────────────────────────────────────────────────────

export const ONE_LINER_DESC =
  "ONE sentence, under 120 characters, naming what this item is — rendered as its line in the parent folder's index.";
export const SIGNALS_DESC =
  "Gaps, ambiguities, and misalignments worth flagging: what seems missing given this item's apparent purpose, what is ambiguous, and any tension between the user's directives and the actual content. Short lines, hedged appropriately. Empty string when nothing is worth flagging.";

const GeneratedSectionsSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe("2-4 sentences: what this content is about and what it covers."),
  structure: z
    .string()
    .min(1)
    .describe(
      "How the content is organized — main parts/headings and their flow, as short lines."
    ),
  oneLiner: z.string().min(1).describe(ONE_LINER_DESC),
  roleStrategy: z
    .string()
    .min(1)
    .describe(
      "The operation this content appears to serve, the strategy it advances, and how it relates to its sibling content. 2-3 sentences, hedged appropriately."
    ),
});

const EnhancedGeneratedSectionsSchema = GeneratedSectionsSchema.extend({
  signals: z.string().describe(SIGNALS_DESC),
});

/**
 * Model route for context generation. ENHANCED nodes use the dedicated
 * `ai-context-enhanced` route; when it is unconfigured we FALL BACK to the
 * standard `studio-metadata` route rather than silently skipping signals
 * (sweep B6) — the rail surfaces "configure enhanced route" separately.
 */
export async function resolveContextGenerationRoute(
  userId: string,
  enhanced: boolean
): Promise<{
  route: NonNullable<Awaited<ReturnType<typeof resolvePrimaryRoute>>>;
  enhancedFellBack: boolean;
} | null> {
  if (enhanced) {
    const enhancedRoute = await resolvePrimaryRoute(userId, "ai-context-enhanced");
    if (enhancedRoute) return { route: enhancedRoute, enhancedFellBack: false };
    const standard = await resolvePrimaryRoute(userId, "studio-metadata");
    if (!standard) return null;
    logger.warn({
      layer: "ai",
      event: "ai_context:enhanced_route_fallback",
      summary:
        "ai-context-enhanced route unconfigured — signals generating on the standard route's model",
      attrs: { userId },
    });
    return { route: standard, enhancedFellBack: true };
  }
  const route = await resolvePrimaryRoute(userId, "studio-metadata");
  return route ? { route, enhancedFellBack: false } : null;
}

export class StudioModelUnavailableError extends Error {
  constructor() {
    super(
      "No model available for Studio Context Generation. Configure one under Settings → AI → Feature Routing."
    );
    this.name = "StudioModelUnavailableError";
  }
}

/**
 * Generate (or regenerate) the Context doc for one node.
 *
 * Leaves feed the source resolver's text; folders roll up their direct
 * children's Context summaries (falling back to bare titles for children
 * without metadata). Summary/structure overwrite freely; role-strategy lands
 * as a PROPOSAL for the human to accept; directives are read, never written.
 */
export async function generateMetadataForNode(
  userId: string,
  nodeId: string
): Promise<MetadataView | null> {
  const node = await loadOwnedNode(userId, nodeId);
  if (!node) return null;

  // Resolution covers inherited opt-out too (an ancestor's shield applies).
  const resolvedMode = await resolveContextMode(nodeId);
  if (resolvedMode === ContextMode.OPT_OUT) throw new StudioContextOptedOutError();
  const enhanced = resolvedMode === ContextMode.ENHANCED;

  const routing = await resolveContextGenerationRoute(userId, enhanced);
  if (!routing) throw new StudioModelUnavailableError();
  const { route } = routing;
  const model = await resolveChatModelFromConnection(
    route.connection,
    route.modelId
  );

  const record = await prisma.agenticMetadata.findUnique({ where: { nodeId } });
  const existingSections = readSections(record?.tiptapJson ?? null);
  const meta: SectionsMeta = {
    ...defaultMeta(),
    ...((record?.sectionsMeta as SectionsMeta) ?? {}),
  };

  const sourceText = await assembleSourceText(node);
  // B1: hash the inputs BEFORE the LLM call — this is the hash the generated
  // sections actually correspond to (write-time revalidation happens below).
  const sourceHashAtRead = await computeSourceHash(node);
  const promptLines = [
    `You maintain a working "Context" document about one item in a user's knowledge base.`,
    `Item: "${node.title}" (type: ${node.contentType})`,
    node.parent ? `It lives inside the folder "${node.parent.title}".` : "",
    existingSections.directives.trim()
      ? `The user's standing directives about this item (follow them):\n${existingSections.directives.trim()}`
      : "",
    enhanced && existingSections["role-strategy"].trim()
      ? `Accepted Role & Strategy for this item (flag any misalignment with the actual content in your signals):\n${existingSections["role-strategy"].trim()}`
      : "",
    "",
    "Content:",
    sourceText || "(no extractable text — describe what can be inferred from the title and type alone, and say so)",
  ].filter(Boolean);
  const prompt = promptLines.join("\n");

  // temperature 0 across the metadata lane: greedy decoding keeps outputs
  // stable on unchanged inputs, which is what makes output-hash damping
  // (summaryHash comparison) meaningful rather than sampling noise.
  let generated: {
    summary: string;
    structure: string;
    oneLiner: string;
    roleStrategy: string;
    signals?: string;
  };
  if (enhanced) {
    const { object } = await generateObject({
      model,
      schema: EnhancedGeneratedSectionsSchema,
      prompt,
      temperature: 0,
    });
    generated = object;
  } else {
    const { object } = await generateObject({
      model,
      schema: GeneratedSectionsSchema,
      prompt,
      temperature: 0,
    });
    generated = object;
  }

  const now = new Date();
  const stamp = { generatedAt: now.toISOString(), model: route.modelId };

  const sections = { ...existingSections };
  sections.summary = generated.summary;
  sections.structure = generated.structure;
  meta.summary = { owner: "ai", ...stamp };
  meta.structure = { owner: "ai", ...stamp };
  // Role & Strategy writes directly — the accept/dismiss proposal flow was
  // retired (owner call 2026-08-06): the AI's read is applied as-is.
  sections["role-strategy"] = generated.roleStrategy;
  meta["role-strategy"] = { owner: "ai", ...stamp };

  // B8 write-time mode re-check: a downgrade that landed during the LLM call
  // must not re-plant signals — and any leftover signals from a prior
  // ENHANCED life are pruned on regeneration under a lower mode.
  const modeAtWrite = await resolveContextMode(nodeId);
  if (modeAtWrite === ContextMode.ENHANCED && generated.signals !== undefined) {
    sections.signals = generated.signals;
    meta.signals = { owner: "ai", ...stamp };
  } else {
    sections.signals = "";
  }

  // Write-time revalidation (sweep B1): an edit that landed during the LLM
  // call must keep the node dirty — see applyGeneratedSections for the full
  // rationale.
  const live = await prisma.contentNode.findUnique({
    where: { id: nodeId },
    select: { title: true, bodyHash: true, updatedAt: true },
  });
  const sourceHashAtWrite = await computeSourceHash(
    live ? { ...node, ...live } : node
  );
  await upsertRecord(nodeId, sections, meta, {
    sourceContentHash: sourceHashAtRead,
    model: route.modelId,
    generatedAt: now,
    summaryHash: hashAiSections(sections.summary, sections.structure),
    contextDirty: sourceHashAtWrite !== sourceHashAtRead,
    oneLiner: generated.oneLiner,
  });

  logger.info({
    layer: "ai",
    event: "studio:metadata:generated",
    summary: `studio metadata generated for ${node.contentType} node`,
    attrs: { nodeId, model: route.modelId, promptChars: sourceText.length },
  });

  return getMetadataForNode(userId, nodeId);
}

export async function assembleSourceText(node: {
  id: string;
  title: string;
  contentType: string;
}): Promise<string> {
  if (node.contentType === "folder") {
    const children = await prisma.contentNode.findMany({
      where: { parentId: node.id, deletedAt: null },
      select: {
        id: true,
        title: true,
        contentType: true,
        agenticMetadata: {
          select: { derivedText: true, contextOptOut: true, contextMode: true },
        },
      },
      orderBy: { displayOrder: "asc" },
    });
    // Privacy: opted-out children are excluded entirely — not even their
    // titles reach the roll-up prompt.
    const visible = children.filter(
      (child) => explicitMode(child.agenticMetadata) !== ContextMode.OPT_OUT
    );
    if (visible.length === 0) return "";
    return visible
      .map((child) => {
        const context = child.agenticMetadata?.derivedText?.trim();
        return context
          ? `### ${child.title} (${child.contentType})\n${context}`
          : `### ${child.title} (${child.contentType})\n(no context generated yet)`;
      })
      .join("\n\n");
  }

  const resolver = createSourceContentResolver();
  const resolved = await resolver.resolve({
    id: node.id,
    contentType: node.contentType,
    title: node.title,
  });
  // Image files land here with empty text until the vision pass (deferred
  // Phase 2 follow-up) — the honest empty flag flows into the prompt above.
  return resolved.text;
}

async function upsertRecord(
  nodeId: string,
  sections: Record<MetadataSectionKind, string>,
  meta: SectionsMeta,
  fields: {
    sourceContentHash: string | null;
    model: string | null;
    generatedAt: Date | null;
    summaryHash: string | null;
    contextDirty: boolean;
    /** Index line for parent capsules; pass the preserved value on non-generation writes. */
    oneLiner: string | null;
  }
): Promise<void> {
  const tiptapJson = writeSections(
    sections,
    fields.oneLiner
  ) as unknown as Prisma.InputJsonValue;
  const sectionsMeta = meta as unknown as Prisma.InputJsonValue;
  const derivedText = buildDerivedText(sections);

  const data = {
    tiptapJson,
    sectionsMeta,
    derivedText,
    sourceContentHash: fields.sourceContentHash,
    model: fields.model,
    generatedAt: fields.generatedAt,
    summaryHash: fields.summaryHash,
    contextDirty: fields.contextDirty,
  };

  await prisma.agenticMetadata.upsert({
    where: { nodeId },
    create: { nodeId, ...data },
    update: data,
  });
}

/** Output hash of the AI-owned sections — the damping signal. */
function hashAiSections(summary: string, structure: string): string {
  return stableHash({ summary, structure });
}

/**
 * Bulk-read the stored AI-owned sections for a set of nodes — the anchor
 * text for anchored regeneration (the refresh engine slots each node's
 * existing summary/structure into the prompt with an echo-verbatim
 * contract, making the model the semantic-significance judge).
 */
export async function getStoredAiSections(
  nodeIds: string[]
): Promise<
  Map<
    string,
    {
      summary: string;
      structure: string;
      oneLiner: string | null;
      signals: string;
    }
  >
> {
  const out = new Map<
    string,
    {
      summary: string;
      structure: string;
      oneLiner: string | null;
      signals: string;
    }
  >();
  if (nodeIds.length === 0) return out;
  const records = await prisma.agenticMetadata.findMany({
    where: { nodeId: { in: nodeIds } },
    select: { nodeId: true, tiptapJson: true },
  });
  for (const record of records) {
    const sections = readSections(record.tiptapJson);
    out.set(record.nodeId, {
      summary: sections.summary,
      structure: sections.structure,
      oneLiner: readOneLiner(record.tiptapJson),
      signals: sections.signals,
    });
  }
  return out;
}

/**
 * Write freshly generated AI-owned sections (summary/structure) for a node,
 * with output-hash damping. Role-strategy and directives are preserved
 * untouched — the auto-refresh path never writes proposals; only explicit
 * generation does.
 *
 * Returns `changed: false` when the new output matches the stored
 * summaryHash: the staleness hash is refreshed and the dirty bit cleared,
 * but sections aren't rewritten — and since ancestors hash this node's
 * summaryHash, the cascade stops here.
 */
export async function applyGeneratedSections(
  node: MetadataNodeShape,
  generated: {
    summary: string;
    structure: string;
    oneLiner?: string;
    signals?: string;
  },
  modelId: string,
  sourceHashAtRead: string
): Promise<{ changed: boolean }> {
  const record = await prisma.agenticMetadata.findUnique({
    where: { nodeId: node.id },
  });
  const newSummaryHash = hashAiSections(generated.summary, generated.structure);

  // B8 write-time mode re-check: signals persist only while the node is
  // ENHANCED at the moment of the write — a mid-flight downgrade must not
  // re-plant a pruned section.
  const modeAtWrite = await resolveContextMode(node.id);
  const signalsAllowed = modeAtWrite === ContextMode.ENHANCED;

  // Write-time revalidation (plan → sweep B1): re-fetch the node and recompute
  // the source hash NOW. The in-memory `node` carries READ-time fields, so a
  // fresh fetch is what detects an edit that landed during the LLM call. On a
  // mismatch the dirty bit stays SET (the next drain re-runs) and we store the
  // READ-time hash, keeping the stale detector honest about which content
  // these sections actually reflect. Clearing unconditionally here was a
  // lost-update race: the mid-flight edit's mark got erased and the node
  // looked clean while its context was stale.
  const live = await prisma.contentNode.findUnique({
    where: { id: node.id },
    select: { title: true, bodyHash: true, updatedAt: true },
  });
  const sourceHashAtWrite = await computeSourceHash(
    live ? { ...node, ...live } : node
  );
  const contextDirty = sourceHashAtWrite !== sourceHashAtRead;

  if (record && record.summaryHash === newSummaryHash) {
    // Damped on summary/structure — but oneLiner/signals may still have
    // moved (they are excluded from the damping hash so meaning-neutral
    // wording tweaks in them never cascade upward). Side-write them when
    // they differ; the cascade still stops here (changed: false).
    const sections = readSections(record.tiptapJson);
    const storedOneLiner = readOneLiner(record.tiptapJson);
    const nextOneLiner = generated.oneLiner?.trim() || storedOneLiner;
    const nextSignals = signalsAllowed
      ? (generated.signals ?? sections.signals)
      : "";
    if (nextOneLiner !== storedOneLiner || nextSignals !== sections.signals) {
      const meta: SectionsMeta = {
        ...defaultMeta(),
        ...(record.sectionsMeta as SectionsMeta),
      };
      if (signalsAllowed && nextSignals !== sections.signals) {
        meta.signals = {
          owner: "ai",
          generatedAt: new Date().toISOString(),
          model: modelId,
        };
      }
      sections.signals = nextSignals;
      await upsertRecord(node.id, sections, meta, {
        sourceContentHash: sourceHashAtRead,
        model: record.model,
        generatedAt: record.generatedAt,
        summaryHash: record.summaryHash,
        contextDirty,
        oneLiner: nextOneLiner,
      });
    } else {
      await prisma.agenticMetadata.update({
        where: { nodeId: node.id },
        data: { sourceContentHash: sourceHashAtRead, contextDirty },
      });
    }
    return { changed: false };
  }

  const sections = readSections(record?.tiptapJson ?? null);
  const meta: SectionsMeta = {
    ...defaultMeta(),
    ...((record?.sectionsMeta as SectionsMeta) ?? {}),
  };
  const now = new Date();
  const stamp = { generatedAt: now.toISOString(), model: modelId };
  sections.summary = generated.summary;
  sections.structure = generated.structure;
  meta.summary = { owner: "ai", ...stamp };
  meta.structure = { owner: "ai", ...stamp };
  if (signalsAllowed && generated.signals !== undefined) {
    sections.signals = generated.signals;
    meta.signals = { owner: "ai", ...stamp };
  } else if (!signalsAllowed) {
    sections.signals = "";
  }

  await upsertRecord(node.id, sections, meta, {
    sourceContentHash: sourceHashAtRead,
    model: modelId,
    generatedAt: now,
    summaryHash: newSummaryHash,
    contextDirty,
    oneLiner:
      generated.oneLiner?.trim() || readOneLiner(record?.tiptapJson ?? null),
  });
  return { changed: true };
}
