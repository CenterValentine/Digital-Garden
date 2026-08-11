/**
 * Run Ledger (AI v3 core S4d) — context-discipline commitment #1.
 *
 * A per-run state note in the conversation's target folder, updated at
 * every phase checkpoint: what phase completed, the decisions/summary,
 * artifacts so far, open questions, what's next. The folder IS the run
 * state (umbrella A8): a fresh conversation targeted at the same folder
 * can resume mid-procedure by reading this note — no run database.
 *
 * Source of truth is the markdown kept in NotePayload.metadata
 * (append-only per checkpoint); the TipTap JSON is regenerated from it on
 * every write so the rendered note always matches.
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import {
  generateUniqueSlug,
  markdownToTiptap,
  extractSearchTextFromTipTap,
} from "@/lib/domain/content";
import { buildRunLedgerTitle } from "@/lib/domain/ai/run-ledger-title";

const LEDGER_TITLE = "Run Ledger";
const LEDGER_RUN_KEY = "runLedgerKey";

export interface CheckpointEntry {
  phase: string;
  summary: string;
  artifacts?: string[];
  openQuestions?: string[];
  next?: string;
  /** Stable short title covering the whole run and its anticipated outputs. */
  runTitle?: string;
  /** Route-accumulated token usage through this checkpoint (v3.1 R5). */
  tokensSoFar?: number;
  /**
   * Estimated USD for the tokens above, priced against the executed model
   * (cost metering). Undefined when the model has no price entry — the
   * line then renders tokens only, never $0.
   */
  estimatedCostUsd?: number;
}

function renderEntry(entry: CheckpointEntry): string {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const lines = [`## ${entry.phase} — ${stamp}`, "", entry.summary.trim()];
  if (entry.artifacts?.length) {
    lines.push("", "**Artifacts:**");
    for (const a of entry.artifacts) lines.push(`- ${a}`);
  }
  if (entry.openQuestions?.length) {
    lines.push("", "**Open questions:**");
    for (const q of entry.openQuestions) lines.push(`- ${q}`);
  }
  if (entry.next) lines.push("", `**Next:** ${entry.next}`);
  if (typeof entry.tokensSoFar === "number" && entry.tokensSoFar > 0) {
    const cost =
      typeof entry.estimatedCostUsd === "number" && entry.estimatedCostUsd > 0
        ? ` (~$${entry.estimatedCostUsd >= 0.1 ? entry.estimatedCostUsd.toFixed(2) : entry.estimatedCostUsd.toFixed(3)} est.)`
        : "";
    lines.push(
      "",
      `**Tokens so far (this turn):** ~${entry.tokensSoFar.toLocaleString()}${cost}`,
    );
  }
  return lines.join("\n");
}

export async function upsertRunLedger(
  userId: string,
  targetFolderId: string | null,
  entry: CheckpointEntry,
  options: {
    /**
     * Output owner (Chat Outputs & References plan, WS7): when the chat's
     * output target nests under a chat/content, the ledger is this run's state
     * and belongs there too — created `role:"referenced"` + `ownedByNoteId =
     * owner` (storage parentId still the target folder).
     */
    ownerContentId?: string;
    /** Stable conversation/run identity used to find later phase writes. */
    runKey?: string;
  } = {},
): Promise<{ contentNodeId: string; created: boolean }> {
  const { ownerContentId } = options;
  const runKey =
    options.runKey ?? ownerContentId ?? targetFolderId ?? "garden-root";
  const scope = ownerContentId
    ? { ownedByNoteId: ownerContentId }
    : { parentId: targetFolderId };

  // New ledgers are keyed in metadata because their visible titles are now
  // descriptive. Fall back once to the legacy exact title so an existing
  // "Run Ledger" is adopted and renamed at its next checkpoint.
  const keyedLedger = await prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      ...scope,
      contentType: "note",
      deletedAt: null,
      notePayload: {
        metadata: { path: [LEDGER_RUN_KEY], equals: runKey },
      },
    },
    select: {
      id: true,
      title: true,
      notePayload: { select: { metadata: true } },
    },
  });
  const existing =
    keyedLedger ??
    (await prisma.contentNode.findFirst({
      where: {
        ownerId: userId,
        ...scope,
        contentType: "note",
        deletedAt: null,
        title: LEDGER_TITLE,
      },
      select: {
        id: true,
        title: true,
        notePayload: { select: { metadata: true } },
      },
    }));
  const ledgerTitle = existing?.title.startsWith(`${LEDGER_TITLE} —`)
    ? existing.title
    : buildRunLedgerTitle(entry, runKey);

  const prior =
    existing?.notePayload?.metadata &&
    typeof existing.notePayload.metadata === "object"
      ? ((existing.notePayload.metadata as Record<string, unknown>)
          .ledgerMarkdown as string | undefined)
      : undefined;

  const markdown = prior
    ? `${prior}\n\n${renderEntry(entry)}`
    : `# ${ledgerTitle}\n\n${renderEntry(entry)}`;

  const tiptapJson = markdownToTiptap(markdown);
  const searchText = extractSearchTextFromTipTap(tiptapJson);
  const payloadData = {
    tiptapJson: tiptapJson as unknown as Prisma.InputJsonValue,
    searchText,
    metadata: {
      ledgerMarkdown: markdown,
      [LEDGER_RUN_KEY]: runKey,
      ledgerTitle,
      wordCount: searchText.split(/\s+/).length,
    } as unknown as Prisma.InputJsonValue,
  };

  if (existing) {
    if (existing.title !== ledgerTitle) {
      await prisma.contentNode.update({
        where: { id: existing.id },
        data: { title: ledgerTitle },
      });
    }
    await prisma.notePayload.upsert({
      where: { contentId: existing.id },
      update: payloadData,
      create: { contentId: existing.id, ...payloadData },
    });
    return { contentNodeId: existing.id, created: false };
  }

  const slug = await generateUniqueSlug(ledgerTitle, userId);
  const node = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: ledgerTitle,
      slug,
      contentType: "note",
      parentId: targetFolderId,
      displayOrder: 0,
      // Nest under the chat when the output target says so (WS7).
      ...(ownerContentId
        ? { role: "referenced" as const, ownedByNoteId: ownerContentId }
        : {}),
      notePayload: { create: payloadData },
    },
    select: { id: true },
  });
  logger.info({
    layer: "ai",
    event: "run_ledger:created",
    summary: `run ledger created in folder ${targetFolderId}`,
    attrs: { contentNodeId: node.id, targetFolderId },
  });
  return { contentNodeId: node.id, created: true };
}
