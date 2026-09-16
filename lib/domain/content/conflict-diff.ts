/**
 * Version comparison for the save-conflict resolver.
 *
 * Pure and framework-free so it can be tested directly: the resolver UI is
 * only reachable mid-conflict, which makes its logic exactly the kind that
 * rots unobserved.
 *
 * ── Why lines, and why our own extraction ────────────────────────────────────
 * The comparison the user is making is "what did I write that they didn't, and
 * vice versa" — a prose question, not a JSON-shape question. Diffing raw TipTap
 * JSON would surface attribute churn nobody can read.
 *
 * `tiptapToMarkdownRich` would give prose, but it is not in the client bundle
 * and pulls `marked` + `turndown` + `turndown-plugin-gfm` (~150 KB) to solve a
 * harder problem than this one: lossless round-tripping. A diff needs only a
 * stable, readable projection, so block extraction lives here — small, and
 * scoped to the question. The DIFF ALGORITHM itself is `diff` (jsdiff), because
 * hand-rolling Myers is precisely the reinvention the repo guidance warns off.
 */

import { diffLines, diffWords, type Change } from "diff";
import type { JSONContent } from "@tiptap/core";

/** Heading prefixes by level, so a diff line reads the way the doc looks. */
const HEADING_PREFIX = ["", "# ", "## ", "### ", "#### ", "##### ", "###### "];

function inlineText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map(inlineText).join("");
}

/**
 * One line per block, prefixed so structure survives into the diff. Blocks that
 * carry no text (an image, a divider, an embedded diagram) still emit a line —
 * a removed diagram is a real difference, and a silent gap would hide it.
 */
function blockLines(node: JSONContent, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  switch (node.type) {
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      return [`${HEADING_PREFIX[level] ?? "# "}${inlineText(node)}`];
    }
    case "paragraph": {
      const text = inlineText(node).trim();
      return text ? [indent + text] : [];
    }
    case "bulletList":
    case "orderedList":
      return (node.content ?? []).flatMap((item, i) => {
        const marker = node.type === "orderedList" ? `${i + 1}. ` : "- ";
        const inner = (item.content ?? []).flatMap((c) => blockLines(c, depth + 1));
        return inner.length === 0
          ? []
          : [indent + marker + inner[0].trimStart(), ...inner.slice(1)];
      });
    case "blockquote":
      return (node.content ?? []).flatMap((c) =>
        blockLines(c, depth).map((l) => `${indent}> ${l.trimStart()}`),
      );
    case "codeBlock":
      return [`${indent}\`\`\``, ...inlineText(node).split("\n").map((l) => indent + l), `${indent}\`\`\``];
    case "horizontalRule":
      return [`${indent}---`];
    case "table":
      return [`${indent}[table: ${(node.content ?? []).length} rows]`];
    default: {
      const nested = (node.content ?? []).flatMap((c) => blockLines(c, depth));
      if (nested.length > 0) return nested;
      // A leaf with no text still counts as content — name it rather than drop it.
      return node.type ? [`${indent}[${node.type}]`] : [];
    }
  }
}

/** Readable projection of a document, one entry per line. */
export function toComparableLines(doc: JSONContent | null | undefined): string[] {
  if (!doc) return [];
  return (doc.content ?? []).flatMap((n) => blockLines(n));
}

export interface DiffRow {
  kind: "same" | "added" | "removed";
  text: string;
  /** Word-level spans, present only on a changed line paired with its twin. */
  words?: Array<{ text: string; changed: boolean }>;
}

export interface VersionStats {
  words: number;
  lines: number;
}

export interface ConflictComparison {
  rows: DiffRow[];
  added: number;
  removed: number;
  mine: VersionStats;
  theirs: VersionStats;
  /**
   * Headings whose section contains at least one changed line. The single most
   * orienting fact in a long document: "they touched Screening criteria" beats
   * any word count.
   */
  changedSections: string[];
  identical: boolean;
}

function countWords(lines: string[]): number {
  return lines.join(" ").split(/\s+/).filter(Boolean).length;
}

function isHeading(line: string): boolean {
  return /^#{1,6} /.test(line);
}

/**
 * Compare two documents. `theirs` is the base (what the server holds) and
 * `mine` is the change, so an "added" row is something the local edit
 * introduced — matching the buttons: keeping mine keeps the additions.
 */
export function compareVersions(
  mine: JSONContent | null | undefined,
  theirs: JSONContent | null | undefined,
): ConflictComparison {
  const mineLines = toComparableLines(mine);
  const theirLines = toComparableLines(theirs);

  const changes: Change[] = diffLines(
    theirLines.join("\n") + "\n",
    mineLines.join("\n") + "\n",
  );

  const rows: DiffRow[] = [];
  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i];
    const lines = change.value.replace(/\n$/, "").split("\n");

    // A removal immediately followed by an addition is a REWRITE. Pairing them
    // and diffing words turns "whole paragraph deleted, whole paragraph added"
    // into the handful of words that actually changed — the difference between
    // a diff you can read and one you have to re-read.
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      const nextLines = next.value.replace(/\n$/, "").split("\n");
      const pairs = Math.max(lines.length, nextLines.length);
      for (let p = 0; p < pairs; p += 1) {
        const before = lines[p];
        const after = nextLines[p];
        if (before !== undefined && after !== undefined) {
          rows.push({
            kind: "removed",
            text: before,
            words: diffWords(before, after)
              .filter((w) => !w.added)
              .map((w) => ({ text: w.value, changed: Boolean(w.removed) })),
          });
          rows.push({
            kind: "added",
            text: after,
            words: diffWords(before, after)
              .filter((w) => !w.removed)
              .map((w) => ({ text: w.value, changed: Boolean(w.added) })),
          });
        } else if (before !== undefined) {
          rows.push({ kind: "removed", text: before });
        } else if (after !== undefined) {
          rows.push({ kind: "added", text: after });
        }
      }
      i += 1; // the addition was consumed as the pair
      continue;
    }

    for (const text of lines) {
      rows.push({
        kind: change.added ? "added" : change.removed ? "removed" : "same",
        text,
      });
    }
  }

  // Attribute each change to the heading above it.
  const changedSections: string[] = [];
  let section = "";
  for (const row of rows) {
    if (row.kind !== "added" && isHeading(row.text)) {
      section = row.text.replace(/^#{1,6} /, "");
    }
    if (row.kind === "same") continue;
    if (isHeading(row.text)) {
      const name = row.text.replace(/^#{1,6} /, "");
      if (name && !changedSections.includes(name)) changedSections.push(name);
      continue;
    }
    const label = section || "(before the first heading)";
    if (!changedSections.includes(label)) changedSections.push(label);
  }

  const added = rows.filter((r) => r.kind === "added").length;
  const removed = rows.filter((r) => r.kind === "removed").length;

  return {
    rows,
    added,
    removed,
    mine: { words: countWords(mineLines), lines: mineLines.length },
    theirs: { words: countWords(theirLines), lines: theirLines.length },
    changedSections,
    identical: added === 0 && removed === 0,
  };
}
