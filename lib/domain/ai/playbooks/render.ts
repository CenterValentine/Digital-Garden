/**
 * Playbook section renderer (AI v3.2 T3)
 *
 * One-way TipTap JSON → plain text for MODEL CONTEXT ONLY — not user-facing
 * markdown, not round-trip safe, nothing writes this back into a document.
 * Preserves `[[Target]]` / `[[Target|Display]]` wiki-link syntax verbatim so
 * the model can trace references via `read_note`, plus enough block
 * structure (headings, lists, code, quotes) to stay readable.
 *
 * Deliberately does NOT depend on the richer lossless markdown serializer
 * (lib/domain/content/markdown-serialize.ts, AI v3.2 T2) — that module lives
 * on an unmerged branch (PR #125) as of this writing, and wikiLink nodes
 * have no `.text`, so the existing search-text extractor silently drops
 * them. Once T2 lands, phase rendering could upgrade to
 * `tiptapToMarkdownRich` for full formatting fidelity; plain text with
 * preserved wiki-links is sufficient for traceable model context today.
 */

import type { JSONContent } from "@tiptap/core";

function renderInline(node: JSONContent): string {
  if (node.type === "wikiLink") {
    const targetTitle =
      typeof node.attrs?.targetTitle === "string" ? node.attrs.targetTitle : "";
    const displayText =
      typeof node.attrs?.displayText === "string" && node.attrs.displayText
        ? node.attrs.displayText
        : undefined;
    return displayText ? `[[${targetTitle}|${displayText}]]` : `[[${targetTitle}]]`;
  }
  if (typeof node.text === "string") {
    let text = node.text;
    const marks = new Set((node.marks ?? []).map((m) => m.type));
    if (marks.has("code")) return `\`${text}\``;
    if (marks.has("bold")) text = `**${text}**`;
    if (marks.has("italic")) text = `*${text}*`;
    return text;
  }
  return (node.content ?? []).map(renderInline).join("");
}

function renderBlock(node: JSONContent, listDepth = 0): string {
  switch (node.type) {
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      return `${"#".repeat(level)} ${(node.content ?? []).map(renderInline).join("")}`;
    }
    case "paragraph":
      return (node.content ?? []).map(renderInline).join("");
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case "blockquote":
      return (node.content ?? [])
        .map((c) => renderBlock(c, listDepth))
        .join("\n")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "bulletList":
    case "orderedList":
      return (node.content ?? [])
        .map((item, i) => {
          const prefix = node.type === "orderedList" ? `${i + 1}. ` : "- ";
          const body = (item.content ?? [])
            .map((c) => renderBlock(c, listDepth + 1))
            .join("\n");
          return `${"  ".repeat(listDepth)}${prefix}${body}`;
        })
        .join("\n");
    case "taskList":
      return (node.content ?? [])
        .map((item) => {
          const checked = item.attrs?.checked ? "x" : " ";
          const body = (item.content ?? [])
            .map((c) => renderBlock(c, listDepth + 1))
            .join("\n");
          return `${"  ".repeat(listDepth)}- [${checked}] ${body}`;
        })
        .join("\n");
    default:
      // Unknown block type: recurse so nested text/wikiLinks are never lost,
      // even at the cost of losing this node's own formatting/framing.
      return (node.content ?? []).map((c) => renderBlock(c, listDepth)).join("\n");
  }
}

/** Render a playbook section's top-level nodes to model-readable text, preserving `[[wiki-links]]`. */
export function renderPlaybookSection(nodes: JSONContent[]): string {
  return nodes
    .map((n) => renderBlock(n))
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
}
