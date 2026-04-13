import { Node, mergeAttributes } from "@tiptap/core";

export const ServerTag = Node.create({
  name: "tag",
  group: "inline",
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      tagId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tag-id"),
        renderHTML: (attributes) =>
          attributes.tagId ? { "data-tag-id": attributes.tagId } : {},
      },
      tagName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tag-name"),
        renderHTML: (attributes) =>
          attributes.tagName ? { "data-tag-name": attributes.tagName } : {},
      },
      slug: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-slug"),
        renderHTML: (attributes) =>
          attributes.slug ? { "data-slug": attributes.slug } : {},
      },
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-color"),
        renderHTML: (attributes) =>
          attributes.color ? { "data-color": attributes.color } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="tag"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const color = node.attrs.color || "#3b82f6";

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "tag",
        class: "tag-node",
        style: `background-color: ${color}20; color: ${color}; border-color: ${color}40;`,
      }),
      `#${node.attrs.tagName || "tag"}`,
    ];
  },

  renderText({ node }) {
    return `#${node.attrs.tagName || "tag"}`;
  },
});
