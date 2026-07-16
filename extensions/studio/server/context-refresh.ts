/**
 * AI-context refresh engine (Folder Studio auto-context V1).
 *
 * Drains dirty/uncovered AgenticMetadata inside a bounded scope with four
 * efficiency mechanisms, so a refresh never means "one LLM call per dirty
 * document":
 *
 *  A. Output-hash damping — applyGeneratedSections skips the write (and the
 *     upward cascade) when the regenerated summary is unchanged; folders
 *     verify staleness against children's summaryHash BEFORE spending.
 *  B. Compositional roll-ups — folders regenerate from direct children's
 *     derived Context only (via assembleSourceText), never subtree bodies,
 *     so ancestor cost is O(children), not O(subtree).
 *  C. Packed leaf batches — up to LEAF_BATCH_SIZE documents per
 *     generateObject call with an array schema; the instruction overhead
 *     amortizes and rate-limit pressure drops ~an order of magnitude.
 *  D. Deepest-first ordering — leaves before folders, folders deepest-first,
 *     so parents always consume this run's fresh child summaries.
 *
 * Auto-refresh writes ONLY the AI-owned sections (summary/structure). It
 * never writes role-strategy proposals — those come from explicit Generate
 * only, so background work can't spam the human review queue.
 *
 * Caps make every invocation cheap and idempotent: remaining work stays
 * dirty and drains on the next access or sweep. Failures leave bits set
 * (retry naturally) and are logged, never thrown to callers.
 */

import { generateObject } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import { getUserSettings } from "@/lib/features/settings";
import { resolvePrimaryRoute } from "@/lib/domain/ai/features/router";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";
import { stableHash } from "@/lib/core/stable-hash";
import { logger } from "@/lib/core/logger";
import { getStudioSettings } from "../settings";
import {
  applyGeneratedSections,
  assembleSourceText,
  computeSourceHash,
  type MetadataNodeShape,
} from "./metadata";
import { createSourceContentResolver } from "./source-resolver";
import { getGenLockedNodeIds } from "./gen-lock";

// ── Budgets ───────────────────────────────────────────────────────────────

/** BFS scope bound — mirrors source-selection's scan cap. */
const MAX_SCOPE_NODES = 200;
/** Leaf regens per invocation; the rest stays dirty for the next drain. */
const MAX_LEAVES_PER_RUN = 24;
/** Folder roll-up regens per invocation. */
const MAX_FOLDERS_PER_RUN = 12;
/** Documents packed into one generateObject call. */
const LEAF_BATCH_SIZE = 8;
/** Per-document text cap inside a pack (chars). */
const LEAF_CHARS_IN_PACK = 6000;

// ── Shapes ────────────────────────────────────────────────────────────────

export interface RefreshStats {
  scopeNodes: number;
  leavesRefreshed: number;
  leavesDamped: number;
  leavesFailed: number;
  foldersRefreshed: number;
  foldersDamped: number;
  capped: boolean;
}

export type RefreshOutcome =
  | { status: "off" }
  | { status: "unconfigured" }
  | { status: "skipped" }
  | { status: "ran"; stats: RefreshStats };

interface ScopeNode extends MetadataNodeShape {
  parentId: string | null;
  depth: number;
  meta: {
    exists: boolean;
    contextDirty: boolean;
    sourceContentHash: string | null;
  };
}

// ── Entry points ──────────────────────────────────────────────────────────

/**
 * On-access entry (stale-while-revalidate): called via after() from
 * context-consuming surfaces. Gates on the user's autoContextMode.
 */
export async function refreshContextOnAccess(
  userId: string,
  rootId: string
): Promise<RefreshOutcome> {
  const settings = getStudioSettings(await getUserSettings(userId));
  if (settings.autoContextMode === "off") return { status: "off" };
  return refreshScope(userId, rootId);
}

// Same-instance dedup: overlapping accesses to the same scope (Fluid Compute
// reuses instances) coalesce instead of double-spending. Cross-instance
// overlap is bounded by damping — the second run finds no changed outputs.
const inFlight = new Set<string>();

/**
 * Drain dirty/uncovered context in the subtree rooted at rootId (or the
 * single node when rootId is a leaf). Caller is responsible for mode gating.
 */
export async function refreshScope(
  userId: string,
  rootId: string
): Promise<RefreshOutcome> {
  const flightKey = `${userId}:${rootId}`;
  if (inFlight.has(flightKey)) return { status: "skipped" };
  inFlight.add(flightKey);
  try {
    return await runRefresh(userId, rootId);
  } finally {
    inFlight.delete(flightKey);
  }
}

async function runRefresh(
  userId: string,
  rootId: string
): Promise<RefreshOutcome> {
  const route = await resolvePrimaryRoute(userId, "studio-metadata");
  if (!route) return { status: "unconfigured" };
  const model = await resolveChatModelFromConnection(
    route.connection,
    route.modelId
  );

  const scope = await collectScope(userId, rootId);
  if (scope.length === 0) return { status: "skipped" };

  const stats: RefreshStats = {
    scopeNodes: scope.length,
    leavesRefreshed: 0,
    leavesDamped: 0,
    leavesFailed: 0,
    foldersRefreshed: 0,
    foldersDamped: 0,
    capped: false,
  };

  // ── Leaves ──────────────────────────────────────────────────────────────
  const leafCandidates = scope.filter(
    (n) => n.contentType !== "folder" && (!n.meta.exists || n.meta.contextDirty)
  );
  const genLocked = await getGenLockedNodeIds(
    userId,
    leafCandidates.map((n) => n.id)
  );

  const leafWork: ScopeNode[] = [];
  const bitClearOnly: string[] = [];
  for (const node of leafCandidates) {
    if (genLocked.has(node.id)) continue; // studio outputs: never auto-covered
    // Leaf source hashes are pure functions of fields already in hand —
    // verify true staleness before spending. Over-marked bits clear free.
    if (node.meta.exists) {
      const currentHash = await computeSourceHash(node);
      if (currentHash === node.meta.sourceContentHash) {
        bitClearOnly.push(node.id);
        continue;
      }
    }
    leafWork.push(node);
  }
  if (bitClearOnly.length > 0) {
    await prisma.agenticMetadata.updateMany({
      where: { nodeId: { in: bitClearOnly } },
      data: { contextDirty: false },
    });
    stats.leavesDamped += bitClearOnly.length;
  }

  // BFS scope order = shallowest first: the nodes a folder chat or Context
  // roll-up needs soonest get the capped slots.
  const cappedLeaves = leafWork.slice(0, MAX_LEAVES_PER_RUN);
  if (leafWork.length > cappedLeaves.length) stats.capped = true;

  const resolver = createSourceContentResolver();
  const packable: Array<{ node: ScopeNode; text: string }> = [];
  for (const node of cappedLeaves) {
    const resolved = await resolver.resolve({
      id: node.id,
      contentType: node.contentType,
      title: node.title,
    });
    // Uncovered + empty (images pre-vision-pass, blank notes): generating a
    // "this is empty" summary wastes tokens and pollutes roll-ups — skip.
    // Dirty + empty means content was REMOVED; regenerate honestly.
    if (resolved.empty && !node.meta.exists) continue;
    packable.push({ node, text: resolved.text });
  }

  for (let i = 0; i < packable.length; i += LEAF_BATCH_SIZE) {
    const batch = packable.slice(i, i + LEAF_BATCH_SIZE);
    try {
      const results = await generateLeafBatch(model, batch);
      for (const { node } of batch) {
        const generated = results.get(node.id);
        if (!generated) {
          stats.leavesFailed += 1; // stays dirty; retried next drain
          continue;
        }
        const { changed } = await applyGeneratedSections(
          node,
          generated,
          route.modelId
        );
        if (changed) stats.leavesRefreshed += 1;
        else stats.leavesDamped += 1;
      }
    } catch (error) {
      stats.leavesFailed += batch.length;
      logger.error({
        layer: "ai",
        event: "studio:context_refresh:leaf_batch_caught",
        summary: "packed leaf context batch failed — nodes stay dirty",
        error,
        attrs: { rootId, batchSize: batch.length },
      });
    }
  }

  // ── Folders (deepest-first, after their children) ───────────────────────
  const folderWork = scope
    .filter(
      (n) =>
        n.contentType === "folder" && (!n.meta.exists || n.meta.contextDirty)
    )
    .sort((a, b) => b.depth - a.depth)
    .slice(0, MAX_FOLDERS_PER_RUN);

  for (const folder of folderWork) {
    try {
      // Damping cut: the folder hash is built from children's summaryHash,
      // so if no child's MEANING changed this run, the recomputed hash
      // matches the stored one and the cascade dies here — no spend.
      const currentHash = await computeSourceHash(folder);
      if (folder.meta.exists && currentHash === folder.meta.sourceContentHash) {
        await prisma.agenticMetadata.updateMany({
          where: { nodeId: folder.id },
          data: { contextDirty: false },
        });
        stats.foldersDamped += 1;
        continue;
      }

      const sourceText = await assembleSourceText(folder);
      if (!sourceText.trim() && !folder.meta.exists) continue; // empty folder

      const { object } = await generateObject({
        model,
        schema: FolderSectionsSchema,
        prompt: buildFolderPrompt(folder, sourceText),
      });
      const { changed } = await applyGeneratedSections(
        folder,
        object,
        route.modelId
      );
      if (changed) stats.foldersRefreshed += 1;
      else stats.foldersDamped += 1;
    } catch (error) {
      logger.error({
        layer: "ai",
        event: "studio:context_refresh:folder_caught",
        summary: "folder roll-up refresh failed — stays dirty",
        error,
        attrs: { folderId: folder.id },
      });
    }
  }

  logger.info({
    layer: "ai",
    event: "studio:context_refresh:completed",
    summary: "auto-context refresh drained scope",
    attrs: { rootId, model: route.modelId, ...stats },
  });
  return { status: "ran", stats };
}

// ── Nightly sweep (cron) ──────────────────────────────────────────────────

/** Users processed per sweep invocation; the rest wait for the next night. */
const SWEEP_MAX_USERS = 10;
/** Sweep roots per user per invocation (each root is one bounded drain). */
const SWEEP_MAX_ROOTS_PER_USER = 5;
/** Dirty rows sampled to discover sweep work. */
const SWEEP_SAMPLE_ROWS = 500;

export interface SweepStats {
  usersConsidered: number;
  usersSwept: number;
  rootsSwept: number;
}

/**
 * Cron entry: drain dirty context tree-wide for users who opted into
 * "on-access-sweep". Discovers work from the dirty-bit index (never a
 * full-table hash scan), groups it into subtree roots, and reuses the same
 * bounded refreshScope drains as on-access — caps stack multiplicatively,
 * so one invocation's worst case stays small and predictable. Unfinished
 * work simply stays dirty for tomorrow.
 */
export async function runContextSweep(): Promise<SweepStats> {
  const dirtyRows = await prisma.agenticMetadata.findMany({
    where: { contextDirty: true, node: { deletedAt: null } },
    select: {
      node: {
        select: {
          id: true,
          parentId: true,
          contentType: true,
          ownerId: true,
        },
      },
    },
    take: SWEEP_SAMPLE_ROWS,
  });

  const byOwner = new Map<
    string,
    Array<{ id: string; parentId: string | null; contentType: string }>
  >();
  for (const row of dirtyRows) {
    const list = byOwner.get(row.node.ownerId) ?? [];
    list.push(row.node);
    byOwner.set(row.node.ownerId, list);
  }

  const stats: SweepStats = {
    usersConsidered: byOwner.size,
    usersSwept: 0,
    rootsSwept: 0,
  };

  for (const [ownerId, nodes] of [...byOwner.entries()].slice(
    0,
    SWEEP_MAX_USERS
  )) {
    const settings = getStudioSettings(await getUserSettings(ownerId));
    if (settings.autoContextMode !== "on-access-sweep") continue;
    stats.usersSwept += 1;

    // Dirty folders drain their own subtree; dirty leaves drain from their
    // parent so sibling work packs into shared batches. Overlapping roots
    // cost little — the second drain finds damped/clean nodes.
    const roots = new Set<string>();
    for (const node of nodes) {
      roots.add(
        node.contentType === "folder" ? node.id : (node.parentId ?? node.id)
      );
      if (roots.size >= SWEEP_MAX_ROOTS_PER_USER) break;
    }
    for (const rootId of roots) {
      await refreshScope(ownerId, rootId);
      stats.rootsSwept += 1;
    }
  }

  logger.info({
    layer: "ai",
    event: "studio:context_sweep:completed",
    summary: "nightly auto-context sweep finished",
    attrs: { ...stats },
  });
  return stats;
}

// ── Scope collection ──────────────────────────────────────────────────────

async function collectScope(
  userId: string,
  rootId: string
): Promise<ScopeNode[]> {
  const root = await prisma.contentNode.findFirst({
    where: { id: rootId, ownerId: userId, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      title: true,
      contentType: true,
      bodyHash: true,
      updatedAt: true,
      agenticMetadata: {
        select: { contextDirty: true, sourceContentHash: true },
      },
    },
  });
  if (!root) return [];

  const toScopeNode = (
    node: typeof root & { parentId: string | null },
    depth: number
  ): ScopeNode => ({
    id: node.id,
    parentId: node.parentId,
    title: node.title,
    contentType: node.contentType,
    bodyHash: node.bodyHash,
    updatedAt: node.updatedAt,
    depth,
    meta: {
      exists: node.agenticMetadata !== null,
      contextDirty: node.agenticMetadata?.contextDirty ?? false,
      sourceContentHash: node.agenticMetadata?.sourceContentHash ?? null,
    },
  });

  const scope: ScopeNode[] = [toScopeNode(root, 0)];
  if (root.contentType !== "folder") return scope;

  let frontier = [root.id];
  let depth = 0;
  while (frontier.length > 0 && scope.length < MAX_SCOPE_NODES) {
    depth += 1;
    const children = await prisma.contentNode.findMany({
      where: { parentId: { in: frontier }, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        title: true,
        contentType: true,
        bodyHash: true,
        updatedAt: true,
        agenticMetadata: {
          select: { contextDirty: true, sourceContentHash: true },
        },
      },
      orderBy: [{ parentId: "asc" }, { displayOrder: "asc" }],
    });

    const nextFrontier: string[] = [];
    for (const child of children) {
      if (scope.length >= MAX_SCOPE_NODES) break;
      scope.push(toScopeNode(child, depth));
      if (child.contentType === "folder") nextFrontier.push(child.id);
    }
    frontier = nextFrontier;
  }
  return scope;
}

// ── Generation ────────────────────────────────────────────────────────────

const FolderSectionsSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe("2-4 sentences: what this content is about and what it covers."),
  structure: z
    .string()
    .min(1)
    .describe(
      "How the content is organized — main parts and their flow, as short lines."
    ),
});

const LeafBatchSchema = z.object({
  items: z.array(
    z.object({
      nodeId: z
        .string()
        .describe("The document's nodeId, copied exactly from the input."),
      summary: z
        .string()
        .min(1)
        .describe(
          "2-4 sentences: what this document is about and what it covers."
        ),
      structure: z
        .string()
        .min(1)
        .describe(
          "How the document is organized — main parts/headings and their flow, as short lines."
        ),
    })
  ),
});

function buildFolderPrompt(folder: ScopeNode, sourceText: string): string {
  return [
    `You maintain a working "Context" document about one folder in a user's knowledge base.`,
    `Folder: "${folder.title}"`,
    `Summarize what this folder contains as a whole, based on its children's context below.`,
    "",
    "Children:",
    sourceText ||
      "(no children with extractable context — describe what can be inferred from the folder title alone, and say so)",
  ].join("\n");
}

async function generateLeafBatch(
  model: Parameters<typeof generateObject>[0]["model"],
  batch: Array<{ node: ScopeNode; text: string }>
): Promise<Map<string, { summary: string; structure: string }>> {
  const docs = batch
    .map(({ node, text }) =>
      [
        `--- Document nodeId: ${node.id}`,
        `Title: "${node.title}" (type: ${node.contentType})`,
        "Content:",
        text.slice(0, LEAF_CHARS_IN_PACK) ||
          "(no extractable text — describe what can be inferred from the title and type alone, and say so)",
      ].join("\n")
    )
    .join("\n\n");

  const { object } = await generateObject({
    model,
    schema: LeafBatchSchema,
    prompt: [
      `You maintain working "Context" documents about items in a user's knowledge base.`,
      `Below are ${batch.length} documents. For EACH one, return one item with its nodeId copied exactly.`,
      "The documents are neighbors in the same folder tree — use that shared context to summarize each one well, but keep every item strictly about its own document.",
      "",
      docs,
    ].join("\n"),
  });

  const results = new Map<string, { summary: string; structure: string }>();
  const validIds = new Set(batch.map(({ node }) => node.id));
  for (const item of object.items) {
    if (validIds.has(item.nodeId)) {
      results.set(item.nodeId, {
        summary: item.summary,
        structure: item.structure,
      });
    }
  }
  // Hallucination audit: hashing keeps the log line bounded regardless of
  // how creative the model got with unknown nodeIds.
  const unknown = object.items.filter((i) => !validIds.has(i.nodeId));
  if (unknown.length > 0) {
    logger.warn({
      layer: "ai",
      event: "studio:context_refresh:unknown_node_ids",
      summary: "packed batch returned unknown nodeIds — dropped",
      attrs: {
        count: unknown.length,
        sample: stableHash(unknown.map((i) => i.nodeId)).slice(0, 12),
      },
    });
  }
  return results;
}
