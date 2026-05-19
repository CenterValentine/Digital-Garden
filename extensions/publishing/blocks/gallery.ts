/**
 * Gallery Block — W2 Publishing Block
 *
 * Atom block: grid / masonry / carousel of images.
 * Items stored as JSON string (ProseMirror attrs must be primitives).
 *
 * Attrs:
 * - items    JSON string: [{src, alt, caption?}]
 * - layout   grid | masonry | carousel
 * - columns  2–4 (grid only)
 * - gap      none | sm | md | lg
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "../lib/data-attr";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GalleryItem {
  src: string;
  alt: string;
  caption?: string;
}

function parseItems(raw: string): GalleryItem[] {
  try { return JSON.parse(raw) as GalleryItem[]; } catch { return []; }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const { schema: gallerySchema, defaults: galleryDefaults } = createBlockSchema("gallery", {
  items: z
    .string()
    .default("[]")
    .describe("Gallery images")
    .meta({ fieldType: "gallery-items" }),
  layout: z.enum(["grid", "masonry", "carousel"]).default("grid").describe("Visual layout"),
  columns: z.number().int().min(2).max(4).default(3).describe("Grid columns (2–4, applies to grid layout only)"),
  gap: z.enum(["none", "sm", "md", "lg"]).default("md").describe("Space between images"),
  hoverEffect: z.enum(["none", "zoom", "lift", "expand"]).default("zoom").describe("Image hover transition effect"),
  autoScroll: z.boolean().default(false).describe("Auto-advance carousel slides every 4 seconds"),
  fullWidth: z.boolean().default(false).describe("Expand masonry/grid to full container width"),
});

registerBlock({
  type: "gallery",
  label: "Gallery",
  description: "Image gallery — grid, masonry, or carousel layouts",
  iconName: "LayoutGrid",
  family: "content",
  group: "media",
  contentModel: null,
  atom: true,
  attrsSchema: gallerySchema,
  defaultAttrs: galleryDefaults(),
  slashCommand: "/gallery",
  searchTerms: ["gallery", "images", "photos", "grid", "carousel", "masonry"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function galleryAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "gallery" },
    items: dataAttr("items", { default: "[]" }),
    layout: dataAttr("layout", { default: "grid" }),
    columns: dataAttr<number>("columns", { default: 3, parseAs: "number" }),
    gap: dataAttr("gap", { default: "md" }),
    hoverEffect: dataAttr("hoverEffect", { default: "zoom" }),
    autoScroll: dataAttr<boolean>("autoScroll", { default: false, parseAs: "boolean" }),
    fullWidth: dataAttr<boolean>("fullWidth", { default: false, parseAs: "boolean" }),
  };
}

function editorHtml(
  items: GalleryItem[],
  columns: number,
  layout: string,
  gap: string,
  hoverEffect: string,
  fullWidth: boolean
): string {
  if (items.length === 0) {
    return `
      <div class="block-gallery-empty-placeholder">
        <p class="block-gallery-empty-title">No images yet</p>
        <p class="block-gallery-empty-hint">Add image URLs via the Properties panel (⋯)</p>
        <p class="block-gallery-empty-example">{"src":"https://…","alt":"…","caption":"…"}</p>
      </div>
    `;
  }

  const hoverClass = hoverEffect !== "none" ? ` block-gallery-item--hover-${hoverEffect}` : "";
  const gapClass = ` block-gallery--gap-${gap}`;
  const fullWidthClass = fullWidth ? " block-gallery--full-width" : "";

  const figures = items.map((item) => {
    if (!item.src) {
      return `<figure class="block-gallery-item"><div class="block-gallery-item-no-src">No src</div></figure>`;
    }
    return `<figure class="block-gallery-item${hoverClass}">
      <img src="${item.src}" alt="${item.alt}" loading="lazy">
      ${item.caption ? `<figcaption class="block-gallery-caption">${item.caption}</figcaption>` : ""}
    </figure>`;
  }).join("");

  if (layout === "carousel") {
    return `
      <div class="block-gallery block-gallery--carousel${gapClass}${fullWidthClass}">
        <div class="block-gallery-track">${figures}</div>
        <div class="block-gallery-controls">
          <button class="block-gallery-prev" type="button" aria-label="Previous">‹</button>
          <div class="block-gallery-dots"></div>
          <button class="block-gallery-next" type="button" aria-label="Next">›</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="block-gallery block-gallery--${layout}${gapClass}${fullWidthClass}" style="--gallery-columns:${columns}">
      ${figures}
    </div>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const Gallery = Node.create({
  name: "gallery",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: galleryAttrs,

  parseHTML() { return [{ tag: 'div[data-block-type="gallery"]' }]; },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "block-gallery", "data-block-type": "gallery" })];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "gallery",
      label: "Gallery",
      iconName: "LayoutGrid",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-gallery-editor";
        const items = parseItems(node.attrs.items as string);
        contentDom.innerHTML = editorHtml(
          items,
          node.attrs.columns as number,
          node.attrs.layout as string,
          node.attrs.gap as string,
          node.attrs.hoverEffect as string,
          node.attrs.fullWidth as boolean
        );
      },
      updateContent(node, contentDom) {
        const items = parseItems(node.attrs.items as string);
        contentDom.innerHTML = editorHtml(
          items,
          node.attrs.columns as number,
          node.attrs.layout as string,
          node.attrs.gap as string,
          node.attrs.hoverEffect as string,
          node.attrs.fullWidth as boolean
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerGallery = Node.create({
  name: "gallery",
  group: "block",
  atom: true,

  addAttributes: galleryAttrs,

  parseHTML() { return [{ tag: 'div[data-block-type="gallery"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const layout = (HTMLAttributes["data-layout"] ?? "grid") as string;
    const columns = HTMLAttributes["data-columns"] ?? 3;
    const gap = (HTMLAttributes["data-gap"] ?? "md") as string;
    const hoverEffect = (HTMLAttributes["data-hover-effect"] ?? "zoom") as string;
    const autoScroll = HTMLAttributes["data-auto-scroll"] === "true";
    const fullWidth = HTMLAttributes["data-full-width"] === "true";

    const hoverClass = hoverEffect !== "none" ? ` block-gallery-item--hover-${hoverEffect}` : "";

    const figures = items.map((item) => [
      "figure", { class: `block-gallery-item${hoverClass}` },
      ["img", { src: item.src, alt: item.alt, loading: "lazy" }],
      ...(item.caption ? [["figcaption", { class: "block-gallery-caption" }, item.caption]] : []),
    ]);

    const empty = [["p", { class: "block-gallery-empty" }, "No images"]];

    if (layout === "carousel") {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          class: `block-gallery block-gallery--carousel block-gallery--gap-${gap}${fullWidth ? " block-gallery--full-width" : ""}`,
          "data-block-type": "gallery",
          ...(autoScroll ? { "data-auto-scroll": "true" } : {}),
        }),
        ["div", { class: "block-gallery-track" },
          ...(figures.length > 0 ? figures : empty),
        ],
        ["div", { class: "block-gallery-controls" },
          ["button", { class: "block-gallery-prev", type: "button", "aria-label": "Previous" }, "‹"],
          ["div", { class: "block-gallery-dots" }],
          ["button", { class: "block-gallery-next", type: "button", "aria-label": "Next" }, "›"],
        ],
      ];
    }

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-gallery block-gallery--${layout} block-gallery--gap-${gap}${fullWidth ? " block-gallery--full-width" : ""}`,
        "data-block-type": "gallery",
        style: layout === "grid" ? `--gallery-columns:${columns}` : undefined,
      }),
      ...(figures.length > 0 ? figures : empty),
    ];
  },
});
