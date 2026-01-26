/**
 * Wiki-Link Extension for TipTap
 *
 * Enables Obsidian-style [[Note Title]] linking
 *
 * Features:
 * - Type [[ to trigger autocomplete
 * - Select a note from the list
 * - Creates a clickable link to that note
 * - Stores targetId and targetTitle for backlinks
 *
 * M6: Search & Knowledge Features - Wiki Links
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, any>;
  onSearch?: (query: string) => Promise<Array<{ id: string; title: string; slug: string }>>;
  onClick?: (attrs: { targetId: string; targetTitle: string; slug: string }) => void;
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",

  group: "inline",

  inline: true,

  selectable: false,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onSearch: undefined,
      onClick: undefined,
    };
  },

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-id"),
        renderHTML: (attributes) => {
          if (!attributes.targetId) {
            return {};
          }
          return {
            "data-target-id": attributes.targetId,
          };
        },
      },
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
      slug: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-slug"),
        renderHTML: (attributes) => {
          if (!attributes.slug) {
            return {};
          }
          return {
            "data-slug": attributes.slug,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="wiki-link"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "wiki-link",
        class: "wiki-link",
        href: "#", // We'll handle click via onClick
      }),
      `[[${node.attrs.targetTitle || "Unknown"}]]`,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.targetTitle || "Unknown"}]]`;
  },

  addKeyboardShortcuts() {
    return {
      // Backspace to delete the entire wiki link
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isWikiLink = false;
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) {
            return false;
          }

          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isWikiLink = true;
              tr.delete(pos, pos + node.nodeSize);
              return false;
            }
          });

          return isWikiLink;
        }),
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: new PluginKey("wikiLinkAutocomplete"),

        state: {
          init() {
            return {
              active: false,
              query: "",
              decorations: DecorationSet.empty,
            };
          },

          apply(tr, value, oldState, newState) {
            // Check if we should show autocomplete
            const { selection } = newState;
            const { $from } = selection;
            const textBefore = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 50),
              $from.parentOffset,
              null,
              "\ufffc"
            );

            // Look for [[ pattern
            const match = textBefore.match(/\[\[([^\]]*?)$/);

            if (match) {
              const query = match[1];
              return {
                active: true,
                query,
                decorations: DecorationSet.empty,
              };
            }

            return {
              active: false,
              query: "",
              decorations: DecorationSet.empty,
            };
          },
        },

        props: {
          decorations(state) {
            return this.getState(state)?.decorations;
          },

          handleClick(view, pos, event) {
            const { schema } = view.state;
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });

            if (!coords) return false;

            const node = view.state.doc.nodeAt(coords.pos);

            if (node && node.type === schema.nodes.wikiLink) {
              event.preventDefault();

              if (options.onClick) {
                options.onClick({
                  targetId: node.attrs.targetId,
                  targetTitle: node.attrs.targetTitle,
                  slug: node.attrs.slug,
                });
              }

              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
