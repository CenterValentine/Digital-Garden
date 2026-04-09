import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

import { createPersonMentionSuggestion, type PersonMentionSuggestionItem } from "./person-mention-suggestion";

export interface PersonMentionOptions {
  HTMLAttributes: Record<string, unknown>;
  fetchPeople: (query: string) => Promise<PersonMentionSuggestionItem[]>;
  onPersonClick?: (personId: string) => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    personMention: {
      insertPersonMention: (attrs: {
        personId: string;
        label: string;
        slug?: string | null;
      }) => ReturnType;
    };
  }
}

export const PersonMention = Node.create<PersonMentionOptions>({
  name: "personMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      fetchPeople: async () => [],
      onPersonClick: undefined,
    };
  },

  addAttributes() {
    return {
      personId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-person-id"),
        renderHTML: (attributes) => {
          if (!attributes.personId) return {};
          return {
            "data-person-id": attributes.personId,
          };
        },
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => {
          if (!attributes.label) return {};
          return {
            "data-label": attributes.label,
          };
        },
      },
      slug: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-slug"),
        renderHTML: (attributes) => {
          if (!attributes.slug) return {};
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
        tag: 'span[data-type="person-mention"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "person-mention",
        class: "person-mention cursor-pointer rounded-full bg-blue-500/10 px-1.5 py-0.5 text-blue-600 hover:bg-blue-500/15",
      }),
      `@${node.attrs.label || "person"}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label || "person"}`;
  },

  addCommands() {
    return {
      insertPersonMention:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /@([^\s@]{2,})$/,
        handler: () => null,
      }),
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      Suggestion({
        editor: this.editor,
        ...createPersonMentionSuggestion(options.fetchPeople),
      }),
      new Plugin({
        key: new PluginKey("personMentionClick"),
        props: {
          handleClickOn: (_view, _pos, node) => {
            if (node.type.name !== "personMention") {
              return false;
            }

            const personId = node.attrs.personId ? String(node.attrs.personId) : null;
            if (!personId) {
              return false;
            }

            options.onPersonClick?.(personId);
            return true;
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) {
            return false;
          }

          let found = false;

          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name !== this.name) {
              return;
            }

            found = true;
            const label = node.attrs.label ? String(node.attrs.label) : "person";
            const mentionText = `@${label}`;

            tr.delete(pos, pos + node.nodeSize)
              .insertText(mentionText, pos)
              .setSelection(TextSelection.near(tr.doc.resolve(pos + mentionText.length)));

            return false;
          });

          return found;
        }),
    };
  },
});
