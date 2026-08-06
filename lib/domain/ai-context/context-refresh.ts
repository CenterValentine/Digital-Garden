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
import { getAiContextSettings } from "./settings";
import {
  applyGeneratedSections,
  assembleSourceText,
  computeSourceHash,
  getStoredAiSections,
  type MetadataNodeShape,
} from "./metadata";
import { createSourceContentResolver } from "./source-resolver";
import { getGenLockedNodeIds } from "./gen-lock";
import { getTodaySpend, recordSpend } from "./context-spend";

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
/**
 * Settle gate: a node must have been quiet this long before any drain may
 * spend on it (explicit Generate / right-click refresh bypass it). Enforced
 * at drain time against the metadata row's updatedAt — marking re-bumps it,
 * so an edit burst coalesces into one ripple ~10 minutes after it ends.
 */
const SETTLE_MINUTES = 10;

// ── Shapes ────────────────────────────────────────────────────────────────

export interface RefreshStats {
  scopeNodes: number;
  leavesRefreshed: number;
  leavesDamped: number;
  leavesFailed: number;
  foldersRefreshed: number;
  foldersDamped: number;
  /** Dirty nodes skipped because they were marked < SETTLE_MINUTES ago. */
  settleSkipped: number;
  /** LLM requests this drain made (counted against the daily ceiling). */
  generationCalls: number;
  /** True when the daily ceiling stopped the drain mid-way. */
  budgetStopped: boolean;
  capped: boolean;
}

export interface RefreshOptions {
  /** Explicit human command (Generate / right-click refresh): skip settle. */
  bypassSettle?: boolean;
}

export type RefreshOutcome =
  | { status: "off" }
  | { status: "unconfigured" }
  | { status: "skipped" }
  | { status: "budgetExhausted" }
  | { status: "ran"; stats: RefreshStats };

interface ScopeNode extends MetadataNodeShape {
  parentId: string | null;
  depth: number;
  meta: {
    exists: boolean;
    contextDirty: boolean;
    sourceContentHash: string | null;
    summaryHash: string | null;
    /** Last write to the metadata row — for dirty rows, the last mark. */
    markedAt: Date | null;
    optedOut: boolean;
  };
}

/** A leaf whose summary actually changed this run — folder patch input. */
interface ChangedChild {
  childId: string;
  title: string;
  oldSummary: string;
  newSummary: string;
  oldSummaryHash: string | null;
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
  const settings = getAiContextSettings(await getUserSettings(userId));
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
  rootId: string,
  options: RefreshOptions = {}
): Promise<RefreshOutcome> {
  const flightKey = `${userId}:${rootId}`;
  if (inFlight.has(flightKey)) return { status: "skipped" };
  inFlight.add(flightKey);
  try {
    return await runRefresh(userId, rootId, options);
  } finally {
    inFlight.delete(flightKey);
  }
}

async function runRefresh(
  userId: string,
  rootId: string,
  options: RefreshOptions
): Promise<RefreshOutcome> {
  const route = await resolvePrimaryRoute(userId, "studio-metadata");
  if (!route) return { status: "unconfigured" };

  // Daily spend ceiling — the last initiation gate before any scan/spend.
  // Checked again before every LLM call below; leftover work simply stays
  // dirty and drains after the UTC-midnight reset (or a raised cap).
  const cap = getAiContextSettings(await getUserSettings(userId)).dailyCallCap;
  let callsRemaining = cap - (await getTodaySpend(userId));
  if (callsRemaining <= 0) {
    logger.info({
      layer: "ai",
      event: "studio:context_refresh:budget_exhausted",
      summary: "daily auto-context budget reached — drain refused",
      attrs: { rootId, cap },
    });
    return { status: "budgetExhausted" };
  }

  const model = await resolveChatModelFromConnection(
    route.connection,
    route.modelId
  );

  const scope = await collectScope(userId, rootId);
  if (scope.length === 0) return { status: "skipped" };

  // Settle gate (drain-time debounce): covered nodes settle on their last
  // MARK (metadata updatedAt — every cascade re-mark resets the clock);
  // uncovered nodes settle on the content's own updatedAt, so a just-created
  // note isn't summarized mid-draft.
  const settleCutoff = Date.now() - SETTLE_MINUTES * 60_000;
  const isSettled = (node: ScopeNode): boolean => {
    if (options.bypassSettle) return true;
    const stamp = node.meta.exists
      ? (node.meta.markedAt?.getTime() ?? 0)
      : node.updatedAt.getTime();
    return stamp <= settleCutoff;
  };

  const stats: RefreshStats = {
    scopeNodes: scope.length,
    leavesRefreshed: 0,
    leavesDamped: 0,
    leavesFailed: 0,
    foldersRefreshed: 0,
    foldersDamped: 0,
    settleSkipped: 0,
    generationCalls: 0,
    budgetStopped: false,
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
    if (!isSettled(node)) {
      stats.settleSkipped += 1;
      continue;
    }
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

  // Anchors: stored AI sections for covered work nodes (echo-verbatim
  // contract) and for parent folders (pack orientation headers).
  const scopeById = new Map(scope.map((n) => [n.id, n]));
  const parentIds = [
    ...new Set(
      packable
        .map((p) => p.node.parentId)
        .filter((id): id is string => !!id)
    ),
  ];
  const anchors = await getStoredAiSections([
    ...packable.filter((p) => p.node.meta.exists).map((p) => p.node.id),
    ...parentIds,
  ]);

  // Packs group by PARENT FOLDER: only siblings share a call. Related
  // context sharpens each summary; unrelated branches never co-mingle
  // (the chocolate/lye rule).
  const packGroups = new Map<string, typeof packable>();
  for (const item of packable) {
    const key = item.node.parentId ?? "__rootless__";
    const list = packGroups.get(key) ?? [];
    list.push(item);
    packGroups.set(key, list);
  }

  const changedByParent = new Map<string, ChangedChild[]>();

  for (const [parentKey, group] of packGroups) {
    if (stats.budgetStopped) break;
    const parentNode = scopeById.get(parentKey);
    const orientation = {
      title: parentNode?.title,
      summary: anchors.get(parentKey)?.summary,
    };
    for (let i = 0; i < group.length; i += LEAF_BATCH_SIZE) {
      if (callsRemaining <= 0) {
        stats.budgetStopped = true;
        stats.capped = true;
        break;
      }
      const batch = group.slice(i, i + LEAF_BATCH_SIZE);
      callsRemaining -= 1;
      stats.generationCalls += 1;
      try {
        const results = await generateLeafBatch(model, batch, anchors, orientation);
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
          if (changed) {
            stats.leavesRefreshed += 1;
            if (node.parentId) {
              const list = changedByParent.get(node.parentId) ?? [];
              list.push({
                childId: node.id,
                title: node.title,
                oldSummary: anchors.get(node.id)?.summary ?? "",
                newSummary: generated.summary,
                oldSummaryHash: node.meta.summaryHash,
              });
              changedByParent.set(node.parentId, list);
            }
          } else {
            stats.leavesDamped += 1;
          }
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
  }

  // ── Folders (deepest-first, after their children) ───────────────────────
  const folderWork = scope
    .filter(
      (n) =>
        n.contentType === "folder" && (!n.meta.exists || n.meta.contextDirty)
    )
    .filter((n) => {
      if (isSettled(n)) return true;
      stats.settleSkipped += 1;
      return false;
    })
    .sort((a, b) => b.depth - a.depth)
    .slice(0, MAX_FOLDERS_PER_RUN);

  const folderAnchors = await getStoredAiSections(
    folderWork.filter((f) => f.meta.exists).map((f) => f.id)
  );

  for (const folder of folderWork) {
    if (callsRemaining <= 0) {
      stats.budgetStopped = true;
      stats.capped = true;
      break;
    }
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

      const anchor = folderAnchors.get(folder.id);
      const changed = changedByParent.get(folder.id) ?? [];

      // Incremental patch mode — only when PROVEN single-delta: substituting
      // the one changed child's OLD signal must reproduce the stored hash,
      // i.e. nothing else moved since the last roll-up. Prevents silent
      // drift from patches that would miss earlier unapplied child changes.
      let prompt: string | null = null;
      const single = changed.length === 1 ? changed[0] : null;
      if (single?.oldSummaryHash && anchor?.summary && folder.meta.exists) {
        const priorHash = await computeSourceHash(
          folder,
          new Map([[single.childId, single.oldSummaryHash]])
        );
        if (priorHash === folder.meta.sourceContentHash) {
          prompt = buildFolderPatchPrompt(folder, anchor, single);
        }
      }
      if (!prompt) {
        const sourceText = await assembleSourceText(folder);
        if (!sourceText.trim() && !folder.meta.exists) continue; // empty folder
        prompt = buildFolderPrompt(folder, sourceText, anchor);
      }

      callsRemaining -= 1;
      stats.generationCalls += 1;
      const { object } = await generateObject({
        model,
        schema: FolderSectionsSchema,
        prompt,
        temperature: 0,
      });
      const { changed: rollupChanged } = await applyGeneratedSections(
        folder,
        object,
        route.modelId
      );
      if (rollupChanged) stats.foldersRefreshed += 1;
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

  await recordSpend(userId, stats.generationCalls);

  logger.info({
    layer: "ai",
    event: "studio:context_refresh:completed",
    summary: "auto-context refresh drained scope",
    attrs: { rootId, model: route.modelId, ...stats },
  });
  return { status: "ran", stats };
}

// ── Piggyback ripple (the epicenter mechanism) ────────────────────────────

/** Min gap between piggyback drains per user (per instance, best effort). */
const RIPPLE_THROTTLE_MS = 60_000;
const lastRippleAt = new Map<string, number>();

/**
 * Called (fire-and-forget, via after()) from the PATCH dirty-hook: the
 * user's own editing traffic powers the ripple engine — no timers, no
 * polling. Cost when there's nothing to do: one throttled indexed query.
 *
 * Targets the scope of a FOUND settled-dirty node (guaranteed productive)
 * rather than the just-edited epicenter, whose own mark is by definition
 * fresh and settle-gated; the epicenter drains the same way ~10 minutes
 * after its edit burst ends, carried by later requests.
 */
export async function maybeRippleFromEdit(userId: string): Promise<void> {
  try {
    const last = lastRippleAt.get(userId) ?? 0;
    if (Date.now() - last < RIPPLE_THROTTLE_MS) return;
    lastRippleAt.set(userId, Date.now());

    const cutoff = new Date(Date.now() - SETTLE_MINUTES * 60_000);
    const settled = await prisma.agenticMetadata.findFirst({
      where: {
        contextDirty: true,
        updatedAt: { lt: cutoff },
        node: { ownerId: userId, deletedAt: null },
      },
      select: {
        node: { select: { id: true, parentId: true, contentType: true } },
      },
    });
    if (!settled) return;

    const rootId =
      settled.node.contentType === "folder"
        ? settled.node.id
        : (settled.node.parentId ?? settled.node.id);
    await refreshContextOnAccess(userId, rootId);
  } catch (error) {
    logger.warn({
      layer: "ai",
      event: "studio:context_refresh:ripple_caught",
      summary: "piggyback ripple failed — work stays dirty",
      error,
    });
  }
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
    const settings = getAiContextSettings(await getUserSettings(ownerId));
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
        select: {
          contextDirty: true,
          sourceContentHash: true,
          summaryHash: true,
          updatedAt: true,
          contextOptOut: true,
        },
      },
    },
  });
  // Privacy: an opted-out root yields an empty scope — nothing is read.
  if (!root || root.agenticMetadata?.contextOptOut) return [];

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
      summaryHash: node.agenticMetadata?.summaryHash ?? null,
      markedAt: node.agenticMetadata?.updatedAt ?? null,
      optedOut: node.agenticMetadata?.contextOptOut ?? false,
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
          select: {
            contextDirty: true,
            sourceContentHash: true,
            summaryHash: true,
            updatedAt: true,
            contextOptOut: true,
          },
        },
      },
      orderBy: [{ parentId: "asc" }, { displayOrder: "asc" }],
    });

    const nextFrontier: string[] = [];
    for (const child of children) {
      if (scope.length >= MAX_SCOPE_NODES) break;
      // Privacy: opted-out nodes never enter the scope, and an opted-out
      // FOLDER shields its entire subtree (no descent).
      if (child.agenticMetadata?.contextOptOut) continue;
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

/**
 * The echo-verbatim contract, shared by every anchored prompt. Verbatim echo
 * on unchanged meaning is what makes output-hash damping deterministic
 * instead of fighting sampling noise — the model itself becomes the
 * "did this change matter?" judge, at the cost of a few anchor tokens.
 */
const ANCHOR_RULE =
  "ANCHORING RULE: when an existing summary/structure is shown and it still accurately reflects the current content, return it VERBATIM, character for character. Rewrite only when the meaning actually changed.";

function buildFolderPrompt(
  folder: ScopeNode,
  sourceText: string,
  anchor?: { summary: string; structure: string }
): string {
  return [
    `You maintain a working "Context" document about one folder in a user's knowledge base.`,
    `Folder: "${folder.title}"`,
    `Summarize what this folder contains as a whole, based on its children's context below.`,
    anchor?.summary
      ? `\nExisting summary:\n${anchor.summary}\nExisting structure:\n${anchor.structure}\n\n${ANCHOR_RULE}`
      : "",
    "",
    "Children:",
    sourceText ||
      "(no children with extractable context — describe what can be inferred from the folder title alone, and say so)",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Incremental patch (single-delta proven by the caller): feed the existing
 * roll-up plus only the one child summary that changed — O(change) tokens
 * instead of O(children).
 */
function buildFolderPatchPrompt(
  folder: ScopeNode,
  anchor: { summary: string; structure: string },
  change: ChangedChild
): string {
  return [
    `You maintain a working "Context" document about the folder "${folder.title}" in a user's knowledge base.`,
    `Exactly one item inside it changed. Update the folder's summary/structure ONLY as far as this change actually affects them.`,
    "",
    `Current folder summary:\n${anchor.summary}`,
    `Current folder structure:\n${anchor.structure}`,
    "",
    `Changed item: "${change.title}"`,
    change.oldSummary ? `Its previous summary:\n${change.oldSummary}` : "",
    `Its new summary:\n${change.newSummary}`,
    "",
    ANCHOR_RULE,
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateLeafBatch(
  model: Parameters<typeof generateObject>[0]["model"],
  batch: Array<{ node: ScopeNode; text: string }>,
  anchors: Map<string, { summary: string; structure: string }>,
  orientation: { title?: string; summary?: string }
): Promise<Map<string, { summary: string; structure: string }>> {
  const docs = batch
    .map(({ node, text }) => {
      const anchor = anchors.get(node.id);
      return [
        `--- Document nodeId: ${node.id}`,
        `Title: "${node.title}" (type: ${node.contentType})`,
        anchor?.summary
          ? `Existing summary:\n${anchor.summary}\nExisting structure:\n${anchor.structure}`
          : "",
        "Content:",
        text.slice(0, LEAF_CHARS_IN_PACK) ||
          "(no extractable text — describe what can be inferred from the title and type alone, and say so)",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const { object } = await generateObject({
    model,
    schema: LeafBatchSchema,
    prompt: [
      `You maintain working "Context" documents about items in a user's knowledge base.`,
      orientation.title
        ? `The ${batch.length} documents below are siblings inside the folder "${orientation.title}". Use that shared setting to summarize each one well.`
        : `Below are ${batch.length} documents.`,
      orientation.summary
        ? `About this folder: ${orientation.summary.slice(0, 400)}`
        : "",
      `For EACH document, return one item with its nodeId copied exactly.`,
      "Keep every item strictly about its own document — never blend content, terminology, or claims across documents.",
      ANCHOR_RULE,
      "",
      docs,
    ]
      .filter(Boolean)
      .join("\n"),
    temperature: 0,
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
