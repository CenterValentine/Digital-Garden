/**
 * Callout Extension (Obsidian-style)
 *
 * Supports both Obsidian markdown syntax and programmatic insertion.
 *
 * Markdown Syntax:
 *   > [!note]
 *   > Content here
 *
 *   > [!warning] Custom Title
 *   > Warning content
 *
 * Supported Types: note, tip, warning, danger, info
 *
 * Features:
 * - Custom titles (optional)
 * - Full markdown content support
 * - Editable title via double-click
 * - Type-specific styling with icons and colors
 *
 * Future: Custom icons and colors (requires database schema update)
 *
 * M7: Callouts & Context Menus - Phase 1
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface CalloutOptions {
  types: string[];
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /**
       * Insert a callout block
       */
      setCallout: (options?: { type?: string; title?: string }) => ReturnType;
      /**
       * Toggle callout (convert selection to/from callout)
       */
      toggleCallout: (options?: { type?: string; title?: string }) => ReturnType;
      /**
       * Update callout type
       */
      updateCalloutType: (type: string) => ReturnType;
      /**
       * Update callout title
       */
      updateCalloutTitle: (title: string) => ReturnType;
    };
  }
}

export const Callout = Node.create<CalloutOptions>({
  name: "callout",

  group: "block",

  content: "block+",

  defining: true,

  addOptions() {
    return {
      types: ["note", "tip", "warning", "danger", "info"],
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      type: {
        default: "note",
        parseHTML: (element) => element.getAttribute("data-callout-type") || "note",
        renderHTML: (attributes) => {
          return { "data-callout-type": attributes.type };
        },
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-callout-title"),
        renderHTML: (attributes) => {
          if (!attributes.title) return {};
          return { "data-callout-title": attributes.title };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-callout-type]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { type, title } = node.attrs;

    // Default title is capitalized type name
    const displayTitle = title || type.charAt(0).toUpperCase() + type.slice(1);

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: `callout callout-${type}`,
      }),
      [
        "div",
        {
          class: "callout-title",
          "data-title": displayTitle,
          contenteditable: "false",
        },
        displayTitle,
      ],
      ["div", { class: "callout-content" }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              type: options?.type || "note",
              title: options?.title || null,
            },
            content: [
              {
                type: "paragraph",
              },
            ],
          });
        },

      toggleCallout:
        (options) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, {
            type: options?.type || "note",
            title: options?.title || null,
          });
        },

      updateCalloutType:
        (type) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { type });
        },

      updateCalloutTitle:
        (title) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { title });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Mod+Shift+C to insert callout
      "Mod-Shift-c": () => this.editor.commands.setCallout(),
    };
  },

  addInputRules(): any {
    return [
      // Match: > [!type] Optional Title
      // At start of line or after whitespace
      {
        find: /^>\s*\[!(note|tip|warning|danger|info)\](?:\s+(.+))?$/,
        handler: ({ state, range, match }: any) => {
          const type = match[1];
          const title = match[2] || null;

          const { tr } = state;

          // Delete the matched text
          tr.delete(range.from, range.to);

          // Insert callout node
          const calloutNode = state.schema.nodes.callout.create(
            {
              type,
              title,
            },
            state.schema.nodes.paragraph.create()
          );

          tr.insert(range.from, calloutNode);

          // Move cursor into the callout content
          tr.setSelection(
            (state.selection.constructor as any).near(tr.doc.resolve(range.from + 2))
          );
        },
      },
    ];
  },
});
