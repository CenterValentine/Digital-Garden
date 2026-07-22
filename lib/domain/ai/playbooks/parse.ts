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
  const walk = (node: JSONContent) => {
    if (node.type === "wikiLink") {
      const targetTitle =
        typeof node.attrs?.targetTitle === "string" ? node.attrs.targetTitle.trim() : "";
      if (targetTitle) {
        const displayText =
          typeof node.attrs?.displayText === "string" && node.attrs.displayText.trim()
            ? node.attrs.displayText.trim()
            : undefined;
        const key = `${targetTitle}|${displayText ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push(displayText ? { targetTitle, displayText } : { targetTitle });
        }
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return refs;
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
