/**
 * HeroImage Block — W2 Publishing Block
 *
 * Full-width banner image with optional headline, subheadline, and CTA.
 *
 * Attrs:
 * - src          image URL
 * - alt          image alt text
 * - headline     overlay headline
 * - subheadline  secondary text
 * - ctaText      CTA button label (empty = no button)
 * - ctaUrl       CTA href
 * - overlay      opacity 0–80 (percent, darkens the image)
 * - height       sm | md | lg | xl | full
 * - align        left | center | right
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "@/lib/domain/blocks/data-attr";

const { schema: heroSchema, defaults: heroDefaults } = createBlockSchema("heroImage", {
  src: z.string().default("").describe("Image URL").meta({ uploadType: "image" }),
  alt: z.string().default("").describe("Alt text for accessibility"),
  headline: z.string().default("").describe("Bold headline displayed over the image"),
  subheadline: z.string().default("").describe("Secondary text below the headline"),
  ctaText: z.string().default("").describe("Call-to-action button label (leave empty to hide)"),
  ctaUrl: z.string().default("").describe("URL the CTA button links to"),
  overlay: z.number().int().min(0).max(80).default(40).describe("Dark overlay on the image (0 = none, 80 = very dark)"),
  height: z.enum(["sm", "md", "lg", "xl", "full"]).default("lg").describe("Block height"),
  align: z.enum(["left", "center", "right"]).default("center").describe("Content alignment"),
});

registerBlock({
  type: "heroImage",
  label: "Hero Image",
  description: "Full-width banner with headline, subheadline, and optional CTA",
  iconName: "Image",
  family: "content",
  group: "media",
  contentModel: null,
  atom: true,
  attrsSchema: heroSchema,
  defaultAttrs: heroDefaults(),
  slashCommand: "/hero",
  searchTerms: ["hero", "banner", "header", "cover", "full-width", "image"],
});

function heroAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "heroImage" },
    src: dataAttr("src"),
    alt: dataAttr("alt"),
    headline: dataAttr("headline"),
    subheadline: dataAttr("subheadline"),
    // Pre-R2 these used a local helper that accessed attrs by kebab-case
    // key — so `attrs["cta-text"]` returned undefined and the data
    // attribute was never emitted. The CTA link silently dropped from
    // every hero-image block. dataAttr() fixes this by always reading
    // attrs[camelKey] and emitting the kebab-derived data attribute.
    ctaText: dataAttr("ctaText"),
    ctaUrl: dataAttr("ctaUrl"),
    overlay: dataAttr("overlay", { default: 40, parseAs: "number" }),
    height: dataAttr("height", { default: "lg" }),
    align: dataAttr("align", { default: "center" }),
  };
}

const HEIGHT_PX: Record<string, string> = { sm: "160px", md: "260px", lg: "380px", xl: "520px", full: "100vh" };

function buildEditorHtml(attrs: Record<string, string | number>): string {
  const { src, headline, subheadline, ctaText, height, align, overlay } = attrs;
  const h = HEIGHT_PX[(height as string) ?? "lg"] ?? "380px";
  const justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const overlayAlpha = (overlay as number) / 100;

  if (!src) {
    return `
      <div style="min-height:${h};background:#f3f4f6;border:1px dashed #d1d5db;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
        <p style="margin:0;font-size:14px;font-weight:500;color:#6b7280">Hero Image</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Set an image URL via Properties (⋯)</p>
        ${headline ? `<p style="margin:0;font-size:13px;color:#374151;font-weight:600">${headline}</p>` : ""}
        ${subheadline ? `<p style="margin:0;font-size:12px;color:#6b7280">${subheadline}</p>` : ""}
        ${ctaText ? `<span style="display:inline-block;margin-top:4px;padding:6px 16px;background:#e5e7eb;border-radius:6px;font-size:12px;color:#374151">${ctaText}</span>` : ""}
      </div>
    `;
  }

  return `
    <div style="position:relative;min-height:${h};border-radius:8px;overflow:hidden;background-image:url(${src});background-size:cover;background-position:center;display:flex;align-items:center;justify-content:${justifyContent};text-align:${align}">
      <div style="position:absolute;inset:0;background:rgba(0,0,0,${overlayAlpha})"></div>
      <div style="position:relative;padding:32px;color:#fff">
        ${headline ? `<h2 style="margin:0 0 8px;font-size:28px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.5)">${headline}</h2>` : `<p style="margin:0;font-size:13px;opacity:.6">Add a headline via Properties</p>`}
        ${subheadline ? `<p style="margin:0 0 14px;font-size:17px;opacity:.85;text-shadow:0 1px 2px rgba(0,0,0,.4)">${subheadline}</p>` : ""}
        ${ctaText ? `<span style="display:inline-block;padding:9px 22px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);border-radius:6px;font-size:13px">${ctaText}</span>` : ""}
      </div>
    </div>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const HeroImage = Node.create({
  name: "heroImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: heroAttrs,

  parseHTML() { return [{ tag: 'div[data-block-type="heroImage"]' }]; },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "block-hero", "data-block-type": "heroImage" })];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "heroImage",
      label: "Hero Image",
      iconName: "Image",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-hero-editor";
        contentDom.innerHTML = buildEditorHtml(node.attrs as Record<string, string | number>);
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = buildEditorHtml(node.attrs as Record<string, string | number>);
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerHeroImage = Node.create({
  name: "heroImage",
  group: "block",
  atom: true,

  addAttributes: heroAttrs,

  parseHTML() { return [{ tag: 'div[data-block-type="heroImage"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const src = (HTMLAttributes["data-src"] ?? "") as string;
    const alt = (HTMLAttributes["data-alt"] ?? "") as string;
    const headline = (HTMLAttributes["data-headline"] ?? "") as string;
    const subheadline = (HTMLAttributes["data-subheadline"] ?? "") as string;
    const ctaText = (HTMLAttributes["data-cta-text"] ?? "") as string;
    const ctaUrl = (HTMLAttributes["data-cta-url"] ?? "") as string;
    const overlay = HTMLAttributes["data-overlay"] ?? 40;
    const height = (HTMLAttributes["data-height"] ?? "lg") as string;
    const align = (HTMLAttributes["data-align"] ?? "center") as string;

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-hero block-hero--${height} block-hero--${align}`,
        "data-block-type": "heroImage",
        style: `--hero-overlay:${(overlay as number) / 100}`,
      }),
      ...(src ? [["img", { src, alt, class: "block-hero-bg", loading: "lazy" }]] : []),
      [
        "div", { class: "block-hero-content" },
        ...(headline ? [["h2", { class: "block-hero-headline" }, headline]] : []),
        ...(subheadline ? [["p", { class: "block-hero-subheadline" }, subheadline]] : []),
        ...(ctaText && ctaUrl ? [["a", { href: ctaUrl, class: "block-hero-cta" }, ctaText]] : []),
      ],
    ];
  },
});
