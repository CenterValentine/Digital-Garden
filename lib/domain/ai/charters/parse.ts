/**
 * Playbook parsing (AI v3.2 T3)
 *
 * A "playbook" is a note authored/imported in the Agent-Skill (SKILL.md) shape:
 * a title (the skill name) + a body where the shallowest headings delimit
 * PHASES, and everything before the first phase heading is STANDING RULES
 * (always in context). `[[wiki-links]]` in the body are REFERENCES to extension
 * notes (directives, guides) the model can trace on demand.
 *
 * This module is pure (operates on TipTap JSON) so it can run on the hot chat
 * path and be unit-tested. Progressive disclosure (T3's core) injects the
 * standing rules + ONE active phase — never the whole playbook — keeping the
 * model's context proportional to the phase, exactly like a Skill loads its
 * metadata first and body on demand.
 */

import type { JSONContent } from "@tiptap/core";
import { PRIVATE_TEXT_MARK } from "@/lib/domain/content/private-content";
import { columnLinkSyntax, parseColumnAnchor } from "@/lib/domain/data/column-anchor";

export interface CharterReference {
  /** The linked note's title (wikiLink `targetTitle`). */
  targetTitle: string;
  /** Optional display alias (`[[Title|Alias]]`). */
  displayText?: string;
  /**
   * The link's stable ContentNode id when the wikiLink node carries one
   * (`targetId`, healed on click / set by the picker). Hand-typed and
   * AI-written links have only the title. Kept so jurisdiction can resolve
   * a charter-named database id-first (ITERATION-RUN-HARNESS-FIXES P1).
   */
  targetId?: string;
  /**
   * The ONE column a `[[Database#Column]]` link points at
   * (lib/domain/data/column-anchor.ts). Picker-made links carry the column's
   * id; a hand-typed one only its name, resolved within the database. The
   * manifest gives the model the column's header and description.
   */
  column?: { id?: string; name: string };
}

export interface CharterSection {
  /** Heading text (phase title). Empty string for the standing-rules section. */
  title: string;
  /** Top-level TipTap nodes in this section (the phase heading is excluded). */
  content: JSONContent[];
  /** `[[wiki-link]]` references found anywhere in this section. */
  references: CharterReference[];
  /**
   * Raw value of a `model:` directive line in this section, if any (AI 3.4).
   * Kept verbatim here (e.g. "scout", "gpt-5 series", "anthropic/claude-opus-4");
   * `parseModelDirective` in `../model-directive` interprets it. The line is
   * left in `content` — it's author-visible and harmless to the model.
   */
  modelDirective?: string;
}

export interface ParsedCharter {
  /** Content before the first phase heading — always injected. */
  standingRules: CharterSection;
  /** One section per phase heading, in document order. */
  phases: CharterSection[];
  /** The heading level that delimits phases (shallowest top-level heading), or null. */
  phaseLevel: number | null;
  /**
   * Phases dropped because the note repeated its own content verbatim
   * (ITERATION-RUN-HARNESS-FIXES P12). Prod 2026-09-27: a charter note held
   * four identical copies of itself (a reconnect duplication), which this
   * parser read as a FOUR-phase charter — a checkpoint would have replayed
   * the whole workflow four times. The copies collapse to one and the count
   * rides here so the context can say so (silent correctness reads as a bug).
   */
  duplicatePhasesCollapsed?: number;
  /**
   * Databases the charter asks to be INGESTED IN FULL — every row, every
   * column, plus the tables they link to — from an `Ingest in full: [[…]]`
   * line anywhere in the charter (owner, 2026-09-30: "I'd prefer AI just
   * ingested the whole database"; a run that chose what to read missed the
   * strongest support metric in the profile). Absent when none.
   */
  ingest?: CharterReference[];
}

function headingText(node: JSONContent): string {
  let text = "";
  const walk = (n: JSONContent) => {
    // Phase titles land verbatim in the system prompt, so a private
    // (commented-out) run inside a heading must not become part of the title.
    if (n.marks?.some((m) => m.type === PRIVATE_TEXT_MARK)) return;
    if (typeof n.text === "string") text += n.text;
    for (const child of n.content ?? []) walk(child);
  };
  walk(node);
  return text.trim();
}

/** Collect distinct `[[wiki-link]]` references anywhere within the given nodes. */
export function collectReferences(nodes: JSONContent[]): CharterReference[] {
  const refs: CharterReference[] = [];
  const seen = new Set<string>();
  const addReference = (
    target: string,
    display?: string,
    id?: string,
    linkedColumn?: { id?: string; name: string },
  ) => {
    let targetTitle = target.trim();
    let column = linkedColumn;
    // Hand-typed `[[Jobs#Status]]` — the title ends at the `#`. (`#^` is the
    // serializer's raw-anchor form, never a column name.)
    const hashAt = targetTitle.indexOf("#");
    if (!column && hashAt > 0 && targetTitle[hashAt + 1] !== "^") {
      const name = targetTitle.slice(hashAt + 1).trim();
      targetTitle = targetTitle.slice(0, hashAt).trim();
      if (name) column = { name };
    }
    const displayText = display?.trim() || undefined;
    const targetId = id?.trim() || undefined;
    if (!targetTitle) return;
    const key = `${targetTitle}#${column?.id ?? column?.name ?? ""}|${displayText ?? ""}`;
    if (seen.has(key)) {
      // A later occurrence may carry the id the first one lacked (the
      // picker sets it; a hand-typed link does not) — keep the strongest.
      if (targetId) {
        const prior = refs.find(
          (r) =>
            r.targetTitle === targetTitle &&
            (r.displayText ?? "") === (displayText ?? "") &&
            (r.column?.id ?? r.column?.name ?? "") === (column?.id ?? column?.name ?? ""),
        );
        if (prior && !prior.targetId) prior.targetId = targetId;
      }
      return;
    }
    seen.add(key);
    refs.push({
      targetTitle,
      ...(displayText ? { displayText } : {}),
      ...(targetId ? { targetId } : {}),
      ...(column ? { column } : {}),
    });
  };
  const walk = (node: JSONContent) => {
    if (node.type === "wikiLink") {
      if (typeof node.attrs?.targetTitle === "string") {
        addReference(
          node.attrs.targetTitle,
          typeof node.attrs?.displayText === "string"
            ? node.attrs.displayText
            : undefined,
          typeof node.attrs?.targetId === "string" ? node.attrs.targetId : undefined,
          columnOfLink(node),
        );
      }
    }
    // A hand-authored playbook can contain literal markdown/wiki-link syntax
    // inside ordinary text nodes (for example, a pasted SKILL.md that was then
    // marked as a playbook). Preserve those references too; otherwise the
    // fallback parser below would load the phase but silently lose its JIT
    // extension manifest.
    if (typeof node.text === "string") {
      for (const match of node.text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
        addReference(match[1], match[2]);
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return refs;
}

/** The column a picker-made `[[Database#Column]]` link points at, if any. */
function columnOfLink(node: JSONContent): { id: string; name: string } | undefined {
  const id = parseColumnAnchor(node.attrs?.anchor as string | undefined);
  const name = typeof node.attrs?.anchorLabel === "string" ? node.attrs.anchorLabel : "";
  return id ? { id, name } : undefined;
}

function nodeText(node: JSONContent): string {
  if (node.type === "wikiLink") {
    const column = columnLinkSyntax(node.attrs ?? {});
    if (column) return `[[${column}]]`;
    const target =
      typeof node.attrs?.targetTitle === "string" ? node.attrs.targetTitle : "";
    const display =
      typeof node.attrs?.displayText === "string" && node.attrs.displayText
        ? node.attrs.displayText
        : undefined;
    return display ? `[[${target}|${display}]]` : `[[${target}]]`;
  }
  if (node.type === "hardBreak") return "\n";
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(nodeText).join("");
}

function markdownLikeText(nodes: JSONContent[]): string {
  return nodes
    .map(nodeText)
    .join("\n")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function stripYamlFrontmatter(text: string): string {
  const lines = text.split("\n");
  const firstContent = lines.findIndex((line) => line.trim().length > 0);
  if (firstContent === -1 || lines[firstContent].trim() !== "---") return text;
  const closingOffset = lines
    .slice(firstContent + 1)
    .findIndex((line) => line.trim() === "---");
  if (closingOffset === -1) return text;
  const closing = firstContent + closingOffset + 1;
  return [...lines.slice(0, firstContent), ...lines.slice(closing + 1)]
    .join("\n")
    .trim();
}

/**
 * Extract a `model:` directive from a section (AI 3.4) — FIRST-LINE contract.
 *
 * The directive must be the first non-empty line of the section's first
 * non-empty node, and that node must be plain (never a codeBlock/blockquote).
 * Deliberately strict: an earlier scan-everything version turned `model:`
 * lines inside example config blocks and mid-prose sentences into live
 * routing directives — a phase's INSTRUCTIONS could silently reroute the
 * phase. Works for both the TipTap path (directive is its own first
 * paragraph) and the markdown-like path (first line of the joined text).
 */
function extractModelDirective(content: JSONContent[]): string | undefined {
  const first = content.find((node) => nodeText(node).trim().length > 0);
  if (!first || first.type === "codeBlock" || first.type === "blockquote") {
    return undefined;
  }
  const firstLine = nodeText(first)
    .split("\n")
    .find((line) => line.trim().length > 0);
  const match = firstLine?.match(/^\s*model:\s*(.+?)\s*$/i);
  const value = match?.[1]?.trim();
  return value || undefined;
}

function textSection(title: string, lines: string[]): CharterSection {
  const text = lines.join("\n").trim();
  const content: JSONContent[] = text
    ? [{ type: "paragraph", content: [{ type: "text", text }] }]
    : [];
  const modelDirective = extractModelDirective(content);
  return {
    title,
    content,
    references: collectReferences(content),
    ...(modelDirective ? { modelDirective } : {}),
  };
}

/**
 * Parse markdown-like source that lives inside plain TipTap paragraphs.
 *
 * This is a compatibility path for the primary hand-authoring workflow:
 * users often paste a SKILL.md-shaped block into a note and mark it as a
 * playbook. The rich-text document can legitimately contain literal `##`
 * lines rather than TipTap heading nodes. Treating that marked note as
 * "0 phases" made an explicit attachment disappear from model context.
 */
function parseMarkdownLikePlaybook(nodes: JSONContent[]): ParsedCharter | null {
  const source = stripYamlFrontmatter(markdownLikeText(nodes));
  if (!source) return null;

  const lines = source.split("\n");
  const headings = lines.flatMap((line, index) => {
    const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    return match
      ? [{ index, level: match[1].length, title: match[2].trim() }]
      : [];
  });

  // A marked note with useful instructions but no headings is still a valid
  // playbook. It runs as one implicit phase instead of being silently dropped.
  if (headings.length === 0) {
    return {
      standingRules: textSection("", []),
      phases: [textSection("Instructions", lines)],
      phaseLevel: null,
    };
  }

  const phaseLevel = Math.min(...headings.map((heading) => heading.level));
  const phaseHeadings = headings.filter(
    (heading) => heading.level === phaseLevel,
  );
  const firstHeading = phaseHeadings[0];
  const standingRules = textSection("", lines.slice(0, firstHeading.index));
  const phases = phaseHeadings.map((heading, index) => {
    const next = phaseHeadings[index + 1];
    return textSection(
      heading.title || `Phase ${index + 1}`,
      lines.slice(heading.index + 1, next?.index ?? lines.length),
    );
  });

  return { standingRules, phases, phaseLevel };
}

/**
 * Pick the database ids a charter's `[[references]]` name (ITERATION-RUN-
 * HARNESS-FIXES P1). Pure over the reference list + the user's data nodes
 * so the gate can pin the order: an id the link carries wins; a bare title
 * resolves only when exactly ONE database has it (case-insensitive) — an
 * ambiguous title grants nothing rather than guessing. The Prisma half
 * (loading the charter and the candidate nodes) lives in
 * lib/domain/data/server/resolve.ts.
 */
export function resolveCharterReferencedTables(
  references: CharterReference[],
  dataNodes: Array<{ id: string; title: string }>,
): string[] {
  const byId = new Map(dataNodes.map((n) => [n.id, n]));
  const byTitle = new Map<string, Array<{ id: string; title: string }>>();
  for (const n of dataNodes) {
    const key = n.title.trim().toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), n]);
  }
  const out: string[] = [];
  const add = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };
  for (const ref of references) {
    if (ref.targetId && byId.has(ref.targetId)) {
      add(ref.targetId);
      continue;
    }
    const matches = byTitle.get(ref.targetTitle.trim().toLowerCase()) ?? [];
    if (matches.length === 1) add(matches[0].id);
  }
  return out;
}

/**
 * A phase's identity for duplicate detection: its title plus its content,
 * byte-for-byte. Two phases that merely SHARE a title are different phases
 * (a charter may legitimately have "Review" twice with different bodies).
 */
function phaseFingerprint(phase: CharterSection): string {
  return `${phase.title}\u0000${JSON.stringify(phase.content)}`;
}

/**
 * Collapse a note that repeats its own content verbatim (P12). Two shapes
 * are recognized: the whole phase list is one block repeated k times
 * (the document was pasted/duplicated under a top-level heading, so every
 * copy is a phase), and consecutive identical phases. Anything else — a
 * repeated title with a different body, a non-periodic repeat — is left
 * alone: the author may mean it.
 */
export function collapseRepeatedPhases(phases: CharterSection[]): {
  phases: CharterSection[];
  collapsed: number;
} {
  const n = phases.length;
  if (n < 2) return { phases, collapsed: 0 };
  const prints = phases.map(phaseFingerprint);
  // Periodic repeat: the smallest period whose blocks all match.
  for (let period = 1; period <= n / 2; period++) {
    if (n % period !== 0) continue;
    let periodic = true;
    for (let i = period; i < n && periodic; i++) {
      if (prints[i] !== prints[i - period]) periodic = false;
    }
    if (periodic) {
      return { phases: phases.slice(0, period), collapsed: n - period };
    }
  }
  // Consecutive identical phases (a partial paste).
  const kept: CharterSection[] = [];
  let collapsed = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0 && prints[i] === prints[i - 1]) {
      collapsed++;
      continue;
    }
    kept.push(phases[i]);
  }
  return { phases: kept, collapsed };
}

/** Split a playbook note's TipTap JSON into standing rules + phases. */
export function parseCharter(doc: JSONContent): ParsedCharter {
  const parsed = parseCharterSections(doc);
  const { phases, collapsed } = collapseRepeatedPhases(parsed.phases);
  const ingest = extractIngestReferences([
    ...parsed.standingRules.content,
    ...phases.flatMap((p) => p.content),
  ]);
  return {
    ...parsed,
    phases,
    ...(collapsed > 0 ? { duplicatePhasesCollapsed: collapsed } : {}),
    ...(ingest.length > 0 ? { ingest } : {}),
  };
}

const INGEST_LINE = /^\s*ingest in full\s*:/i;

/**
 * `Ingest in full: [[Table]], [[Other]]` lines, anywhere in the charter.
 * LINE-START contract, like the `model:` directive: only a line that begins
 * with the phrase counts, so prose that merely mentions ingesting cannot
 * load a database; code blocks and quotes never count. A one-line
 * paragraph keeps its links' ids (the TipTap path); a multi-line paragraph
 * (markdown-like source) is read line by line. Pure; exported for the gate.
 */
export function extractIngestReferences(nodes: JSONContent[]): CharterReference[] {
  const found: CharterReference[] = [];
  const seen = new Set<string>();
  const add = (refs: CharterReference[]) => {
    for (const r of refs) {
      const key = r.targetId ?? r.targetTitle.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(r);
    }
  };
  const visit = (node: JSONContent) => {
    if (node.type === "codeBlock" || node.type === "blockquote") return;
    if (node.type === "paragraph" || node.type === "heading") {
      const text = nodeText(node);
      const lines = text.split("\n");
      if (lines.length <= 1) {
        if (INGEST_LINE.test(text)) add(collectReferences([node]));
        return;
      }
      for (const line of lines) {
        if (!INGEST_LINE.test(line)) continue;
        add(
          collectReferences([{ type: "paragraph", content: [{ type: "text", text: line }] }]),
        );
      }
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
  return found;
}

function parseCharterSections(doc: JSONContent): ParsedCharter {
  const top = doc?.content ?? [];

  // Phases are delimited by the SHALLOWEST top-level heading level present, so
  // the convention works whether the author used `#` or `##` for sections.
  let phaseLevel: number | null = null;
  for (const node of top) {
    if (node.type === "heading" && typeof node.attrs?.level === "number") {
      phaseLevel = phaseLevel === null ? node.attrs.level : Math.min(phaseLevel, node.attrs.level);
    }
  }

  const standing: JSONContent[] = [];
  const phases: CharterSection[] = [];
  let current: CharterSection | null = null;

  for (const node of top) {
    const isPhaseHeading =
      phaseLevel !== null && node.type === "heading" && node.attrs?.level === phaseLevel;
    if (isPhaseHeading) {
      current = { title: headingText(node), content: [], references: [] };
      phases.push(current);
    } else if (current) {
      current.content.push(node);
    } else {
      standing.push(node);
    }
  }

  for (const phase of phases) {
    phase.references = collectReferences(phase.content);
    const directive = extractModelDirective(phase.content);
    if (directive) phase.modelDirective = directive;
  }

  if (phases.length === 0) {
    const markdownLike = parseMarkdownLikePlaybook(top);
    if (markdownLike) return markdownLike;
  }

  const standingDirective = extractModelDirective(standing);
  return {
    standingRules: {
      title: "",
      content: standing,
      references: collectReferences(standing),
      ...(standingDirective ? { modelDirective: standingDirective } : {}),
    },
    phases,
    phaseLevel,
  };
}
