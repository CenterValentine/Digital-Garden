/**
 * Agentic metadata service — the Context doc behind the Context tab.
 *
 * Ownership contract (frozen in types.ts): summary/structure are AI-owned and
 * regenerated freely; role-strategy is AI-PROPOSED (generation writes a
 * proposal, a human accepts or dismisses it); directives are human-owned and
 * never machine-written. Persistence is REST last-write-wins by design — this
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
import { resolvePrimaryRoute } from "@/lib/domain/ai/features/router";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";
import { stableHash } from "@/lib/core/stable-hash";
import { logger } from "@/lib/core/logger";
import type { MetadataSectionKind, MetadataSectionOwner } from "../types";
import { METADATA_SECTION_OWNERS } from "../types";
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
}

const SECTION_KINDS: MetadataSectionKind[] = [
  "summary",
  "structure",
  "role-strategy",
  "directives",
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
};

function buildDerivedText(sections: Record<MetadataSectionKind, string>): string {
  return SECTION_KINDS.filter((kind) => sections[kind].trim())
    .map((kind) => `## ${SECTION_LABELS[kind]}\n${sections[kind].trim()}`)
    .join("\n\n");
}

// ── Persistence helpers ───────────────────────────────────────────────────

interface StoredDoc {
  version: 1;
  sections: Partial<Record<MetadataSectionKind, JSONContent>>;
}

function readSections(tiptapJson: unknown): Record<MetadataSectionKind, string> {
  const doc = tiptapJson as StoredDoc | null;
  const out = {} as Record<MetadataSectionKind, string>;
  for (const kind of SECTION_KINDS) {
    out[kind] = fragmentToText(doc?.sections?.[kind]);
  }
  return out;
}

function writeSections(
  sections: Record<MetadataSectionKind, string>
): StoredDoc {
  const stored: StoredDoc = { version: 1, sections: {} };
  for (const kind of SECTION_KINDS) {
    if (sections[kind].trim()) {
      stored.sections[kind] = textToFragment(sections[kind]);
    }
  }
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
 */
export async function computeSourceHash(node: MetadataNodeShape): Promise<string> {
  if (node.contentType === "folder") {
    const children = await prisma.contentNode.findMany({
      where: { parentId: node.id, deletedAt: null },
      select: {
        id: true,
        title: true,
        bodyHash: true,
        updatedAt: true,
        agenticMetadata: { select: { summaryHash: true } },
      },
      orderBy: { id: "asc" },
    });
    return stableHash({
      folder: node.id,
      title: node.title,
      children: children.map((c) => ({
        id: c.id,
        title: c.title,
        signal:
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

  if (!record) {
    return {
      exists: false,
      sections: readSections(null),
      sectionsMeta: defaultMeta(),
      generatedAt: null,
      model: null,
      stale: false,
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
  };
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
  });
  return getMetadataForNode(userId, nodeId);
}

/** Accept or dismiss the pending Role & Strategy proposal. */
export async function resolveRoleStrategyProposal(
  userId: string,
  nodeId: string,
  action: "accept" | "dismiss"
): Promise<MetadataView | null> {
  const node = await loadOwnedNode(userId, nodeId);
  if (!node) return null;

  const record = await prisma.agenticMetadata.findUnique({ where: { nodeId } });
  if (!record) return getMetadataForNode(userId, nodeId);

  const sections = readSections(record.tiptapJson);
  const meta: SectionsMeta = {
    ...defaultMeta(),
    ...(record.sectionsMeta as SectionsMeta),
  };
  const rs = meta["role-strategy"] ?? { owner: "ai-proposed" as const };

  if (action === "accept" && rs.proposal) {
    sections["role-strategy"] = rs.proposal;
    meta["role-strategy"] = {
      owner: "ai-proposed",
      generatedAt: new Date().toISOString(),
      model: rs.model,
    };
  } else {
    meta["role-strategy"] = {
      owner: "ai-proposed",
      generatedAt: rs.generatedAt,
      model: rs.model,
    };
  }

  await upsertRecord(nodeId, sections, meta, {
    sourceContentHash: record.sourceContentHash,
    model: record.model,
    generatedAt: record.generatedAt,
    summaryHash: record.summaryHash,
    contextDirty: record.contextDirty,
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
  roleStrategy: z
    .string()
    .min(1)
    .describe(
      "The operation this content appears to serve, the strategy it advances, and how it relates to its sibling content. 2-3 sentences, hedged appropriately."
    ),
});

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

  const route = await resolvePrimaryRoute(userId, "studio-metadata");
  if (!route) throw new StudioModelUnavailableError();
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
  const promptLines = [
    `You maintain a working "Context" document about one item in a user's knowledge base.`,
    `Item: "${node.title}" (type: ${node.contentType})`,
    node.parent ? `It lives inside the folder "${node.parent.title}".` : "",
    existingSections.directives.trim()
      ? `The user's standing directives about this item (follow them):\n${existingSections.directives.trim()}`
      : "",
    "",
    "Content:",
    sourceText || "(no extractable text — describe what can be inferred from the title and type alone, and say so)",
  ].filter(Boolean);

  const { object } = await generateObject({
    model,
    schema: GeneratedSectionsSchema,
    prompt: promptLines.join("\n"),
  });

  const now = new Date();
  const stamp = { generatedAt: now.toISOString(), model: route.modelId };

  const sections = { ...existingSections };
  sections.summary = object.summary;
  sections.structure = object.structure;
  meta.summary = { owner: "ai", ...stamp };
  meta.structure = { owner: "ai", ...stamp };
  meta["role-strategy"] = {
    owner: "ai-proposed",
    generatedAt: meta["role-strategy"]?.generatedAt,
    model: meta["role-strategy"]?.model,
    proposal: object.roleStrategy,
    proposedAt: now.toISOString(),
  };

  const sourceContentHash = await computeSourceHash(node);
  await upsertRecord(nodeId, sections, meta, {
    sourceContentHash,
    model: route.modelId,
    generatedAt: now,
    summaryHash: hashAiSections(sections.summary, sections.structure),
    contextDirty: false,
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
        agenticMetadata: { select: { derivedText: true } },
      },
      orderBy: { displayOrder: "asc" },
    });
    if (children.length === 0) return "";
    return children
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
  }
): Promise<void> {
  const tiptapJson = writeSections(sections) as unknown as Prisma.InputJsonValue;
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
  generated: { summary: string; structure: string },
  modelId: string
): Promise<{ changed: boolean }> {
  const record = await prisma.agenticMetadata.findUnique({
    where: { nodeId: node.id },
  });
  const newSummaryHash = hashAiSections(generated.summary, generated.structure);
  const sourceContentHash = await computeSourceHash(node);

  if (record && record.summaryHash === newSummaryHash) {
    await prisma.agenticMetadata.update({
      where: { nodeId: node.id },
      data: { sourceContentHash, contextDirty: false },
    });
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

  await upsertRecord(node.id, sections, meta, {
    sourceContentHash,
    model: modelId,
    generatedAt: now,
    summaryHash: newSummaryHash,
    contextDirty: false,
  });
  return { changed: true };
}
