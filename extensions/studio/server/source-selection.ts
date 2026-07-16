/**
 * Folder source selection — which contents ground a folder's chat.
 *
 * Default selection is breadth-first under a TOKEN budget (plan → "Default
 * source selection"): unnested leaves first, then each nesting level, until
 * the budget fills. Size-based, not count-based; unlimited depth while budget
 * allows. `capApplied` drives the one-time explanatory tooltip in the picker.
 *
 * Persistence is per (owner, folder) — one curated source set per folder in
 * v1; conversation-level overrides are a later refinement.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import { createSourceContentResolver } from "./source-resolver";
import { getGenLockedNodeIds } from "./gen-lock";
import { estimateTokens } from "../tokens";

// Guardrails: a pathological folder shouldn't turn one GET into thousands of
// payload queries. Beyond the cap the picker shows what it has and says so.
const MAX_SCANNED_NODES = 200;
export const DEFAULT_TOKEN_BUDGET = 64_000;

// ── Shapes ────────────────────────────────────────────────────────────────

export interface SourceRow {
  id: string;
  title: string;
  contentType: string;
  parentId: string;
  depth: number;
  /** Estimated tokens this node contributes when included (0 for folders). */
  tokens: number;
  /** No usable text — "NO TEXT" flag in the picker, excluded from defaults. */
  empty: boolean;
  truncated: boolean;
  warning?: string;
  /** Node has a generated Context doc (metadata is preferred at assembly). */
  hasContext: boolean;
  /**
   * Studio-generated output, unedited since generation — locked out of
   * sources to prevent the AI summarizing its own summaries (GEN lock).
   */
  genLocked: boolean;
}

export interface SelectionState {
  folderId: string;
  rows: SourceRow[];
  /** Included LEAF ids — folder tri-state is derived client-side. */
  includedNodeIds: string[];
  tokenBudget: number;
  estimatedTokens: number;
  capApplied: boolean;
  /** True when no stored selection exists (defaults shown). */
  isDefault: boolean;
  /** True when the scan stopped at MAX_SCANNED_NODES. */
  scanCapped: boolean;
}

// ── Descendant scan ───────────────────────────────────────────────────────

async function loadOwnedFolder(userId: string, folderId: string) {
  return prisma.contentNode.findFirst({
    where: {
      id: folderId,
      ownerId: userId,
      contentType: "folder",
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
}

/** Breadth-first descendant walk with depth annotation, capped. */
async function collectRows(
  folderId: string
): Promise<{ rows: SourceRow[]; scanCapped: boolean; leafIds: string[] }> {
  const resolver = createSourceContentResolver();
  const rows: SourceRow[] = [];
  let frontier = [folderId];
  let depth = 0;
  let scanned = 0;
  let scanCapped = false;

  while (frontier.length > 0 && !scanCapped) {
    depth += 1;
    const children = await prisma.contentNode.findMany({
      where: { parentId: { in: frontier }, deletedAt: null },
      select: {
        id: true,
        title: true,
        contentType: true,
        parentId: true,
        displayOrder: true,
        agenticMetadata: { select: { id: true } },
      },
      orderBy: [{ parentId: "asc" }, { displayOrder: "asc" }],
    });

    const nextFrontier: string[] = [];
    for (const child of children) {
      if (scanned >= MAX_SCANNED_NODES) {
        scanCapped = true;
        break;
      }
      scanned += 1;

      if (child.contentType === "folder") {
        rows.push({
          id: child.id,
          title: child.title,
          contentType: child.contentType,
          parentId: child.parentId ?? folderId,
          depth,
          tokens: 0,
          empty: true,
          truncated: false,
          hasContext: child.agenticMetadata !== null,
          genLocked: false,
        });
        nextFrontier.push(child.id);
        continue;
      }

      const resolved = await resolver.resolve({
        id: child.id,
        contentType: child.contentType,
        title: child.title,
      });
      rows.push({
        id: child.id,
        title: child.title,
        contentType: child.contentType,
        parentId: child.parentId ?? folderId,
        depth,
        tokens: resolved.estimatedTokens,
        empty: resolved.empty,
        truncated: resolved.truncated,
        warning: resolved.warning,
        hasContext: child.agenticMetadata !== null,
        genLocked: false,
      });
    }
    frontier = nextFrontier;
  }

  // Stamp GEN locks in one batch query (see gen-lock.ts).
  const leafIds = rows
    .filter((r) => r.contentType !== "folder")
    .map((r) => r.id);
  return { rows, scanCapped, leafIds };
}

// ── Default selection (BFS budget fill) ───────────────────────────────────

export function computeDefaultSelection(
  rows: SourceRow[],
  tokenBudget: number
): { includedNodeIds: string[]; estimatedTokens: number; capApplied: boolean } {
  const leaves = rows
    .filter((row) => row.contentType !== "folder" && !row.empty && !row.genLocked)
    // Breadth-first: shallow levels first, stable within a level.
    .sort((a, b) => a.depth - b.depth);

  const included: string[] = [];
  let total = 0;
  let capApplied = false;
  for (const leaf of leaves) {
    if (total + leaf.tokens > tokenBudget) {
      capApplied = true;
      continue; // keep trying smaller leaves at this/deeper levels
    }
    included.push(leaf.id);
    total += leaf.tokens;
  }
  return { includedNodeIds: included, estimatedTokens: total, capApplied };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getSelectionState(
  userId: string,
  folderId: string
): Promise<SelectionState | null> {
  const folder = await loadOwnedFolder(userId, folderId);
  if (!folder) return null;

  const [{ rows, scanCapped, leafIds }, stored] = await Promise.all([
    collectRows(folderId),
    prisma.studioSourceSelection.findUnique({
      where: { ownerId_folderId: { ownerId: userId, folderId } },
    }),
  ]);

  // GEN lock (Phase 5): unedited studio outputs can't feed back into sources.
  const locked = await getGenLockedNodeIds(userId, leafIds);
  for (const row of rows) {
    if (locked.has(row.id)) row.genLocked = true;
  }

  const tokenBudget = stored?.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  if (!stored) {
    const def = computeDefaultSelection(rows, tokenBudget);
    return {
      folderId,
      rows,
      includedNodeIds: def.includedNodeIds,
      tokenBudget,
      estimatedTokens: def.estimatedTokens,
      capApplied: def.capApplied,
      isDefault: true,
      scanCapped,
    };
  }

  // Stored ids may reference since-deleted/moved nodes — intersect with the
  // live rows so the picker never shows phantom selections. GEN-locked ids
  // drop out even if stored (the lock outranks an old explicit selection).
  const live = new Set(
    rows.filter((r) => r.contentType !== "folder" && !r.genLocked).map((r) => r.id)
  );
  const includedNodeIds = (stored.includedNodeIds as string[]).filter((id) =>
    live.has(id)
  );
  const tokensById = new Map(rows.map((r) => [r.id, r.tokens]));
  const estimatedTokens = includedNodeIds.reduce(
    (sum, id) => sum + (tokensById.get(id) ?? 0),
    0
  );

  return {
    folderId,
    rows,
    includedNodeIds,
    tokenBudget,
    estimatedTokens,
    capApplied: false,
    isDefault: false,
    scanCapped,
  };
}

export async function saveSelection(
  userId: string,
  folderId: string,
  includedNodeIds: string[],
  tokenBudget?: number
): Promise<SelectionState | null> {
  const folder = await loadOwnedFolder(userId, folderId);
  if (!folder) return null;

  const included = includedNodeIds as unknown as Prisma.InputJsonValue;
  await prisma.studioSourceSelection.upsert({
    where: { ownerId_folderId: { ownerId: userId, folderId } },
    create: {
      ownerId: userId,
      folderId,
      includedNodeIds: included,
      tokenBudget: tokenBudget ?? DEFAULT_TOKEN_BUDGET,
    },
    update: {
      includedNodeIds: included,
      ...(tokenBudget !== undefined && { tokenBudget }),
    },
  });
  return getSelectionState(userId, folderId);
}

// ── Chat grounding assembly ───────────────────────────────────────────────

/**
 * Assemble the system-prompt grounding block for a folder conversation.
 * Returns null fast when `contentId` isn't one of the user's folders, so the
 * chat route can call this unconditionally.
 *
 * Per selected source: the generated Context doc's derivedText is preferred
 * (dense, already distilled); full resolved text is the fallback. The
 * folder's own Context doc leads the block when present.
 */
export async function assembleFolderChatContext(
  userId: string,
  contentId: string
): Promise<string | null> {
  const folder = await loadOwnedFolder(userId, contentId);
  if (!folder) return null;

  const state = await getSelectionState(userId, contentId);
  if (!state || state.includedNodeIds.length === 0) return null;

  const included = new Set(state.includedNodeIds);
  const includedRows = state.rows.filter((r) => included.has(r.id));

  const [folderMeta, childMetas] = await Promise.all([
    prisma.agenticMetadata.findUnique({
      where: { nodeId: contentId },
      select: { derivedText: true },
    }),
    prisma.agenticMetadata.findMany({
      where: { nodeId: { in: state.includedNodeIds } },
      select: { nodeId: true, derivedText: true },
    }),
  ]);
  const metaById = new Map(childMetas.map((m) => [m.nodeId, m.derivedText]));

  const resolver = createSourceContentResolver();
  const sections: string[] = [];
  let usedTokens = 0;

  for (const row of includedRows) {
    const context = metaById.get(row.id)?.trim();
    let text = context ?? "";
    if (!text) {
      const resolved = await resolver.resolve({
        id: row.id,
        contentType: row.contentType,
        title: row.title,
      });
      text = resolved.text;
    }
    if (!text.trim()) continue;
    const section = `### ${row.title} (${row.contentType})\n${text.trim()}`;
    const sectionTokens = estimateTokens(section);
    if (usedTokens + sectionTokens > state.tokenBudget) break;
    sections.push(section);
    usedTokens += sectionTokens;
  }

  if (sections.length === 0) return null;

  const header = [
    `The user is chatting with the folder "${folder.title}". Ground your answers in the selected sources below; cite sources by their titles when you draw on them.`,
    folderMeta?.derivedText?.trim()
      ? `Folder context:\n${folderMeta.derivedText.trim()}`
      : "",
  ].filter(Boolean);

  // Prompt-size sanity logging (plan → Phase 3 gate): budget enforcement is
  // only trustworthy if we can see what actually shipped.
  logger.info({
    layer: "ai",
    event: "studio:chat:grounded",
    summary: `folder chat grounded with ${sections.length} sources`,
    attrs: {
      folderId: contentId,
      sources: sections.length,
      estimatedTokens: usedTokens,
      tokenBudget: state.tokenBudget,
    },
  });

  return `${header.join("\n\n")}\n\n<folder-sources>\n${sections.join("\n\n")}\n</folder-sources>`;
}
