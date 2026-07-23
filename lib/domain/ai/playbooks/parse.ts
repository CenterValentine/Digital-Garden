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

export interface PlaybookReference {
  /** The linked note's title (wikiLink `targetTitle`). */
  targetTitle: string;
  /** Optional display alias (`[[Title|Alias]]`). */
  displayText?: string;
}

export interface PlaybookSection {
  /** Heading text (phase title). Empty string for the standing-rules section. */
  title: string;
  /** Top-level TipTap nodes in this section (the phase heading is excluded). */
  content: JSONContent[];
  /** `[[wiki-link]]` references found anywhere in this section. */
  references: PlaybookReference[];
}

export interface ParsedPlaybook {
  /** Content before the first phase heading — always injected. */
  standingRules: PlaybookSection;
  /** One section per phase heading, in document order. */
  phases: PlaybookSection[];
  /** The heading level that delimits phases (shallowest top-level heading), or null. */
  phaseLevel: number | null;
}

function headingText(node: JSONContent): string {
  let text = "";
  const walk = (n: JSONContent) => {
    if (typeof n.text === "string") text += n.text;
    for (const child of n.content ?? []) walk(child);
  };
  walk(node);
  return text.trim();
}

/** Collect distinct `[[wiki-link]]` references anywhere within the given nodes. */
export function collectReferences(nodes: JSONContent[]): PlaybookReference[] {
  const refs: PlaybookReference[] = [];
  const seen = new Set<string>();
  const addReference = (target: string, display?: string) => {
    const targetTitle = target.trim();
    const displayText = display?.trim() || undefined;
    if (!targetTitle) return;
    const key = `${targetTitle}|${displayText ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(displayText ? { targetTitle, displayText } : { targetTitle });
  };
  const walk = (node: JSONContent) => {
    if (node.type === "wikiLink") {
      if (typeof node.attrs?.targetTitle === "string") {
        addReference(
          node.attrs.targetTitle,
          typeof node.attrs?.displayText === "string"
            ? node.attrs.displayText
            : undefined,
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

function nodeText(node: JSONContent): string {
  if (node.type === "wikiLink") {
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

function textSection(title: string, lines: string[]): PlaybookSection {
  const text = lines.join("\n").trim();
  const content: JSONContent[] = text
    ? [{ type: "paragraph", content: [{ type: "text", text }] }]
    : [];
  return {
    title,
    content,
    references: collectReferences(content),
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
function parseMarkdownLikePlaybook(nodes: JSONContent[]): ParsedPlaybook | null {
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

/** Split a playbook note's TipTap JSON into standing rules + phases. */
export function parsePlaybook(doc: JSONContent): ParsedPlaybook {
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
  const phases: PlaybookSection[] = [];
  let current: PlaybookSection | null = null;

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

  for (const phase of phases) phase.references = collectReferences(phase.content);

  if (phases.length === 0) {
    const markdownLike = parseMarkdownLikePlaybook(top);
    if (markdownLike) return markdownLike;
  }

  return {
    standingRules: {
      title: "",
      content: standing,
      references: collectReferences(standing),
    },
    phases,
    phaseLevel,
  };
}
