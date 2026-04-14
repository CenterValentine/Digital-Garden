import { Node, mergeAttributes } from "@tiptap/core";

export const ServerPersonMention = Node.create({
  name: "personMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      personId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-person-id"),
        renderHTML: (attributes) =>
          attributes.personId ? { "data-person-id": attributes.personId } : {},
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) =>
          attributes.label ? { "data-label": attributes.label } : {},
      },
      slug: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-slug"),
        renderHTML: (attributes) =>
          attributes.slug ? { "data-slug": attributes.slug } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="person-mention"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "person-mention",
        class: "person-mention",
      }),
      `@${node.attrs.label || "person"}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label || "person"}`;
  },
});
