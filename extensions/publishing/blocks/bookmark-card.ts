/**
 * BookmarkCard Block — W10 Publishing Block
 *
 * Atom block: a styled link card — like an Open Graph preview.
 * Author fills in the metadata manually (URL, title, description, image, domain).
 * Useful for curated reading lists, resource links, and external references.
 *
 * Attrs:
 * - url         Link URL
 * - title       Page title
 * - description Short description / excerpt
 * - imageUrl    OG preview image URL
 * - domain      Domain name to display (auto-derived from URL if blank)
 * - variant     default | compact | hero | inline
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import {
  BACKGROUND_SCHEMA_SHAPE,
  backgroundAttrs,
} from "../lib/background-attrs";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { makeWrapAttrs } from "@/lib/domain/blocks/wrap-size";
import { makeEditableField, syncEditableField } from "@/lib/domain/blocks/inline-edit";

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

const VARIANTS = ["default", "compact", "hero", "inline"] as const;

const { schema: bookmarkSchema, defaults: bookmarkDefaults } = createBlockSchema(
  "bookmarkCard",
  {
    url: z.string().default("").describe("Link URL"),
    title: z.string().default("").describe("Page or resource title"),
    description: z.string().default("").describe("Short description or excerpt"),
    imageUrl: z.string().default("").describe("Preview image URL").meta({ uploadType: "image" }),
    domain: z.string().default("").describe("Domain label (leave blank to auto-derive from URL)"),
    variant: z.enum(VARIANTS).default("default"),
    ...BACKGROUND_SCHEMA_SHAPE,
  }
);

registerBlock({
  type: "bookmarkCard",
  label: "Bookmark Card",
  description: "Styled link card with title, description, and preview image",
  iconName: "Bookmark",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: bookmarkSchema,
  defaultAttrs: bookmarkDefaults(),
  slashCommand: "/bookmark",
  searchTerms: ["bookmark", "link", "card", "preview", "og", "resource", "reading"],
});

function bookmarkAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "bookmarkCard" },
    url: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-url": attrs.url }),
    },
    title: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-title") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-title": attrs.title }),
    },
    description: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-description") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-description": attrs.description }),
    },
    imageUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-image-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-image-url": attrs.imageUrl }),
    },
    domain: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-domain") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-domain": attrs.domain }),
    },
    variant: {
      default: "default",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "default",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    ...backgroundAttrs(),
    ...makeWrapAttrs(),
  };
}

// ─── Editor DOM refs ──────────────────────────────────────────────────────────

interface BookmarkEditorRefs {
  domainEl: HTMLElement;
  titleEl: HTMLElement;
  descEl: HTMLElement;
  imgWrap: HTMLElement;
}
const bookmarkRefs = new WeakMap<HTMLElement, BookmarkEditorRefs>();

function buildBookmarkDom(
  contentDom: HTMLElement,
  url: string, title: string, description: string,
  imageUrl: string, domain: string, variant: string,
): BookmarkEditorRefs {
  const displayDomain = domain || extractDomain(url);
  contentDom.className = `block-bookmark block-bookmark--${variant} block-bookmark-editor`;
  contentDom.innerHTML = "";

  const body = document.createElement("div");
  body.className = "block-bookmark-body";

  const domainEl = makeEditableField("span", "block-bookmark-domain", displayDomain, "domain", "domain.com");
  const titleEl = makeEditableField("strong", "block-bookmark-title", title, "title", "Link title");
  const descEl = makeEditableField("p", "block-bookmark-desc", description, "description", "Description…");

  body.appendChild(domainEl);
  body.appendChild(titleEl);
  body.appendChild(descEl);

  const imgWrap = document.createElement("div");
  imgWrap.className = "block-bookmark-img-wrap";
  renderBookmarkImage(imgWrap, imageUrl, title);

  contentDom.appendChild(body);
  contentDom.appendChild(imgWrap);

  return { domainEl, titleEl, descEl, imgWrap };
}

function renderBookmarkImage(imgWrap: HTMLElement, imageUrl: string, title: string) {
  imgWrap.innerHTML = "";
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.className = "block-bookmark-img";
    img.alt = title || "";
    imgWrap.appendChild(img);
  }
  imgWrap.style.display = imageUrl ? "" : "none";
}

export const BookmarkCard = Node.create({
  name: "bookmarkCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: bookmarkAttrs,
  parseHTML() { return [{ tag: 'a[data-block-type="bookmarkCard"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, { class: "block-bookmark", "data-block-type": "bookmarkCard" })];
  },
  addNodeView() {
    return createBlockNodeView({
      blockType: "bookmarkCard", label: "Bookmark Card", iconName: "Bookmark", atom: true, supportWrap: true,
      renderContent(node, contentDom) {
        const a = node.attrs as Record<string, string>;
        const refs = buildBookmarkDom(
          contentDom, a.url, a.title, a.description, a.imageUrl, a.domain, a.variant,
        );
        bookmarkRefs.set(contentDom, refs);
      },
      updateContent(node, contentDom) {
        const refs = bookmarkRefs.get(contentDom);
        if (!refs) return false;
        const a = node.attrs as Record<string, string>;
        const displayDomain = a.domain || extractDomain(a.url);

        contentDom.className = `block-bookmark block-bookmark--${a.variant || "default"} block-bookmark-editor`;
        syncEditableField(refs.domainEl, displayDomain);
        syncEditableField(refs.titleEl, a.title);
        syncEditableField(refs.descEl, a.description);
        renderBookmarkImage(refs.imgWrap, a.imageUrl, a.title);
        return true;
      },
    });
  },
});

export const ServerBookmarkCard = Node.create({
  name: "bookmarkCard",
  group: "block",
  atom: true,

  addAttributes: bookmarkAttrs,
  parseHTML() { return [{ tag: 'a[data-block-type="bookmarkCard"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const url = (HTMLAttributes["data-url"] as string) || "";
    const title = (HTMLAttributes["data-title"] as string) || "";
    const description = (HTMLAttributes["data-description"] as string) || "";
    const imageUrl = (HTMLAttributes["data-image-url"] as string) || "";
    const domain = (HTMLAttributes["data-domain"] as string) || extractDomain(url);
    const variant = (HTMLAttributes["data-variant"] as string) || "default";
    const bgColor = (HTMLAttributes["data-bg-color"] as string) || "";
    const bgGradient = (HTMLAttributes["data-bg-gradient"] as string) || "";
    const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";

    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href: url,
        class: `block-bookmark block-bookmark--${variant}`,
        "data-block-type": "bookmarkCard",
        rel: "noopener noreferrer",
        target: "_blank",
        ...(bgStyle ? { style: bgStyle } : {}),
      }),
      ["div", { class: "block-bookmark-body" },
        ...(domain ? [["span", { class: "block-bookmark-domain" }, domain]] : []),
        ...(title ? [["strong", { class: "block-bookmark-title" }, title]] : []),
        ...(description ? [["p", { class: "block-bookmark-desc" }, description]] : []),
      ],
      ...(imageUrl
        ? [["div", { class: "block-bookmark-img-wrap" },
            ["img", { src: imageUrl, class: "block-bookmark-img", alt: title, loading: "lazy" }]
          ]]
        : []),
    ];
  },
});
