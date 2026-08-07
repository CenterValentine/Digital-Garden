/**
 * Folder context capsule — what a folder mention injects and what the
 * `read_folder_context` tool returns (FOLDER-CONTEXT-CAPSULE-PLAN → D3).
 *
 * Hybrid assembly, by volatility class:
 *  - STRUCTURE (ids, titles, types, existence) is queried LIVE from
 *    ContentNode — never cached, so renames/moves/deletes are always right.
 *  - SEMANTICS (one-liners, summaries, signals) come from the cached
 *    AgenticMetadata rows the self-healing engine maintains.
 * Never cache what's free to compute; never compute what's expensive to
 * cache. A stored child index would go stale exactly where damping works as
 * designed (meaning-neutral renames never cascade).
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import { ContextMode } from "@/lib/database/generated/prisma";
import { estimateTokens } from "./tokens";
import { getGuidanceText, getStoredAiSections, readOneLiner } from "./metadata";
import { explicitMode, resolveChildMode, resolveContextMode } from "./mode-resolve";

export type ChildCoverage = "fresh" | "stale" | "none";

export interface CapsuleChildRow {
  id: string;
  title: string;
  contentType: string;
  /** One-sentence description from the child's Context doc (null = uncovered). */
  oneLiner: string | null;
  /** Rough cost of reading this child's full text (null = unknown/uncovered). */
  estTokens: number | null;
  coverage: ChildCoverage;
  mode: ContextMode;
}

export interface FolderCapsule {
  folderId: string;
  title: string;
  resolvedMode: ContextMode;
  generatedAt: string | null;
  model: string | null;
  staleChildren: number;
  uncoveredChildren: number;
  purpose: { directives: string; roleStrategy: string };
  summary: string;
  structure: string;
  signals: string;
  children: CapsuleChildRow[];
  /** Prompt-ready rendering of everything above (includes the D17 nudge). */
  text: string;
}

/** Mode-specific read policy the AI sees at the top of every capsule. */
const READ_POLICY: Record<ContextMode, string> = {
  OPT_OUT: "",
  REFERENCE:
    "Read policy: REFERENCE material — draw from it freely (pick-lists, exemplars); do not audit it or cite its items as evidence.",
  STANDARD:
    "Read policy: working content — understand it as a system with a purpose.",
  ENHANCED:
    "Read policy: audit-grade content — the Signals section lists known gaps, ambiguities, and directive misalignments; weigh them in your answer.",
};

function firstSentence(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : trimmed).trim().slice(0, 160);
}

/**
 * Assemble the capsule for one folder. Returns null when the node is
 * missing, not the caller's, not a folder, or resolves to OPT_OUT — callers
 * degrade the mention to name-only in that last case.
 *
 * Freshness is the GATE's job (gate.ts) — assembly reads whatever is stored
 * and reports per-child coverage honestly.
 */
export async function assembleFolderCapsule(
  userId: string,
  folderId: string
): Promise<FolderCapsule | null> {
  const folder = await prisma.contentNode.findFirst({
    where: {
      id: folderId,
      ownerId: userId,
      deletedAt: null,
      contentType: "folder",
    },
    select: {
      id: true,
      title: true,
      agenticMetadata: {
        select: { generatedAt: true, model: true, contextDirty: true },
      },
    },
  });
  if (!folder) return null;

  const resolvedMode = await resolveContextMode(folderId);
  if (resolvedMode === ContextMode.OPT_OUT) return null;

  // STRUCTURE — live from ContentNode (plan D3).
  const children = await prisma.contentNode.findMany({
    where: { parentId: folderId, deletedAt: null },
    select: {
      id: true,
      title: true,
      contentType: true,
      agenticMetadata: {
        select: {
          tiptapJson: true,
          derivedText: true,
          contextDirty: true,
          generatedAt: true,
          contextMode: true,
          contextOptOut: true,
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const visible = children.filter(
    (c) => explicitMode(c.agenticMetadata) !== ContextMode.OPT_OUT
  );

  // SEMANTICS — cached rows the engine heals. Bulk-read for summary fallback.
  const stored = await getStoredAiSections(visible.map((c) => c.id));

  const rows: CapsuleChildRow[] = visible.map((child) => {
    const am = child.agenticMetadata;
    const covered = !!am?.generatedAt;
    const sections = stored.get(child.id);
    const oneLiner = am
      ? (readOneLiner(am.tiptapJson) ??
        (sections?.summary ? firstSentence(sections.summary) : null))
      : null;
    return {
      id: child.id,
      title: child.title,
      contentType: child.contentType,
      oneLiner: covered ? oneLiner : null,
      estTokens:
        covered && am?.derivedText ? estimateTokens(am.derivedText) : null,
      coverage: !covered ? "none" : am?.contextDirty ? "stale" : "fresh",
      mode: resolveChildMode(am, resolvedMode),
    };
  });

  const folderSections = (await getStoredAiSections([folderId])).get(folderId);
  const guidance = await getGuidanceText(folderId);

  const staleChildren = rows.filter((r) => r.coverage === "stale").length;
  const uncoveredChildren = rows.filter((r) => r.coverage === "none").length;

  const capsule: FolderCapsule = {
    folderId,
    title: folder.title,
    resolvedMode,
    generatedAt: folder.agenticMetadata?.generatedAt?.toISOString() ?? null,
    model: folder.agenticMetadata?.model ?? null,
    staleChildren,
    uncoveredChildren,
    purpose: guidance,
    summary: folderSections?.summary ?? "",
    structure: folderSections?.structure ?? "",
    signals: folderSections?.signals ?? "",
    children: rows,
    text: "",
  };
  capsule.text = renderCapsuleText(capsule);
  return capsule;
}

function renderCapsuleText(c: FolderCapsule): string {
  const tokenLabel = (n: number | null) =>
    n === null ? "?" : n >= 1000 ? `~${(n / 1000).toFixed(1)}k tok` : `~${n} tok`;

  const childLines = c.children.map((r) => {
    const bits = [
      `- [${r.contentType}] "${r.title}"`,
      r.oneLiner ? `— ${r.oneLiner}` : "— (no context yet)",
      `(${tokenLabel(r.estTokens)}, ${r.coverage}${
        r.mode === ContextMode.REFERENCE ? ", reference" : ""
      }, id: ${r.id})`,
    ];
    return bits.join(" ");
  });

  const freshness = [
    c.generatedAt
      ? `Folder context generated ${c.generatedAt}${c.model ? ` by ${c.model}` : ""}.`
      : "Folder context not yet generated.",
    c.staleChildren > 0 ? `${c.staleChildren} children stale.` : "",
    c.uncoveredChildren > 0 ? `${c.uncoveredChildren} children uncovered.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    `FOLDER CONTEXT — "${c.title}" (mode: ${c.resolvedMode.toLowerCase()}, folderId: ${c.folderId})`,
    freshness,
    READ_POLICY[c.resolvedMode],
    // D17 — one sentence, deliberately not a protocol.
    "Be frugal: read only what this request needs, using the token estimates in the index to budget.",
    c.purpose.directives.trim()
      ? `\n## Directives (user-authored — follow them)\n${c.purpose.directives.trim()}`
      : "",
    c.purpose.roleStrategy.trim()
      ? `\n## Role & Strategy\n${c.purpose.roleStrategy.trim()}`
      : "",
    c.summary.trim() ? `\n## Summary\n${c.summary.trim()}` : "",
    c.structure.trim() ? `\n## Structure\n${c.structure.trim()}` : "",
    c.signals.trim() ? `\n## Signals\n${c.signals.trim()}` : "",
    `\n## Children (index)`,
    childLines.length > 0 ? childLines.join("\n") : "(empty folder)",
    `\nDrill down with read_folder_context(folderId) for subfolders; read a file with its id.`,
  ]
    .filter(Boolean)
    .join("\n");
}
