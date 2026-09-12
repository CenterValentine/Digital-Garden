/**
 * Clipboard Extension
 *
 * Two jobs, both about what leaves the editor on copy:
 *
 * 1. Plain-text flavor — overrides TipTap's default clipboard text serializer
 *    so copied text matches what the user sees in the editor, no more, no
 *    less. Every block-level node appends \n; an empty paragraph is still a
 *    block and still appends \n, so explicit blank lines survive. List items
 *    delegate \n to the paragraph they contain (no double-spacing). Images
 *    become markdown image syntax so chat inputs and markdown editors keep
 *    them.
 *
 * 2. Transferable image URLs — `transformCopied` rewrites every image node in
 *    the copied slice so its `src` works outside the app: uploaded files get
 *    their public capability link (`https://<origin>/f/<token>`), relative
 *    URLs become absolute. This runs before BOTH serializers (HTML and text),
 *    so Notion, Slack, Obsidian, an AI chat given the markdown — anything
 *    that renders image URLs — can fetch the picture. The document itself is
 *    never touched; only the outgoing slice is.
 *
 *    Links are served from a client cache primed as image nodes appear in
 *    the document (see ../share-links.ts), because the copy event itself is
 *    synchronous.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/core";
import { primeShareLinks, shareableImageSrc } from "../share-links";

const IMAGE_NODE = "image";
/** How long after the last document change we re-scan for new image nodes. */
const PRIME_SCAN_DELAY_MS = 300;

function extractPlaintext(node: JSONContent): string {
  if (!node) return "";

  // Leaf: raw text
  if (node.type === "text") return node.text ?? "";

  // Hard break → inline newline
  if (node.type === "hardBreak") return "\n";

  const children: JSONContent[] = Array.isArray(node.content) ? node.content : [];
  const childText = children.map(extractPlaintext).join("");

  switch (node.type) {
    // Block nodes that own their own line — trailing \n so blank paragraphs produce blank lines
    case "paragraph":
    case "heading":
    case "codeBlock":
    case "blockquote":
    case "callout":
    case "sectionHeader":
    case "cardPanel":
    case "accordion":
    case "dailySummary":
    case "weeklySummary":
    case "excalidrawBlock":
    case "mermaidBlock":
      return childText + "\n";

    // Image → markdown image syntax. `src` has already been rewritten to a
    // transferable URL by transformCopied, which runs before this serializer.
    case IMAGE_NODE: {
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      return src ? `![${alt}](${src})\n` : "";
    }

    // Horizontal rule — blank line
    case "horizontalRule":
      return "\n";

    // List item: the paragraph inside already adds \n; don't double it
    case "listItem":
      return childText;

    // Lists: join items (each item's paragraph brings its own \n)
    case "bulletList":
    case "orderedList":
      return childText;

    // Table: cells tab-separated, rows newline-terminated
    case "tableHeader":
    case "tableCell":
      return childText + "\t";
    case "tableRow":
      return childText.trimEnd() + "\n";
    case "table":
      return childText;

    // Doc and unknown containers: just concatenate children
    default:
      return childText;
  }
}

/**
 * Return a fragment in which every image node's `src` is transferable.
 * Structure-sharing: untouched subtrees are returned by identity so a slice
 * with no images costs one walk and zero allocations.
 */
function rewriteImageSources(fragment: Fragment): Fragment {
  let changed = false;
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    let next = node;
    if (node.type.name === IMAGE_NODE) {
      const src = shareableImageSrc({
        src: node.attrs.src as string | null | undefined,
        contentId: node.attrs.contentId as string | null | undefined,
      });
      if (src !== node.attrs.src) {
        next = node.type.create({ ...node.attrs, src }, null, node.marks);
      }
    } else if (node.content.size > 0) {
      const content = rewriteImageSources(node.content);
      if (content !== node.content) next = node.copy(content);
    }
    if (next !== node) changed = true;
    nodes.push(next);
  });
  return changed ? Fragment.fromArray(nodes) : fragment;
}

/** Collect the contentIds of every uploaded image so their links can be fetched ahead of a copy. */
function collectImageContentIds(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === IMAGE_NODE) {
      const contentId = node.attrs.contentId;
      if (typeof contentId === "string" && contentId && !node.attrs.uploading) ids.push(contentId);
      return false;
    }
    return true;
  });
  return ids;
}

export const Clipboard = Extension.create({
  name: "clipboard",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("clipboardPlugin"),

        // Keep the share-link cache warm for whatever images the document
        // currently holds, so the synchronous copy below can resolve them.
        view(editorView) {
          let timer: ReturnType<typeof setTimeout> | null = null;
          const scan = () => {
            timer = null;
            primeShareLinks(collectImageContentIds(editorView.state.doc));
          };
          scan();
          return {
            update(view, prevState) {
              if (view.state.doc === prevState.doc || timer) return;
              timer = setTimeout(scan, PRIME_SCAN_DELAY_MS);
            },
            destroy() {
              if (timer) clearTimeout(timer);
            },
          };
        },

        props: {
          transformCopied: (slice) => {
            const content = rewriteImageSources(slice.content);
            return content === slice.content
              ? slice
              : new Slice(content, slice.openStart, slice.openEnd);
          },

          clipboardTextSerializer: (slice) => {
            const content: JSONContent[] = [];
            slice.content.forEach((node) => {
              content.push(node.toJSON());
            });

            const json: JSONContent = { type: "doc", content };
            // Trim only trailing whitespace so leading content is preserved
            return extractPlaintext(json).trimEnd();
          },
        },
      }),
    ];
  },
});
