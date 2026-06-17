/**
 * Clipboard Extension
 *
 * Overrides TipTap's default clipboard text serializer so copied text
 * matches what the user sees in the editor — no more, no less.
 *
 * Algorithm: every block-level node appends \n to its output.
 * An empty paragraph is still a block and still appends \n, so explicit
 * blank lines in the editor produce blank lines in the copied text.
 * List items delegate \n to the paragraph they contain (no double-spacing).
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { JSONContent } from "@tiptap/core";

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

export const Clipboard = Extension.create({
  name: "clipboard",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("clipboardPlugin"),
        props: {
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
