/**
 * Tag TipTap Extension
 *
 * Renders #tag as an inline node with color and click behavior
 * Supports autocomplete via tag-suggestion.tsx
 *
 * M6: Search & Knowledge Features - Tags
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { InputRule } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { createTagSuggestion } from "./tag-suggestion";

export interface TagOptions {
  HTMLAttributes: Record<string, any>;
  renderLabel: (props: { node: any }) => string;
  fetchTags: (query: string) => Promise<any[]>;
  createTag?: (tagName: string) => Promise<any>;
  onTagClick?: (tagId: string, tagName: string) => void;
  onTagSelect?: (tag: any) => void;
  suggestion: any;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tag: {
      /**
       * Insert a tag
       */
      insertTag: (attrs: { tagId: string; tagName: string; slug: string; color?: string | null }) => ReturnType;
    };
  }
}

export const Tag = Node.create<TagOptions>({
  name: "tag",

  group: "inline",

  inline: true,

  selectable: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      renderLabel: ({ node }) => `#${node.attrs.tagName}`,
      fetchTags: async () => [],
      createTag: undefined,
      onTagClick: undefined,
      onTagSelect: undefined,
      suggestion: {},
    };
  },

  addAttributes() {
    return {
      tagId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tag-id"),
        renderHTML: (attributes) => {
          if (!attributes.tagId) {
            return {};
          }
          return {
            "data-tag-id": attributes.tagId,
          };
        },
      },
      tagName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tag-name"),
        renderHTML: (attributes) => {
          if (!attributes.tagName) {
            return {};
          }
          return {
            "data-tag-name": attributes.tagName,
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
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-color"),
        renderHTML: (attributes) => {
          if (!attributes.color) {
            return {};
          }
          return {
            "data-color": attributes.color,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="tag"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const color = node.attrs.color || "#3b82f6"; // Default blue

    return [
      "span",
      mergeAttributes(
        {
          "data-type": "tag",
          class: "tag-node",
          style: `
            display: inline-flex;
            align-items: center;
            padding: 0.125rem 0.5rem;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s;
            background-color: ${color}20;
            color: ${color};
            border: 1px solid ${color}40;
          `,
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      this.options.renderLabel({ node }),
    ];
  },

  renderText({ node }) {
    return `#${node.attrs.tagName}`;
  },

  addCommands() {
    return {
      insertTag:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },

  addInputRules() {
    // Don't add input rules - let the suggestion menu handle tag creation
    // The input rule was conflicting with the suggestion menu
    return [];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let tagFound = false;
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) {
            return false;
          }

          // Check if cursor is right after a tag node
          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              tagFound = true;

              // Convert tag to editable text instead of deleting
              const tagText = `#${node.attrs.tagName}`;

              // Delete the tag node and insert editable text
              tr.delete(pos, pos + node.nodeSize)
                .insertText(tagText, pos)
                // Position cursor at the end of the text
                .setSelection(
                  (state.selection.constructor as any).near(
                    tr.doc.resolve(pos + tagText.length)
                  )
                );

              return false;
            }
          });

          return tagFound;
        }),
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;

    return [
      Suggestion({
        editor: this.editor,
        ...createTagSuggestion(
          this.options.fetchTags,
          this.options.onTagSelect,
          this.options.createTag
        ),
      }),

      // Double-click to edit tag
      new Plugin({
        key: new PluginKey("tagDoubleClick"),
        props: {
          handleDoubleClick: (view, pos, event) => {
            const { doc, tr } = view.state;

            // Find tag node at click position
            let tagNode = null;
            let tagPos = -1;

            doc.nodesBetween(pos - 1, pos + 1, (node, nodePos) => {
              if (node.type.name === "tag") {
                tagNode = node;
                tagPos = nodePos;
                return false;
              }
            });

            if (!tagNode) return false;

            // Replace tag node with plain text for editing
            const tagText = `#${(tagNode as any).attrs.tagName}`;
            const from = tagPos;
            const to = tagPos + (tagNode as any).nodeSize;

            // Delete the tag node and insert editable text
            view.dispatch(
              tr
                .delete(from, to)
                .insertText(tagText, from)
                // Set selection to the end of the inserted text (after the tag name)
                .setSelection(
                  (view.state.selection.constructor as any).near(
                    tr.doc.resolve(from + tagText.length)
                  )
                )
            );

            // Focus the editor
            view.focus();

            // Prevent default double-click behavior
            event.preventDefault();
            return true;
          },
        },
      }),

      // Auto-convert #tagname text to tag nodes when clicking away
      new Plugin({
        key: new PluginKey("tagAutoConvert"),
        appendTransaction: (transactions, oldState, newState) => {
          // Only run if selection changed (user clicked/moved cursor)
          const selectionChanged = !oldState.selection.eq(newState.selection);
          if (!selectionChanged) return null;

          const { doc, tr } = newState;
          let modified = false;

          // Find all text nodes with #tagname pattern
          doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;

            // Match #tagname pattern (letters, numbers, hyphens, underscores)
            const regex = /#([a-zA-Z0-9_-]+)(?=\s|$)/g;
            let match;

            while ((match = regex.exec(node.text)) !== null) {
              const tagName = match[1];
              const from = pos + match.index;
              const to = from + match[0].length;

              // Skip if cursor is currently in this tag text
              const { from: selFrom, to: selTo } = newState.selection;
              if (selFrom >= from && selTo <= to) {
                continue;
              }

              // Convert to tag node asynchronously
              // We'll mark this position and convert it after fetching
              setTimeout(async () => {
                try {
                  const tags = await options.fetchTags(tagName);
                  const existingTag = tags.find(
                    (t) => t.name.toLowerCase() === tagName.toLowerCase()
                  );

                  let tagData;
                  if (existingTag) {
                    tagData = existingTag;
                  } else if (options.createTag) {
                    tagData = await options.createTag(tagName);
                  } else {
                    return; // Can't create tag without createTag callback
                  }

                  // Create a new transaction to replace the text with tag node
                  const currentState = editor.state;
                  const currentTr = currentState.tr;

                  // Find the text again in current state (positions may have shifted)
                  let foundPos = -1;
                  currentState.doc.descendants((n, p) => {
                    if (n.isText && n.text?.includes(`#${tagName}`)) {
                      const idx = n.text.indexOf(`#${tagName}`);
                      if (idx !== -1) {
                        foundPos = p + idx;
                        return false;
                      }
                    }
                  });

                  if (foundPos >= 0) {
                    currentTr.replaceWith(
                      foundPos,
                      foundPos + tagName.length + 1, // +1 for the #
                      currentState.schema.nodes.tag.create({
                        tagId: tagData.id,
                        tagName: tagData.name,
                        slug: tagData.slug,
                        color: tagData.color,
                      })
                    );

                    editor.view.dispatch(currentTr);
                  }
                } catch (err) {
                  console.error("Failed to convert tag:", err);
                }
              }, 0);

              modified = true;
            }
          });

          return null; // We handle conversion async, so don't modify tr here
        },
      }),
    ];
  },
});
