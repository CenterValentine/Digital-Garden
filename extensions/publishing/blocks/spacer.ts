/**
 * Spacer Block — W10 Publishing Block
 *
 * Atom block: an invisible height spacer for fine-grained layout control.
 *
 * Attrs:
 * - height  xs | sm | md | lg | xl | 2xl  (maps to 16 / 32 / 48 / 64 / 96 / 128 px)
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "../lib/data-attr";

const HEIGHTS = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
const HEIGHT_PX: Record<string, number> = { xs: 16, sm: 32, md: 48, lg: 64, xl: 96, "2xl": 128 };

const { schema: spacerSchema, defaults: spacerDefaults } = createBlockSchema(
  "spacer",
  {
    height: z.enum(HEIGHTS).default("md").describe("Spacer height (xs=16px → 2xl=128px)"),
  }
);

registerBlock({
  type: "spacer",
  label: "Spacer",
  description: "Invisible vertical space for layout control",
  iconName: "ArrowUpDown",
  family: "layout",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: spacerSchema,
  defaultAttrs: spacerDefaults(),
  slashCommand: "/spacer",
  searchTerms: ["spacer", "space", "gap", "padding", "empty", "blank"],
});

function spacerAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "spacer" },
    height: dataAttr("height", { default: "md" }),
  };
}

export const Spacer = Node.create({
  name: "spacer",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: spacerAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="spacer"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "block-spacer", "data-block-type": "spacer" })];
  },
  addNodeView() {
    return createBlockNodeView({
      blockType: "spacer", label: "Spacer", iconName: "ArrowUpDown", atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-spacer-editor";
        const px = HEIGHT_PX[node.attrs.height as string] ?? 48;
        contentDom.style.height = `${px}px`;
        contentDom.style.display = "flex";
        contentDom.style.alignItems = "center";
        contentDom.style.justifyContent = "center";
        contentDom.innerHTML = `<p style="margin:0;font-size:11px;color:#d1d5db;user-select:none">${node.attrs.height} spacer · ${px}px</p>`;
      },
      updateContent(node, contentDom) {
        const px = HEIGHT_PX[node.attrs.height as string] ?? 48;
        contentDom.style.height = `${px}px`;
        contentDom.innerHTML = `<p style="margin:0;font-size:11px;color:#d1d5db;user-select:none">${node.attrs.height} spacer · ${px}px</p>`;
        return true;
      },
    });
  },
});

export const ServerSpacer = Node.create({
  name: "spacer",
  group: "block",
  atom: true,

  addAttributes: spacerAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="spacer"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const height = (HTMLAttributes["data-height"] as string) || "md";
    const px = HEIGHT_PX[height] ?? 48;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-spacer block-spacer--${height}`,
        "data-block-type": "spacer",
        style: `height:${px}px`,
        role: "presentation",
        "aria-hidden": "true",
      }),
    ];
  },
});
