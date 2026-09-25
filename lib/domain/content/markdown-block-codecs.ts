/**
 * Per-block markdown codecs (v3.2 T2 — the "north star")
 *
 * A registry that lets a CUSTOM block declare a human-readable markdown syntax
 * (both halves — serialize + parse-side reconstruction) so it renders as real
 * markdown in the source view instead of an opaque base64 dg-block fence.
 *
 * A codec is USED only if its output round-trips deep-equal (the serializer's
 * self-verify decides), so this is always safe: a block with a codec that
 * doesn't round-trip — or no codec at all — falls back to the lossless fence.
 * Adding pretty syntax for a new block = add a codec here; the gate proves it.
 *
 * Pure (no TipTap-extension imports) so the serializer + gate use it under tsx.
 */

import type { JSONContent } from "@tiptap/core";

export interface BlockMarkdownCodec {
  /** Node type this codec handles (e.g. "callout"). */
  type: string;
  /**
   * Serialize the node to markdown. `serializeInner` renders child block content
   * (recursively, through the full serializer). Return null to decline → fence.
   */
  toMarkdown(
    node: JSONContent,
    serializeInner: (nodes: JSONContent[]) => string,
  ): string | null;
  /**
   * Parse-side reconstruction: rewrite marked's HTML so generateJSON rebuilds
   * this node (marked doesn't know "> [!note]" is a callout, just as it didn't
   * know "- [ ]" was a task item).
   */
  reTag(html: string): string;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Callout ⇄ Obsidian syntax: `> [!type] Title` + `> ` body.
 * Relies on the callout extension's `contentElement` fix so its HTML round-trips.
 */
const calloutCodec: BlockMarkdownCodec = {
  type: "callout",
  toMarkdown(node, serializeInner) {
    const type = typeof node.attrs?.type === "string" ? node.attrs.type : "note";
    const title =
      typeof node.attrs?.title === "string" && node.attrs.title.trim()
        ? node.attrs.title.trim()
        : null;
    const header = title ? `> [!${type}] ${title}` : `> [!${type}]`;
    const inner = serializeInner(node.content ?? []).trim();
    // Blank quoted line between header and body so marked keeps them as separate
    // paragraphs (otherwise "[!type] Title" and the body fuse into one <p>).
    const body = inner
      ? "\n>\n" + inner.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n")
      : "";
    return header + body;
  },
  reTag(html) {
    return html.replace(
      /<blockquote>\s*<p>\[!([a-zA-Z]+)\]([^<]*)<\/p>([\s\S]*?)<\/blockquote>/g,
      (_m, type: string, titleRaw: string, bodyHtml: string) => {
        const title = titleRaw.trim();
        const titleAttr = title ? ` data-callout-title="${escapeAttr(title)}"` : "";
        return `<div data-callout-type="${type.toLowerCase()}"${titleAttr}><div class="callout-content">${bodyHtml}</div></div>`;
      },
    );
  },
};

/**
 * Heading ⇄ fold-state marker: `## Title {.collapsed}` (pandoc-style attr).
 *
 * Serialize side lives in the turndown service (dgCollapsedHeading rule in
 * markdown-serialize.ts) because non-collapsed headings must keep the default
 * atx path — so this codec's toMarkdown declines and only the parse-side
 * reconstruction is real: marked renders `<h2>Title {.collapsed}</h2>`, and
 * reTag moves the trailing marker into data-collapsed for generateJSON.
 * A heading whose literal text ends in "{.collapsed}" fails self-verify (its
 * serialized form re-parses as a collapsed heading) and falls to the fence —
 * lossless, just opaque, for that one pathological input.
 */
const headingCodec: BlockMarkdownCodec = {
  type: "heading",
  toMarkdown() {
    return null; // turndown tier handles both shapes
  },
  reTag(html) {
    return html.replace(
      /<h([1-6])([^>]*)>([\s\S]*?)\s*\{\.collapsed\}\s*<\/h\1>/g,
      '<h$1$2 data-collapsed="true">$3</h$1>',
    );
  },
};

/**
 * Private block ⇄ Obsidian comment fence:
 *
 *   %%
 *
 *   body
 *
 *   %%
 *
 * Blank lines around the delimiters make marked emit them as their own
 * `<p>%%</p>` paragraphs, which reTag folds back into `div[data-private=block]`.
 * A private block nested inside another container (blockquote, list item) is
 * serialised by the `dgPrivateBlock` turndown rule to the same shape, and the
 * same reTag reconstructs it wherever it appears — the regex is unanchored.
 */
const privateBlockCodec: BlockMarkdownCodec = {
  type: "privateBlock",
  toMarkdown(node, serializeInner) {
    const inner = serializeInner(node.content ?? []).trim();
    return inner ? `%%\n\n${inner}\n\n%%` : null;
  },
  reTag(html) {
    return html.replace(
      /<p>%%<\/p>\s*([\s\S]*?)\s*<p>%%<\/p>/g,
      '<div data-private="block">$1</div>',
    );
  },
};

/**
 * Private text ⇄ `%%inline comment%%`.
 *
 * Serialize side is the `dgPrivateText` turndown rule (an inline mark has no
 * block-level codec slot); this entry exists for its parse-side half. marked
 * leaves `%%…%%` as literal text, so reTag wraps it in `span[data-private=text]`
 * — everywhere except inside code, where `%%` is content (Mermaid's `%%{init}%%`
 * lives in code blocks). Literal `%%x%%` in ordinary prose re-parses as private
 * text, fails self-verify, and fences: lossless, just opaque, for that input.
 */
const privateTextCodec: BlockMarkdownCodec = {
  type: "privateText",
  toMarkdown() {
    return null; // turndown tier handles the mark
  },
  reTag(html) {
    return outsideCode(html, (segment) =>
      segment.replace(
        /%%((?:(?!%%)[^\n])+?)%%/g,
        '<span data-private="text">$1</span>',
      ),
    );
  },
};

/** Apply `fn` to every part of `html` that is not inside <pre> or <code>. */
function outsideCode(html: string, fn: (segment: string) => string): string {
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/g)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

export const BLOCK_CODECS: BlockMarkdownCodec[] = [
  calloutCodec,
  headingCodec,
  privateBlockCodec,
  privateTextCodec,
];

const CODEC_BY_TYPE = new Map(BLOCK_CODECS.map((c) => [c.type, c]));

/** The codec for a node type, if one is registered. */
export function getBlockCodec(type: string | undefined): BlockMarkdownCodec | undefined {
  return type ? CODEC_BY_TYPE.get(type) : undefined;
}

/** Apply every codec's parse-side reconstruction to marked's HTML. */
export function applyBlockReTags(html: string): string {
  return BLOCK_CODECS.reduce((acc, codec) => codec.reTag(acc), html);
}
