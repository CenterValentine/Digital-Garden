/**
 * Markdown decompressor (v3.2 T2 — opt-in "magic" recovery)
 *
 * Best-effort recovery of COMPRESSED markdown — markdown whose structural line
 * breaks were collapsed onto single lines (a common failure mode of AI-generated
 * or copy-pasted notes, e.g. "### Heading: 1. **a** 2. **b**"). Applies ONLY
 * high-confidence, unambiguous transforms and leaves everything else untouched:
 *
 *   1. Fused headings — a line that BEGINS as a heading and contains a further
 *      mid-line `#..` marker: "# A ## B" → "# A" / "## B".
 *   2. Compressed ordered lists — a run of SEQUENTIAL numbers ("1. … 2. … 3. …")
 *      on one line: the lone "1." is ambiguous, but a "1." followed by "2." is
 *      the giveaway → split the prefix off and put each item on its own line.
 *
 * It CANNOT recover a heading fused with its body with no marker
 * ("## Heading Body text with no break") — that information is genuinely lost.
 * Deliberately heuristic → opt-in only, never the default parse.
 *
 * Fenced code and GFM table rows are exempt from every transform here: their
 * lines are literal / grid-structural, so a "repair" can only damage them.
 */

import { tableLineFlags } from "./markdown-tables";

export function decompressMarkdown(text: string): string {
  if (!text) return text;

  const prepared = emphasizeLeadingLabels(normalizePasteFrontmatter(text));
  const lines = prepared.split("\n");
  // Both passes below rewrite a line in isolation, which is wrong inside a
  // fence (code is literal) and destructive inside a table (splitting a row on
  // its "1. … 2. …" run breaks the grid — the pasted table came back as a
  // half-row plus a stray ordered list). Neither construct can be judged
  // line-by-line, so decide membership up front and skip those lines.
  const inFence = fenceFlags(lines);
  const inTable = tableLineFlags(lines);

  return lines
    .flatMap((line, index) =>
      inFence[index] || inTable[index] ? [line] : decompressLine(line),
    )
    .join("\n");
}

/**
 * Per-line "inside a fenced code block" flags, fence markers included. Matches
 * the opening marker's character so a ``` inside a ~~~ block doesn't close it.
 */
function fenceFlags(lines: string[]): boolean[] {
  const flags: boolean[] = new Array(lines.length).fill(false);
  let fence: "`" | "~" | null = null;

  lines.forEach((line, index) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1]?.[0] as "`" | "~" | undefined;
    if (marker && (fence === null || fence === marker)) {
      flags[index] = true;
      fence = fence === marker ? null : marker;
      return;
    }
    flags[index] = fence !== null;
  });

  return flags;
}

/**
 * Give label-style lines visual hierarchy without promoting them to headings.
 *
 * Examples: `name: …`, `description: …`, and `Phase A: …`. Fenced code is
 * deliberately left byte-for-byte alone, and labels already carrying Markdown
 * formatting do not match the beginning-of-line rule.
 */
export function emphasizeLeadingLabels(text: string): string {
  const lines = text.split("\n");
  // A table cell that happens to read like a label ("Claim: | Evidence |") is
  // cell text, not a label line — bolding it rewrites the pasted content.
  const inTable = tableLineFlags(lines);
  let fence: "`" | "~" | null = null;

  return lines
    .map((line, index) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0] as "`" | "~";
        fence = fence === marker ? null : fence ?? marker;
        return line;
      }
      if (fence || inTable[index]) return line;

      return line.replace(
        /^([A-Za-z][A-Za-z0-9 _/-]{0,60}:)(?=\s|$)/,
        "**$1**",
      );
    })
    .join("\n");
}

/**
 * Preserve a leading YAML-shaped frontmatter block as visible rich text.
 *
 * In ordinary CommonMark, the closing `---` directly under `description: …`
 * is a Setext H2 underline. That consumes the second divider and turns every
 * preceding key/value line into one heading. Paste conversion intentionally
 * displays frontmatter rather than interpreting metadata, so add the blank
 * boundaries Markdown needs for two horizontal rules and hard line breaks
 * between consecutive key/value rows.
 */
export function normalizePasteFrontmatter(text: string): string {
  const lines = text.split("\n");
  const opening = lines.findIndex((line) => line.trim().length > 0);
  if (opening === -1 || lines[opening].trim() !== "---") return text;

  const closing = lines.findIndex(
    (line, index) => index > opening && line.trim() === "---",
  );
  if (closing <= opening + 1) return text;

  const body = lines.slice(opening + 1, closing);
  const looksLikeFrontmatter = body.some((line) =>
    /^[A-Za-z_][A-Za-z0-9_-]*\s*:\s*\S/.test(line.trim()),
  );
  if (!looksLikeFrontmatter) return text;

  const visibleBody = body.map((line, index) => {
    const next = body[index + 1];
    if (line.trim() && next?.trim()) {
      return `${line.replace(/\s+$/, "")}  `;
    }
    return line;
  });

  return [
    ...lines.slice(0, opening),
    "---",
    "",
    ...visibleBody,
    "",
    "---",
    ...lines.slice(closing + 1),
  ].join("\n");
}

function decompressLine(line: string): string[] {
  // Pass 1: split fused headings — only on lines that BEGIN as a heading, so a
  // stray "#" in prose can't trigger it.
  const headingLines = /^#{1,6}\s/.test(line)
    ? line.replace(/(\S)\s+(#{1,6}\s)/g, "$1\n$2").split("\n")
    : [line];

  // Pass 2: extract a compressed ordered list from each resulting line.
  const out: string[] = [];
  for (const l of headingLines) {
    const ol = extractOrderedList(l);
    if (ol) out.push(...ol);
    else out.push(l);
  }
  return out;
}

/** If the line contains a sequential 1./2./3.… run, split it into prefix + items. */
function extractOrderedList(line: string): string[] | null {
  const markers = [...line.matchAll(/(^|\s)(\d{1,3})\.\s/g)];
  if (markers.length < 2) return null; // need at least "1." AND "2." — the giveaway

  const nums = markers.map((m) => parseInt(m[2], 10));
  if (nums[0] !== 1) return null; // must start at 1
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) return null; // must be strictly sequential
  }

  // The FIRST "1." must not be preceded by a word — a real list starts after a
  // colon, punctuation, or line-start ("Requirements: 1."), never after a word
  // ("Section 1." / "chapter 1." are labels, not a list). Subsequent markers ARE
  // preceded by the prior item's last word, so this check is first-marker only.
  const firstIdx = markers[0].index ?? 0;
  const charBeforeSpace = firstIdx > 0 ? line[firstIdx - 1] : "";
  if (/\w/.test(charBeforeSpace)) return null;

  const numberStart = (m: RegExpMatchArray) => (m.index ?? 0) + m[1].length;
  const prefix = line.slice(0, numberStart(markers[0])).trim();

  const items: string[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = numberStart(markers[i]);
    const end = i + 1 < markers.length ? markers[i + 1].index ?? line.length : line.length;
    items.push(line.slice(start, end).trim());
  }

  const out: string[] = [];
  if (prefix) out.push(prefix);
  out.push(...items);
  return out;
}
