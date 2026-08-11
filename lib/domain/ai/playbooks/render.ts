/**
 * Playbook section renderer (AI v3.2 T3 → v3.6 lossless upgrade)
 *
 * TipTap JSON → markdown for MODEL CONTEXT (the text a playbook's phases/standing
 * rules become inside the chat system prompt). Two renderers with different jobs:
 *
 *   renderPlaybookSection(nodes, extensions)  — the LOSSLESS path (v3.6). Runs the
 *     section through the T2 self-verifying serializer (markdown-serialize.ts), so
 *     tables, callouts (`> [!note]`), links, and nested marks reach the model
 *     intact instead of being flattened or dropped. `[[wiki-links]]` are preserved
 *     verbatim via a sentinel pre-pass (they'd otherwise serialize as raw <span>
 *     HTML, which the model can't trace). Requires injected `extensions` — the
 *     module stays free of `extensions-server` so it's tsx-safe, exactly like the
 *     serializer it wraps.
 *
 *   renderPlaybookSectionPlain(nodes)  — the dependency-free path. A hand-rolled
 *     plain-text walk that preserves `[[wiki-links]]` and basic block structure.
 *     Used where rich fidelity is irrelevant and injecting extensions is undesirable
 *     (output-directive SCANNING, which only regexes for "output under chat" prose;
 *     and as the safety-net fallback if the rich serializer throws).
 *
 * Why v3.6 replaced the old sole plain renderer: it silently GARBLED tables into a
 * flat cell-dump, DROPPED link URLs, and DROPPED callout framing — real fidelity
 * loss the model paid for. See docs/notes-feature/work-tracking/AI-ROADMAP.md 3.6.
 */

import type { JSONContent, Extensions } from "@tiptap/core";
import {
  tiptapToMarkdownRich,
  type HtmlBridge,
} from "@/lib/domain/content/markdown-serialize";

// ── Wiki-link preservation ───────────────────────────────────────────────────
// ServerWikiLink renders as `<span data-type="wiki-link" data-target-title=…>`,
// which turndown degrades to a raw HTML span (lossless but un-traceable) in the
// rich path. To keep the model-facing `[[Target]]` syntax, we flatten wikiLink
// nodes to a sentinel-wrapped text run BEFORE serializing, then restore `[[ ]]`
// after. The sentinels (mathematical white square brackets, U+27E6/U+27E7) are
// not markdown metacharacters, so turndown passes them through un-escaped and
// they round-trip as plain text — verified against the real serializer.
const WL_OPEN = "⟦⟦";
const WL_CLOSE = "⟧⟧";

function wikiLinkSyntax(node: JSONContent): string {
  const targetTitle =
    typeof node.attrs?.targetTitle === "string" ? node.attrs.targetTitle : "";
  const displayText =
    typeof node.attrs?.displayText === "string" && node.attrs.displayText
      ? node.attrs.displayText
      : undefined;
  return displayText ? `${targetTitle}|${displayText}` : targetTitle;
}

/** Replace wikiLink inline nodes with sentinel-wrapped text so they survive serialization. */
function flattenWikiLinks(node: JSONContent): JSONContent {
  if (node.type === "wikiLink") {
    return { type: "text", text: `${WL_OPEN}${wikiLinkSyntax(node)}${WL_CLOSE}` };
  }
  if (Array.isArray(node.content)) {
    return { ...node, content: node.content.map(flattenWikiLinks) };
  }
  return node;
}

function restoreWikiLinks(markdown: string): string {
  return markdown.split(WL_OPEN).join("[[").split(WL_CLOSE).join("]]");
}

/**
 * Render a playbook section's top-level nodes to LOSSLESS model-context markdown.
 *
 * @param extensions injected editor extensions (runtime: `getServerExtensions()`).
 * @param bridge optional HTML (de)serialization bridge — runtime omits it (the
 *   serializer's env-split default is correct in the Next server); tsx callers
 *   inject a `@tiptap/html/server` bridge.
 */
export function renderPlaybookSection(
  nodes: JSONContent[],
  extensions: Extensions,
  bridge?: HtmlBridge,
): string {
  if (!nodes.length) return "";
  try {
    const doc: JSONContent = { type: "doc", content: nodes.map(flattenWikiLinks) };
    return restoreWikiLinks(tiptapToMarkdownRich(doc, extensions, bridge)).trim();
  } catch {
    // Never let a serializer edge case blank out a phase — degrade to plain text.
    return renderPlaybookSectionPlain(nodes);
  }
}

// ── Plain-text path (dependency-free) ────────────────────────────────────────

function renderInline(node: JSONContent): string {
  if (node.type === "wikiLink") {
    return `[[${wikiLinkSyntax(node)}]]`;
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

/**
 * Render a section's top-level nodes to readable PLAIN TEXT, preserving
 * `[[wiki-links]]`. No editor extensions required — safe under tsx and cheap for
 * directive scanning. Lossy for tables/callouts/links (use `renderPlaybookSection`
 * when the model needs those).
 */
export function renderPlaybookSectionPlain(nodes: JSONContent[]): string {
  return nodes
    .map((n) => renderBlock(n))
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
}
