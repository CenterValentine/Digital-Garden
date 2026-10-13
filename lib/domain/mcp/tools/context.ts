import "server-only";

/**
 * AI context over MCP (MCP-DATABASE-REACH-PLAN §2.8).
 *
 * Reads report the stored context and whether it is stale; they NEVER
 * trigger a refresh (D4: a refresh spends the owner's model keys). The
 * write tool lets the agent that noticed staleness fix it with its own
 * model, through the same writer the in-app engine uses.
 */

import { prisma } from "@/lib/database/client";
import {
  applyGeneratedSections,
  computeSourceHash,
  getMetadataForNode,
  type MetadataView,
} from "@/lib/domain/ai-context/metadata";

export interface AiContextView {
  exists: boolean;
  stale: boolean;
  optedOut: boolean;
  generatedAt: string | null;
  model: string | null;
  sections: Record<string, string>;
}

export async function readAiContext(userId: string, nodeId: string): Promise<AiContextView | null> {
  const view: MetadataView | null = await getMetadataForNode(userId, nodeId);
  if (!view) return null;
  const sections: Record<string, string> = {};
  for (const [k, v] of Object.entries(view.sections)) if (v && v.trim()) sections[k] = v;
  return {
    exists: view.exists,
    stale: view.stale,
    optedOut: view.optedOut,
    generatedAt: view.generatedAt,
    model: view.model,
    sections,
  };
}

export function renderAiContext(ctx: AiContextView | null): string {
  if (!ctx || !ctx.exists) return "AI context: none yet.";
  if (ctx.optedOut) return "AI context: this node is opted out of AI context.";
  const lines = [`AI context${ctx.stale ? " (STALE — the content changed since it was written; consider garden_update_ai_context)" : ""}:`];
  for (const [k, v] of Object.entries(ctx.sections)) lines.push(`- ${k}: ${v}`);
  return lines.join("\n");
}

export interface UpdateAiContextInput {
  userId: string;
  nodeId: string;
  writerLabel: string;
  oneLiner?: string;
  sections?: Record<string, string>;
  mode: "merge" | "replace";
}

/** Flat shape: this tsconfig does not narrow unions on `ok`. */
export interface UpdateAiContextResult {
  ok: boolean;
  changed: boolean;
  reason?: string;
}

export async function updateAiContext(input: UpdateAiContextInput): Promise<UpdateAiContextResult> {
  const node = await prisma.contentNode.findFirst({
    where: { id: input.nodeId, ownerId: input.userId, deletedAt: null },
    select: { id: true, contentType: true, bodyHash: true, updatedAt: true, title: true },
  });
  if (!node) return { ok: false, changed: false, reason: "Node not found." };
  const current = await getMetadataForNode(input.userId, input.nodeId);
  if (current?.optedOut) {
    return { ok: false, changed: false, reason: "This node is opted out of AI context; nothing may be written." };
  }
  const base: Record<string, string> = input.mode === "replace" || !current ? {} : { ...current.sections };
  const given: Record<string, string> = input.sections ?? {};
  const summary = (given.summary ?? base.summary ?? "").trim();
  const structure = (given.structure ?? base.structure ?? "").trim();
  const signals = (given.signals ?? base.signals ?? "").trim();
  if (!summary) return { ok: false, changed: false, reason: "A summary is required (sections.summary)." };
  const sourceHashAtRead = await computeSourceHash(node);
  const result = await applyGeneratedSections(
    node,
    {
      summary,
      structure,
      ...(input.oneLiner ? { oneLiner: input.oneLiner.trim() } : {}),
      ...(signals ? { signals } : {}),
    },
    input.writerLabel,
    sourceHashAtRead
  );
  return { ok: true, changed: result.changed };
}
