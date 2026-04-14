import { Node, mergeAttributes } from "@tiptap/core";

export const ServerWikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      targetTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-title"),
        renderHTML: (attributes) =>
          attributes.targetTitle ? { "data-target-title": attributes.targetTitle } : {},
      },
      displayText: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-display-text"),
        renderHTML: (attributes) =>
          attributes.displayText ? { "data-display-text": attributes.displayText } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wiki-link",
        class: "wiki-link",
      }),
      node.attrs.displayText || node.attrs.targetTitle || "Unknown",
    ];
  },

  renderText({ node }) {
    const { targetTitle, displayText } = node.attrs;
    if (displayText) {
      return `[[${targetTitle}|${displayText}]]`;
    }
    return `[[${targetTitle}]]`;
  },
});
