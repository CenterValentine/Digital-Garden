import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";

import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import {
  UNSUPPORTED_BLOCK_NODE_TYPE,
  UNSUPPORTED_INLINE_NODE_TYPE,
} from "@/lib/domain/editor/unsupported-content";

const { schema: unsupportedBlockSchema, defaults: unsupportedBlockDefaults } =
  createBlockSchema(UNSUPPORTED_BLOCK_NODE_TYPE, {
    originalType: z
      .string()
      .default("")
      .describe("Original node type that is unavailable in this build"),
    originalJson: z
      .string()
      .default("")
      .describe("Preserved original node JSON for future recovery"),
  });

registerBlock({
  type: UNSUPPORTED_BLOCK_NODE_TYPE,
  label: "Unsupported Block",
  description:
    "Preserved block content that is unavailable in the current editor build.",
  iconName: "ShieldAlert",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: unsupportedBlockSchema,
  defaultAttrs: unsupportedBlockDefaults(),
  hiddenFields: ["originalType", "originalJson"],
});

function renderUnsupportedBlockContent(
  node: { attrs: Record<string, unknown> },
  contentDom: HTMLElement
) {
  contentDom.classList.add("block-unsupported-content");

  const eyebrow = document.createElement("div");
  eyebrow.className = "block-unsupported-eyebrow";
  eyebrow.textContent = "Unavailable block preserved";
  contentDom.appendChild(eyebrow);

  const title = document.createElement("div");
  title.className = "block-unsupported-title";
  title.textContent = String(node.attrs.originalType || "unknown");
  contentDom.appendChild(title);

  const body = document.createElement("p");
  body.className = "block-unsupported-body";
  body.textContent =
    "This block is preserved for safety, but its implementation is not available in this build. Open a build that supports it to inspect or edit the original block.";
  contentDom.appendChild(body);
}

function createUnsupportedBlockExtension(name: string) {
  return Node.create({
    name,
    group: "block",
    atom: true,

    addAttributes() {
      return {
        blockId: { default: null },
        blockType: { default: UNSUPPORTED_BLOCK_NODE_TYPE },
        originalType: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-original-type") || "",
          renderHTML: (attrs) =>
            attrs.originalType ? { "data-original-type": attrs.originalType } : {},
        },
        originalJson: {
          default: "",
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-block-type="${UNSUPPORTED_BLOCK_NODE_TYPE}"]` }];
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          class: "block-unsupported",
          "data-block-type": UNSUPPORTED_BLOCK_NODE_TYPE,
        }),
        [
          "div",
          { class: "block-unsupported-export" },
          [
            "strong",
            {},
            `Unsupported block: ${String(node.attrs.originalType || "unknown")}`,
          ],
          [
            "p",
            {},
            "This block was preserved because its implementation is unavailable in this build.",
          ],
        ],
      ];
    },

    addNodeView() {
      return createBlockNodeView({
        blockType: UNSUPPORTED_BLOCK_NODE_TYPE,
        label: "Unsupported",
        iconName: "ShieldAlert",
        atom: true,
        renderContent(node, contentDom) {
          renderUnsupportedBlockContent(node, contentDom);
        },
        updateContent(node, contentDom) {
          contentDom.innerHTML = "";
          renderUnsupportedBlockContent(node, contentDom);
          return true;
        },
      });
    },
  });
}

function createUnsupportedInlineExtension(name: string) {
  return Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        originalType: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-original-type") || "",
          renderHTML: (attrs) =>
            attrs.originalType ? { "data-original-type": attrs.originalType } : {},
        },
        originalJson: {
          default: "",
        },
      };
    },

    parseHTML() {
      return [{ tag: `span[data-inline-type="${UNSUPPORTED_INLINE_NODE_TYPE}"]` }];
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          class: "unsupported-inline-node",
          "data-inline-type": UNSUPPORTED_INLINE_NODE_TYPE,
        }),
        `Unsupported inline content: ${String(node.attrs.originalType || "unknown")}`,
      ];
    },
  });
}

export const UnsupportedBlock = createUnsupportedBlockExtension(
  UNSUPPORTED_BLOCK_NODE_TYPE
);
export const ServerUnsupportedBlock = createUnsupportedBlockExtension(
  UNSUPPORTED_BLOCK_NODE_TYPE
);

export const UnsupportedInline = createUnsupportedInlineExtension(
  UNSUPPORTED_INLINE_NODE_TYPE
);
export const ServerUnsupportedInline = createUnsupportedInlineExtension(
  UNSUPPORTED_INLINE_NODE_TYPE
);
