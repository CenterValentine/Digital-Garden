import "server-only";

/**
 * AI context over MCP (MCP-DATABASE-REACH-PLAN §2.8).
 *
 * Reads report the stored context and whether it is stale; they NEVER
 * trigger a refresh (D4: a refresh spends the owner's model keys). The
 * write tool lets the agent that noticed staleness fix it with its own
 * model, through the same writer the in-app engine uses.
 *
 * The writer takes three sections and a one-liner; everything else an
 * agent sends is reported back as dropped, with the reason, so "changed"
 * never reads as "everything landed" (tools report real outcomes).
 */

import { ContextMode } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import {
  applyGeneratedSections,
  computeSourceHash,
  getMetadataForNode,
  type MetadataView,
} from "@/lib/domain/ai-context/metadata";

/** What garden_update_ai_context can write. */
export const WRITABLE_CONTEXT_SECTIONS = ["summary", "structure", "signals"] as const;
/** Sections the user owns in the app; an agent never overwrites them. */
const USER_OWNED_SECTIONS = ["role-strategy", "directives"] as const;

export interface AiContextView {
  exists: boolean;
  stale: boolean;
  optedOut: boolean;
  generatedAt: string | null;
  model: string | null;
  /** The effective context mode: signals persist only in "ENHANCED". */
  mode: string;
  oneLiner: string | null;
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
    mode: view.resolvedMode,
    oneLiner: view.oneLiner,
    sections,
  };
}

export function renderAiContext(ctx: AiContextView | null): string {
  if (!ctx || !ctx.exists) return `AI context: none yet (mode ${ctx?.mode ?? "?"}).`;
  if (ctx.optedOut) return "AI context: this node is opted out of AI context.";
  const lines = [`AI context (mode ${ctx.mode}${ctx.stale ? "; STALE — the content changed since it was written; consider garden_update_ai_context" : ""}):`];
  if (ctx.oneLiner) lines.push(`- one-liner: ${ctx.oneLiner}`);
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

export interface DroppedSection {
  section: string;
  reason: string;
}

/** Flat shape: this tsconfig does not narrow unions on `ok`. */
export interface UpdateAiContextResult {
  ok: boolean;
  changed: boolean;
  /** Sections the agent sent that were NOT stored, each with its reason. */
  dropped: DroppedSection[];
  reason?: string;
}

export async function updateAiContext(input: UpdateAiContextInput): Promise<UpdateAiContextResult> {
  const node = await prisma.contentNode.findFirst({
    where: { id: input.nodeId, ownerId: input.userId, deletedAt: null },
    select: { id: true, contentType: true, bodyHash: true, updatedAt: true, title: true },
  });
  if (!node) return { ok: false, changed: false, dropped: [], reason: "Node not found." };
  const current = await getMetadataForNode(input.userId, input.nodeId);
  if (!current) return { ok: false, changed: false, dropped: [], reason: "Node not found." };
  if (current.optedOut) {
    return { ok: false, changed: false, dropped: [], reason: "This node is opted out of AI context; nothing may be written." };
  }
  const given: Record<string, string> = input.sections ?? {};
  const dropped: DroppedSection[] = [];
  for (const key of Object.keys(given)) {
    if ((WRITABLE_CONTEXT_SECTIONS as readonly string[]).includes(key)) continue;
    dropped.push({
      section: key,
      reason: (USER_OWNED_SECTIONS as readonly string[]).includes(key)
        ? "user-owned section; the user edits it in the app's Context tab"
        : `not a context section; writable sections are ${WRITABLE_CONTEXT_SECTIONS.join(", ")} (plus oneLiner)`,
    });
  }
  const base: Record<string, string> = input.mode === "replace" ? {} : { ...current.sections };
  const summary = (given.summary ?? base.summary ?? "").trim();
  const structure = (given.structure ?? base.structure ?? "").trim();
  let signals = (given.signals ?? base.signals ?? "").trim();
  if (!summary) return { ok: false, changed: false, dropped, reason: "A summary is required (sections.summary)." };
  // The engine keeps signals only while the node resolves to Enhanced mode
  // (write-time re-check in applyGeneratedSections). Say so instead of
  // letting the section vanish.
  if (given.signals !== undefined && current.resolvedMode !== ContextMode.ENHANCED) {
    dropped.push({
      section: "signals",
      reason: `signals persist only in Enhanced context mode; this node resolves to ${current.resolvedMode}. The user can switch the mode in the app's Context tab.`,
    });
    signals = "";
  }
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
  return { ok: true, changed: result.changed, dropped };
}
