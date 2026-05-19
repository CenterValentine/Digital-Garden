/**
 * PricingCard Block — W9 Publishing Block
 *
 * Atom block: a single pricing tier card with name, price, period,
 * description, feature list, and CTA button.
 *
 * Attrs:
 * - tierName     Tier name (e.g. "Pro")
 * - price        Price string (e.g. "$49" or "Free")
 * - period       Billing period (e.g. "/month" or "one-time")
 * - description  Short description of the tier
 * - features     JSON string: string[] of feature lines
 * - ctaLabel     Button label
 * - ctaUrl       Button URL
 * - highlighted  Visually emphasise as the recommended tier
 * - variant      default | compact | minimal | card
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import {
  BACKGROUND_SCHEMA_SHAPE,
  backgroundAttrs,
} from "../lib/background-attrs";

function parseFeatures(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

const VARIANTS = ["default", "compact", "minimal", "card"] as const;

const { schema: pricingSchema, defaults: pricingDefaults } = createBlockSchema(
  "pricingCard",
  {
    tierName: z.string().default("Pro").describe("Tier name"),
    price: z.string().default("$49").describe('Price string (e.g. "$49" or "Free")'),
    period: z.string().default("").describe('Billing period (e.g. "/month", "one-time") — leave blank to hide'),
    description: z.string().default("").describe("Short description of the tier"),
    features: z
      .string()
      .default("[]")
      .describe('JSON array of feature lines: ["Unlimited projects","Priority support"]')
      .meta({
        fieldType: "string-array",
        addLabel: "Add feature",
        placeholder: "e.g. Unlimited projects",
        emptyMessage: "No features yet — click Add feature",
      }),
    ctaLabel: z.string().default("Get started").describe("Button label"),
    ctaUrl: z.string().default("").describe("Button URL"),
    highlighted: z.boolean().default(false).describe("Visually highlight as the recommended tier"),
    variant: z.enum(VARIANTS).default("default"),
    ...BACKGROUND_SCHEMA_SHAPE,
  }
);

registerBlock({
  type: "pricingCard",
  label: "Pricing Card",
  description: "Single pricing tier with features and CTA button",
  iconName: "CreditCard",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: pricingSchema,
  defaultAttrs: pricingDefaults(),
  slashCommand: "/pricing",
  searchTerms: ["pricing", "plan", "tier", "price", "subscription", "cost"],
});

function pricingAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "pricingCard" },
    tierName: {
      default: "Pro",
      parseHTML: (el: Element) => el.getAttribute("data-tier-name") ?? "Pro",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-tier-name": attrs.tierName }),
    },
    price: {
      default: "$49",
      parseHTML: (el: Element) => el.getAttribute("data-price") ?? "$49",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-price": attrs.price }),
    },
    period: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-period") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-period": attrs.period }),
    },
    description: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-description") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-description": attrs.description }),
    },
    features: {
      default: "[]",
      parseHTML: (el: Element) => el.getAttribute("data-features") ?? "[]",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-features": attrs.features }),
    },
    ctaLabel: {
      default: "Get started",
      parseHTML: (el: Element) => el.getAttribute("data-cta-label") ?? "Get started",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-cta-label": attrs.ctaLabel }),
    },
    ctaUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-cta-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-cta-url": attrs.ctaUrl }),
    },
    highlighted: {
      default: false,
      parseHTML: (el: Element) => el.getAttribute("data-highlighted") === "true",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-highlighted": attrs.highlighted }),
    },
    variant: {
      default: "default",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "default",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    ...backgroundAttrs(),
  };
}

function editorHtml(tierName: string, price: string, period: string, description: string, features: string[], ctaLabel: string, highlighted: boolean): string {
  const bg = highlighted ? "#ede9fe" : "#f9fafb";
  const border = highlighted ? "2px solid #6366f1" : "1px solid #e5e7eb";
  const featureRows = features.map((f) => `<li style="font-size:12px;color:#374151;padding:2px 0">✓ ${f}</li>`).join("");
  return `
    <div style="padding:20px;background:${bg};border:${border};border-radius:10px">
      ${highlighted ? `<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6366f1;letter-spacing:.08em">Recommended</span>` : ""}
      <p style="margin:4px 0 2px;font-size:14px;font-weight:700;color:#111827">${tierName}</p>
      <p style="margin:0 0 8px"><span style="font-size:24px;font-weight:800;color:#111827">${price}</span><span style="font-size:13px;color:#6b7280">${period}</span></p>
      ${description ? `<p style="margin:0 0 10px;font-size:12px;color:#6b7280">${description}</p>` : ""}
      ${features.length ? `<ul style="list-style:none;padding:0;margin:0 0 12px">${featureRows}</ul>` : ""}
      ${ctaLabel ? `<span style="display:block;text-align:center;padding:8px;background:#4f46e5;color:#fff;border-radius:6px;font-size:13px;font-weight:600">${ctaLabel}</span>` : ""}
    </div>
  `;
}

export const PricingCard = Node.create({
  name: "pricingCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: pricingAttrs,
  parseHTML() { return [{ tag: 'article[data-block-type="pricingCard"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["article", mergeAttributes(HTMLAttributes, { class: "block-pricing", "data-block-type": "pricingCard" })];
  },
  addNodeView() {
    return createBlockNodeView({
      blockType: "pricingCard", label: "Pricing Card", iconName: "CreditCard", atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-pricing-editor";
        contentDom.innerHTML = editorHtml(
          node.attrs.tierName as string, node.attrs.price as string, node.attrs.period as string,
          node.attrs.description as string, parseFeatures(node.attrs.features as string),
          node.attrs.ctaLabel as string, node.attrs.highlighted as boolean,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          node.attrs.tierName as string, node.attrs.price as string, node.attrs.period as string,
          node.attrs.description as string, parseFeatures(node.attrs.features as string),
          node.attrs.ctaLabel as string, node.attrs.highlighted as boolean,
        );
        return true;
      },
    });
  },
});

export const ServerPricingCard = Node.create({
  name: "pricingCard",
  group: "block",
  atom: true,

  addAttributes: pricingAttrs,
  parseHTML() { return [{ tag: 'article[data-block-type="pricingCard"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const tierName = (HTMLAttributes["data-tier-name"] as string) || "Pro";
    const price = (HTMLAttributes["data-price"] as string) || "$49";
    const period = (HTMLAttributes["data-period"] as string) || "";
    const description = (HTMLAttributes["data-description"] as string) || "";
    const features = parseFeatures(HTMLAttributes["data-features"] ?? "[]");
    const ctaLabel = (HTMLAttributes["data-cta-label"] as string) || "Get started";
    const ctaUrl = (HTMLAttributes["data-cta-url"] as string) || "";
    const highlighted = HTMLAttributes["data-highlighted"] === true || HTMLAttributes["data-highlighted"] === "true";
    const variant = (HTMLAttributes["data-variant"] as string) || "default";
    const bgColor = (HTMLAttributes["data-bg-color"] as string) || "";
    const bgGradient = (HTMLAttributes["data-bg-gradient"] as string) || "";
    const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";

    const featureEls = features.map((f) => ["li", { class: "block-pricing-feature" }, f]);

    const ctaEl = ctaUrl
      ? ["a", { href: ctaUrl, class: "block-pricing-cta" }, ctaLabel]
      : ["span", { class: "block-pricing-cta" }, ctaLabel];

    return [
      "article",
      mergeAttributes(HTMLAttributes, {
        class: `block-pricing block-pricing--${variant}${highlighted ? " block-pricing--highlighted" : ""}`,
        "data-block-type": "pricingCard",
        ...(bgStyle ? { style: bgStyle } : {}),
      }),
      ...(highlighted ? [["span", { class: "block-pricing-badge" }, "Recommended"]] : []),
      ["div", { class: "block-pricing-header" },
        ["h3", { class: "block-pricing-tier" }, tierName],
        ["div", { class: "block-pricing-price" },
          ["span", { class: "block-pricing-amount" }, price],
          ...(period ? [["span", { class: "block-pricing-period" }, period]] : []),
        ],
        ...(description ? [["p", { class: "block-pricing-desc" }, description]] : []),
      ],
      ...(features.length ? [["ul", { class: "block-pricing-features" }, ...featureEls]] : []),
      ...(ctaLabel ? [["div", { class: "block-pricing-cta-wrap" }, ctaEl]] : []),
    ];
  },
});
