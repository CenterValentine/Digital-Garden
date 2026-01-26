/**
 * Simple Wiki-Link Extension for TipTap
 *
 * Converts [[Note Title]] into clickable links (Obsidian-style)
 * Supports alias syntax: [[Note Title|Display Name]]
 * Works with backlinks API
 *
 * Phase 1: Manual typing (type [[title]] and it becomes a link)
 * Phase 2: Add autocomplete later
 *
 * M6: Search & Knowledge Features - Wiki Links
 */

import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, any>;
  onClickLink?: (targetTitle: string) => void;
}

export const WikiLinkMark = Mark.create<WikiLinkOptions>({
  name: "wikiLink",

  addOptions() {
    return {
      HTMLAttributes: {},
      onClickLink: undefined,
    };
  },

  addAttributes() {
    return {
      targetTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-title"),
        renderHTML: (attributes) => {
          if (!attributes.targetTitle) {
            return {};
          }
          return {
            "data-target-title": attributes.targetTitle,
          };
        },
      },
      displayText: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-display-text"),
        renderHTML: (attributes) => {
          if (!attributes.displayText) {
            return {};
          }
          return {
            "data-display-text": attributes.displayText,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="wiki-link"]',
      },
    ];
  },

  renderHTML({ mark, HTMLAttributes }) {
    // Display alias text if present, otherwise show target title (Obsidian-style)
    const displayText = mark.attrs.displayText || mark.attrs.targetTitle || "Unknown";

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "wiki-link",
        class: "wiki-link cursor-pointer text-primary hover:underline",
      }),
      displayText,
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      // Auto-convert [[text]] pattern to wiki link
      new Plugin({
        key: new PluginKey("wikiLinkAutoConvert"),

        appendTransaction: (transactions, oldState, newState) => {
          const tr = newState.tr;
          let modified = false;

          transactions.forEach((transaction) => {
            if (!transaction.docChanged) return;

            newState.doc.descendants((node, pos) => {
              if (node.type.name !== "paragraph" && node.type.name !== "heading") {
                return;
              }

              const text = node.textContent;
              // Regex supports both [[Note Title]] and [[Note Title|Display Name]]
              const regex = /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]/g;
              let match;

              while ((match = regex.exec(text)) !== null) {
                const targetTitle = match[1].trim(); // The actual note title
                const displayText = match[2]?.trim() || null; // Optional display override
                const start = pos + match.index + 1; // +1 for node opening
                const end = start + match[0].length;

                // Check if this text already has the wiki link mark
                const marks = newState.doc.resolve(start).marks();
                const hasWikiLink = marks.some((m) => m.type.name === "wikiLink");

                if (!hasWikiLink) {
                  // Replace the [[text]] with just the display text
                  const replacementText = displayText || targetTitle;

                  // Delete the old text (including brackets)
                  tr.delete(start, end);

                  // Insert new text with wiki link mark
                  tr.insertText(replacementText, start);
                  tr.addMark(
                    start,
                    start + replacementText.length,
                    newState.schema.marks.wikiLink.create({
                      targetTitle,
                      displayText,
                    })
                  );

                  modified = true;
                }
              }
            });
          });

          return modified ? tr : null;
        },
      }),

      // Handle clicks on wiki links
      new Plugin({
        key: new PluginKey("wikiLinkClick"),

        props: {
          handleClick(view, pos, event) {
            const { schema, doc } = view.state;
            const clickPos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });

            if (!clickPos) return false;

            const $pos = doc.resolve(clickPos.pos);
            const marks = $pos.marks();

            const wikiLinkMark = marks.find((m) => m.type.name === "wikiLink");

            if (wikiLinkMark && options.onClickLink) {
              event.preventDefault();
              options.onClickLink(wikiLinkMark.attrs.targetTitle);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
