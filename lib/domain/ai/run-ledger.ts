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

const LEDGER_TITLE = "Run Ledger";

export interface CheckpointEntry {
  phase: string;
  summary: string;
  artifacts?: string[];
  openQuestions?: string[];
  next?: string;
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
  return lines.join("\n");
}

export async function upsertRunLedger(
  userId: string,
  targetFolderId: string,
  entry: CheckpointEntry,
): Promise<{ contentNodeId: string }> {
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      parentId: targetFolderId,
      contentType: "note",
      deletedAt: null,
      title: LEDGER_TITLE,
    },
    select: {
      id: true,
      notePayload: { select: { metadata: true } },
    },
  });

  const prior =
    existing?.notePayload?.metadata &&
    typeof existing.notePayload.metadata === "object"
      ? ((existing.notePayload.metadata as Record<string, unknown>)
          .ledgerMarkdown as string | undefined)
      : undefined;

  const markdown = prior
    ? `${prior}\n\n${renderEntry(entry)}`
    : `# Run Ledger\n\n${renderEntry(entry)}`;

  const tiptapJson = markdownToTiptap(markdown);
  const searchText = extractSearchTextFromTipTap(tiptapJson);
  const payloadData = {
    tiptapJson: tiptapJson as unknown as Prisma.InputJsonValue,
    searchText,
    metadata: {
      ledgerMarkdown: markdown,
      wordCount: searchText.split(/\s+/).length,
    } as unknown as Prisma.InputJsonValue,
  };

  if (existing) {
    await prisma.notePayload.upsert({
      where: { contentId: existing.id },
      update: payloadData,
      create: { contentId: existing.id, ...payloadData },
    });
    return { contentNodeId: existing.id };
  }

  const slug = await generateUniqueSlug(LEDGER_TITLE, userId);
  const node = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: LEDGER_TITLE,
      slug,
      contentType: "note",
      parentId: targetFolderId,
      displayOrder: 0,
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
  return { contentNodeId: node.id };
}
