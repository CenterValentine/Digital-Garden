/**
 * TestimonialCard Block — W5 Publishing Block
 *
 * Atom block: a quote from a person with optional avatar, name, title,
 * company, and star rating.
 *
 * Attrs:
 * - quote      The testimonial text
 * - name       Person's name
 * - title      Person's job title
 * - company    Company name
 * - avatarUrl  Avatar image URL
 * - rating     1–5 stars (0 = hidden)
 * - variant    default | card | minimal | bubble | horizontal
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

// ─── Schema ──────────────────────────────────────────────────────────────────

const VARIANTS = ["default", "card", "minimal", "bubble", "horizontal"] as const;

const { schema: testimonialSchema, defaults: testimonialDefaults } = createBlockSchema(
  "testimonialCard",
  {
    quote: z.string().default("").describe("The testimonial text"),
    name: z.string().default("").describe("Person's full name"),
    title: z.string().default("").describe("Job title or role"),
    company: z.string().default("").describe("Company or organisation"),
    avatarUrl: z.string().default("").describe("Avatar image URL").meta({ uploadType: "image" }),
    rating: z.number().int().min(0).max(5).default(0).describe("Star rating (0 = hidden)"),
    variant: z.enum(VARIANTS).default("default"),
    bgColor: z.string().default("").describe("Custom background color (any CSS color value)"),
    bgGradient: z.string().default("").describe('CSS gradient — e.g. linear-gradient(135deg, #667eea 0%, #764ba2 100%)'),
  }
);

registerBlock({
  type: "testimonialCard",
  label: "Testimonial",
  description: "A quote from a person with attribution and optional star rating",
  iconName: "Quote",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: testimonialSchema,
  defaultAttrs: testimonialDefaults(),
  slashCommand: "/testimonial",
  searchTerms: ["testimonial", "quote", "review", "feedback", "person", "star"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function testimonialAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "testimonialCard" },
    quote: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-quote") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-quote": attrs.quote }),
    },
    name: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-name") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-name": attrs.name }),
    },
    title: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-title") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-title": attrs.title }),
    },
    company: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-company") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-company": attrs.company }),
    },
    avatarUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-avatar-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-avatar-url": attrs.avatarUrl }),
    },
    rating: {
      default: 0,
      parseHTML: (el: Element) => parseInt(el.getAttribute("data-rating") ?? "0", 10),
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-rating": attrs.rating }),
    },
    variant: {
      default: "default",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "default",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    bgColor: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-bg-color") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.bgColor ? { "data-bg-color": attrs.bgColor } : {},
    },
    bgGradient: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-bg-gradient") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.bgGradient ? { "data-bg-gradient": attrs.bgGradient } : {},
    },
  };
}

function stars(count: number): string {
  if (!count) return "";
  return Array.from({ length: 5 }, (_, i) => (i < count ? "★" : "☆")).join("");
}

function editorHtml(
  quote: string,
  name: string,
  title: string,
  company: string,
  avatarUrl: string,
  rating: number,
  variant: string,
): string {
  if (!quote && !name) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Testimonial</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add a quote via Properties (⋯)</p>
      </div>
    `;
  }
  const attribution = [name, title, company].filter(Boolean).join(" · ");
  return `
    <div style="padding:16px;border-left:3px solid #6366f1;background:#f9fafb;border-radius:4px">
      ${rating ? `<p style="margin:0 0 8px;color:#f59e0b;font-size:15px">${stars(rating)}</p>` : ""}
      ${quote ? `<p style="margin:0 0 10px;font-size:13px;font-style:italic;color:#374151">"${quote}"</p>` : ""}
      <div style="display:flex;align-items:center;gap:8px">
        ${avatarUrl ? `<img src="${avatarUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" alt="" />` : ""}
        ${attribution ? `<p style="margin:0;font-size:12px;color:#6b7280">${attribution}</p>` : ""}
      </div>
      <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">${variant} variant</p>
    </div>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const TestimonialCard = Node.create({
  name: "testimonialCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: testimonialAttrs,

  parseHTML() {
    return [{ tag: 'figure[data-block-type="testimonialCard"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        class: "block-testimonial",
        "data-block-type": "testimonialCard",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "testimonialCard",
      label: "Testimonial",
      iconName: "Quote",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-testimonial-editor";
        contentDom.innerHTML = editorHtml(
          node.attrs.quote as string,
          node.attrs.name as string,
          node.attrs.title as string,
          node.attrs.company as string,
          node.attrs.avatarUrl as string,
          node.attrs.rating as number,
          node.attrs.variant as string,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          node.attrs.quote as string,
          node.attrs.name as string,
          node.attrs.title as string,
          node.attrs.company as string,
          node.attrs.avatarUrl as string,
          node.attrs.rating as number,
          node.attrs.variant as string,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerTestimonialCard = Node.create({
  name: "testimonialCard",
  group: "block",
  atom: true,

  addAttributes: testimonialAttrs,

  parseHTML() {
    return [{ tag: 'figure[data-block-type="testimonialCard"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const quote = (HTMLAttributes["data-quote"] as string) || "";
    const name = (HTMLAttributes["data-name"] as string) || "";
    const title = (HTMLAttributes["data-title"] as string) || "";
    const company = (HTMLAttributes["data-company"] as string) || "";
    const avatarUrl = (HTMLAttributes["data-avatar-url"] as string) || "";
    const rating = parseInt(String(HTMLAttributes["data-rating"] ?? "0"), 10);
    const variant = (HTMLAttributes["data-variant"] as string) || "default";
    const bgColor = (HTMLAttributes["data-bg-color"] as string) || "";
    const bgGradient = (HTMLAttributes["data-bg-gradient"] as string) || "";
    const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";

    const attribution = [name, title, company].filter(Boolean);
    const starStr = stars(rating);

    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        class: `block-testimonial block-testimonial--${variant}`,
        "data-block-type": "testimonialCard",
        ...(bgStyle ? { style: bgStyle } : {}),
      }),
      ...(starStr ? [["p", { class: "block-testimonial-rating" }, starStr]] : []),
      ["blockquote", { class: "block-testimonial-quote" }, `"${quote}"`],
      [
        "figcaption",
        { class: "block-testimonial-attribution" },
        ...(avatarUrl
          ? [["img", { src: avatarUrl, class: "block-testimonial-avatar", alt: name, loading: "lazy" }]]
          : []),
        [
          "div",
          { class: "block-testimonial-meta" },
          ...(name ? [["strong", { class: "block-testimonial-name" }, name]] : []),
          ...(title || company
            ? [["span", { class: "block-testimonial-role" }, [title, company].filter(Boolean).join(" · ")]]
            : []),
        ],
      ],
    ];
  },
});
