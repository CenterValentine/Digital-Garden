/**
 * Wiki-Link Node Extension for TipTap
 *
 * Converts [[Note Title]] into clickable inline nodes (Obsidian-style)
 * Supports alias syntax: [[Note Title|Display Name]]
 * Works with backlinks API
 *
 * Uses a Node approach (not Mark) to properly replace the bracketed text
 *
 * M6: Search & Knowledge Features - Wiki Links
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { InputRule } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";

export interface WikiLinkSuggestionItem {
  id: string;
  title: string;
  slug: string;
}

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, any>;
  onClickLink?: (targetTitle: string) => void;
  suggestion?: Omit<any, "editor">;
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",

  group: "inline",

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onClickLink: undefined,
      suggestion: {
        char: "[[",
        allowSpaces: true,
        items: async () => [],
        render: () => ({}),
        command: () => {},
      },
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

  renderHTML({ node, HTMLAttributes }) {
    // Display alias text if present, otherwise show target title (Obsidian-style)
    const displayText = node.attrs.displayText || node.attrs.targetTitle || "Unknown";

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "wiki-link",
        class: "wiki-link cursor-pointer text-primary hover:underline",
      }),
      displayText,
    ];
  },

  renderText({ node }) {
    // For markdown export, show the full wiki-link syntax
    const { targetTitle, displayText } = node.attrs;
    if (displayText) {
      return `[[${targetTitle}|${displayText}]]`;
    }
    return `[[${targetTitle}]]`;
  },

  addInputRules() {
    return [
      // Input rule for [[Note Title]] syntax
      // Triggers when user types the closing ]]
      new InputRule({
        find: /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]$/,
        handler: ({ state, range, match }: any) => {
          const targetTitle = match[1]?.trim();
          const displayText = match[2]?.trim() || null;

          if (!targetTitle) return null;

          const { tr } = state;
          const start = range.from;
          const end = range.to;

          // Replace the entire [[...]] text with a wiki-link node
          tr.replaceWith(
            start,
            end,
            this.type.create({
              targetTitle,
              displayText,
            })
          );

          return tr;
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const nodeType = this.type;

    return [
      // Autocomplete suggestion when typing [[
      Suggestion({
        editor: this.editor,
        ...options.suggestion,
      }),

      // Convert [[text]] to wiki-link when Space or Enter is pressed
      new Plugin({
        key: new PluginKey("wikiLinkConvert"),

        props: {
          handleKeyDown(view, event) {
            // Only trigger on Space or Enter
            if (event.key !== " " && event.key !== "Enter") {
              return false;
            }

            const { state } = view;
            const { selection, doc } = state;
            const { $from } = selection;

            // Get the current paragraph or heading
            const parent = $from.parent;
            if (parent.type.name !== "paragraph" && parent.type.name !== "heading") {
              return false;
            }

            // Get text before cursor
            const textBefore = parent.textContent.slice(0, $from.parentOffset);

            // Check if text ends with ]]
            const match = textBefore.match(/\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]$/);
            if (!match) {
              return false;
            }

            const targetTitle = match[1]?.trim();
            const displayText = match[2]?.trim() || null;

            if (!targetTitle) {
              return false;
            }

            // Calculate positions
            const matchStart = $from.start() + ($from.parentOffset - match[0].length);
            const matchEnd = $from.start() + $from.parentOffset;

            // Replace with wiki-link node
            const tr = state.tr.replaceWith(
              matchStart,
              matchEnd,
              nodeType.create({
                targetTitle,
                displayText,
              })
            );

            // Insert the space/enter that triggered this
            if (event.key === " ") {
              tr.insertText(" ");
            } else if (event.key === "Enter") {
              // Let the default Enter handler take over
              view.dispatch(tr);
              return false;
            }

            view.dispatch(tr);
            return true;
          },
        },
      }),

      // Handle clicks and keyboard on wiki links
      new Plugin({
        key: new PluginKey("wikiLinkInteraction"),

        props: {
          handleClick(view, pos, event) {
            const { doc } = view.state;
            const clickPos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });

            if (!clickPos) return false;

            // Find the wiki-link node at this position
            // Use safe boundaries to avoid nodesBetween errors
            const from = Math.max(0, clickPos.pos - 1);
            const to = Math.min(doc.content.size, clickPos.pos + 1);

            let wikiLinkNode = null;

            try {
              doc.nodesBetween(from, to, (node) => {
                if (node.type.name === "wikiLink") {
                  wikiLinkNode = node;
                  return false;
                }
              });
            } catch (err) {
              // Silently handle any range errors
              return false;
            }

            // Single-click to navigate
            if (wikiLinkNode && options.onClickLink) {
              event.preventDefault();
              options.onClickLink((wikiLinkNode as any).attrs.targetTitle);
              return true;
            }

            return false;
          },

          handleKeyDown(view, event) {
            const { selection, doc, schema } = view.state;
            const { $from } = selection;

            // Check if cursor is directly before or after a wiki-link node
            const nodeBefore = $from.nodeBefore;
            const nodeAfter = $from.nodeAfter;

            // Backspace on a wiki-link node (cursor right after it)
            if (event.key === "Backspace" && nodeBefore?.type.name === "wikiLink") {
              event.preventDefault();

              const { targetTitle, displayText } = nodeBefore.attrs;
              const wikiText = displayText
                ? `[[${targetTitle}|${displayText}]]`
                : `[[${targetTitle}]]`;

              const nodePos = $from.pos - nodeBefore.nodeSize;
              const transaction = view.state.tr.replaceWith(
                nodePos,
                $from.pos,
                schema.text(wikiText)
              );

              view.dispatch(transaction);
              return true;
            }

            // Delete on a wiki-link node (cursor right before it)
            if (event.key === "Delete" && nodeAfter?.type.name === "wikiLink") {
              event.preventDefault();

              const { targetTitle, displayText } = nodeAfter.attrs;
              const wikiText = displayText
                ? `[[${targetTitle}|${displayText}]]`
                : `[[${targetTitle}]]`;

              const nodePos = $from.pos;
              const transaction = view.state.tr.replaceWith(
                nodePos,
                nodePos + nodeAfter.nodeSize,
                schema.text(wikiText)
              );

              view.dispatch(transaction);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
