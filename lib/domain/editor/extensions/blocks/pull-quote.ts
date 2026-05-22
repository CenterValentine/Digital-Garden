/**
 * Pull Quote Block
 *
 * Visual quote callout for publishing — 7 display variants.
 * Content model: inline* (editable quote text).
 *
 * Attrs:
 * - variant: display style
 * - attribution: optional author / source
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { makeWrapAttrs } from "@/lib/domain/blocks/wrap-size";

const VARIANTS = [
  "default",
  "bordered",
  "card",
  "pullquote",
  "featured",
  "minimal",
  "attribution",
] as const;

const { schema: pullQuoteSchema, defaults: pullQuoteDefaults } =
  createBlockSchema("pullQuote", {
    variant: z
      .enum(VARIANTS)
      .default("bordered")
      .describe("Visual style of the quote"),
    attribution: z
      .string()
      .default("")
      .describe("Optional attribution (author, source, etc.)"),
  });

registerBlock({
  type: "pullQuote",
  label: "Pull Quote",
  description: "Highlighted quote with 7 visual styles",
  iconName: "Quote",
  family: "content",
  group: "text",
  contentModel: "inline*",
  atom: false,
  attrsSchema: pullQuoteSchema,
  defaultAttrs: pullQuoteDefaults(),
  slashCommand: "/quote",
  searchTerms: ["quote", "pullquote", "blockquote", "citation", "highlight"],
});

export const PullQuote = Node.create({
  name: "pullQuote",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      blockId: blockIdAttr,
      blockType: { default: "pullQuote" },
      variant: {
        default: "bordered",
        parseHTML: (el) => el.getAttribute("data-variant") || "bordered",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
      attribution: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-attribution") || "",
        renderHTML: (attrs) => {
          if (!attrs.attribution) return {};
          return { "data-attribution": attrs.attribution };
        },
      },
      ...makeWrapAttrs(),
    };
  },

  parseHTML() {
    return [{ tag: 'blockquote[data-block-type="pullQuote"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "blockquote",
      mergeAttributes(HTMLAttributes, {
        class: "block-pull-quote",
        "data-block-type": "pullQuote",
      }),
      0,
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "pullQuote",
      label: "Pull Quote",
      iconName: "Quote",
      atom: false,
      supportWrap: true,
      renderContent(node, contentDom) {
        contentDom.classList.add("block-pull-quote-content");
        contentDom.setAttribute("data-variant", node.attrs.variant || "bordered");
        applyVariantStyle(contentDom, node.attrs.variant || "bordered");
        if (node.attrs.attribution) {
          updateAttribution(contentDom, node.attrs.attribution);
        }
      },
      updateContent(node, contentDom) {
        contentDom.setAttribute("data-variant", node.attrs.variant || "bordered");
        applyVariantStyle(contentDom, node.attrs.variant || "bordered");
        updateAttribution(contentDom, node.attrs.attribution || "");
        return true;
      },
    });
  },
});

const VARIANT_STYLES: Record<string, string> = {
  default:     "border-left:3px solid #e5e7eb;padding:8px 0 8px 16px;font-size:16px;color:#374151",
  bordered:    "border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;font-size:16px;color:#374151",
  card:        "border:1px solid #e5e7eb;border-radius:8px;padding:20px;background:#f9fafb;font-size:16px;color:#374151",
  pullquote:   "font-size:22px;font-style:italic;text-align:center;color:#374151;padding:8px 24px;line-height:1.5",
  featured:    "border-left:4px solid #2563eb;background:#eff6ff;padding:12px 16px;border-radius:0 6px 6px 0;font-size:16px;color:#1e3a8a",
  minimal:     "font-style:italic;color:#6b7280;font-size:16px;padding:4px 0",
  attribution: "border-left:3px solid #d1d5db;padding:8px 0 28px 16px;font-size:16px;color:#374151",
};

function applyVariantStyle(contentDom: HTMLElement, variant: string) {
  contentDom.style.cssText = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default!;
}

function updateAttribution(contentDom: HTMLElement, attribution: string) {
  let footer = contentDom.parentElement?.querySelector<HTMLElement>(".block-pull-quote-attribution");
  if (attribution) {
    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "block-pull-quote-attribution";
      footer.contentEditable = "false";
      contentDom.parentElement?.appendChild(footer);
    }
    footer.textContent = `— ${attribution}`;
  } else if (footer) {
    footer.remove();
  }
}

/** Server-safe version (no NodeView) */
export const ServerPullQuote = Node.create({
  name: "pullQuote",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      blockId: blockIdAttr,
      blockType: { default: "pullQuote" },
      variant: {
        default: "bordered",
        parseHTML: (el) => el.getAttribute("data-variant") || "bordered",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
      attribution: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-attribution") || "",
        renderHTML: (attrs) => {
          if (!attrs.attribution) return {};
          return { "data-attribution": attrs.attribution };
        },
      },
      ...makeWrapAttrs(),
    };
  },

  parseHTML() {
    return [{ tag: 'blockquote[data-block-type="pullQuote"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attribution = HTMLAttributes["data-attribution"];
    const variant = HTMLAttributes["data-variant"] || "bordered";
    return [
      "blockquote",
      mergeAttributes(HTMLAttributes, {
        class: `block-pull-quote block-pull-quote--${variant}`,
        "data-block-type": "pullQuote",
      }),
      ...(attribution
        ? [
            ["span", { class: "block-pull-quote-text" }, 0],
            ["footer", { class: "block-pull-quote-attribution" }, `— ${attribution}`],
          ]
        : [0]),
    ];
  },
});
