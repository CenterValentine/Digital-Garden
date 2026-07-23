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

export const BLOCK_CODECS: BlockMarkdownCodec[] = [calloutCodec];

const CODEC_BY_TYPE = new Map(BLOCK_CODECS.map((c) => [c.type, c]));

/** The codec for a node type, if one is registered. */
export function getBlockCodec(type: string | undefined): BlockMarkdownCodec | undefined {
  return type ? CODEC_BY_TYPE.get(type) : undefined;
}

/** Apply every codec's parse-side reconstruction to marked's HTML. */
export function applyBlockReTags(html: string): string {
  return BLOCK_CODECS.reduce((acc, codec) => codec.reTag(acc), html);
}
