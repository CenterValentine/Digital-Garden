/**
 * CtaBanner Block — W5 Publishing Block
 *
 * Atom block: a full-width call-to-action section with headline,
 * subheadline, and up to two buttons.
 *
 * Attrs:
 * - headline      Primary heading text
 * - subheadline   Supporting copy
 * - primaryLabel  Primary button label
 * - primaryUrl    Primary button URL
 * - secondaryLabel Secondary button label (optional)
 * - secondaryUrl  Secondary button URL (optional)
 * - align         left | center | right
 * - variant       default | dark | brand | outline | minimal
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import {
  BACKGROUND_SCHEMA_SHAPE,
  backgroundAttrs,
} from "../lib/background-attrs";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

// ─── Schema ──────────────────────────────────────────────────────────────────

const VARIANTS = ["default", "dark", "brand", "outline", "minimal"] as const;
const ALIGNS = ["left", "center", "right"] as const;

const { schema: ctaSchema, defaults: ctaDefaults } = createBlockSchema(
  "ctaBanner",
  {
    headline: z.string().default("").describe("Primary heading text"),
    subheadline: z.string().default("").describe("Supporting copy below the heading"),
    primaryLabel: z.string().default("Get started").describe("Primary button label"),
    primaryUrl: z.string().default("").describe("Primary button URL"),
    secondaryLabel: z.string().default("").describe("Secondary button label (leave blank to hide)"),
    secondaryUrl: z.string().default("").describe("Secondary button URL"),
    align: z.enum(ALIGNS).default("center"),
    variant: z.enum(VARIANTS).default("default"),
    ...BACKGROUND_SCHEMA_SHAPE,
  }
);

registerBlock({
  type: "ctaBanner",
  label: "CTA Banner",
  description: "Full-width call-to-action section with headline and buttons",
  iconName: "Megaphone",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: ctaSchema,
  defaultAttrs: ctaDefaults(),
  slashCommand: "/cta",
  searchTerms: ["cta", "call to action", "banner", "button", "conversion", "signup"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function ctaAttrs() {
  return {
    blockId: blockIdAttr,
    blockType: { default: "ctaBanner" },
    headline: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-headline") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-headline": attrs.headline }),
    },
    subheadline: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-subheadline") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-subheadline": attrs.subheadline }),
    },
    primaryLabel: {
      default: "Get started",
      parseHTML: (el: Element) => el.getAttribute("data-primary-label") ?? "Get started",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-primary-label": attrs.primaryLabel }),
    },
    primaryUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-primary-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-primary-url": attrs.primaryUrl }),
    },
    secondaryLabel: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-secondary-label") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-secondary-label": attrs.secondaryLabel }),
    },
    secondaryUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-secondary-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-secondary-url": attrs.secondaryUrl }),
    },
    align: {
      default: "center",
      parseHTML: (el: Element) => el.getAttribute("data-align") ?? "center",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-align": attrs.align }),
    },
    variant: {
      default: "default",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "default",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    ...backgroundAttrs(),
  };
}

function editorHtml(
  headline: string,
  subheadline: string,
  primaryLabel: string,
  primaryUrl: string,
  secondaryLabel: string,
  variant: string,
  align: string,
): string {
  if (!headline && !subheadline) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">CTA Banner</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add headline + button via Properties (⋯)</p>
      </div>
    `;
  }
  const textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
  const bg = variant === "dark" ? "#111827" : variant === "brand" ? "#4f46e5" : "#f3f4f6";
  const textColor = variant === "dark" || variant === "brand" ? "#fff" : "#111827";
  const subColor = variant === "dark" || variant === "brand" ? "rgba(255,255,255,0.7)" : "#6b7280";
  return `
    <div style="padding:24px;background:${bg};border-radius:8px;text-align:${textAlign}">
      ${headline ? `<p style="margin:0 0 6px;font-size:18px;font-weight:700;color:${textColor}">${headline}</p>` : ""}
      ${subheadline ? `<p style="margin:0 0 16px;font-size:13px;color:${subColor}">${subheadline}</p>` : ""}
      <div style="display:flex;gap:8px;justify-content:${textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start"}">
        ${primaryLabel ? `<span style="padding:7px 16px;background:#4f46e5;color:#fff;border-radius:6px;font-size:13px;font-weight:500">${primaryLabel}${primaryUrl ? " →" : ""}</span>` : ""}
        ${secondaryLabel ? `<span style="padding:7px 16px;border:1px solid currentColor;border-radius:6px;font-size:13px;color:${textColor}">${secondaryLabel}</span>` : ""}
      </div>
      <p style="margin:8px 0 0;font-size:11px;color:#9ca3af">${variant} · ${align}</p>
    </div>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const CtaBanner = Node.create({
  name: "ctaBanner",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: ctaAttrs,

  parseHTML() {
    return [{ tag: 'section[data-block-type="ctaBanner"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        class: "block-cta",
        "data-block-type": "ctaBanner",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "ctaBanner",
      label: "CTA Banner",
      iconName: "Megaphone",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-cta-editor";
        contentDom.innerHTML = editorHtml(
          node.attrs.headline as string,
          node.attrs.subheadline as string,
          node.attrs.primaryLabel as string,
          node.attrs.primaryUrl as string,
          node.attrs.secondaryLabel as string,
          node.attrs.variant as string,
          node.attrs.align as string,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          node.attrs.headline as string,
          node.attrs.subheadline as string,
          node.attrs.primaryLabel as string,
          node.attrs.primaryUrl as string,
          node.attrs.secondaryLabel as string,
          node.attrs.variant as string,
          node.attrs.align as string,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerCtaBanner = Node.create({
  name: "ctaBanner",
  group: "block",
  atom: true,

  addAttributes: ctaAttrs,

  parseHTML() {
    return [{ tag: 'section[data-block-type="ctaBanner"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const headline = (HTMLAttributes["data-headline"] as string) || "";
    const subheadline = (HTMLAttributes["data-subheadline"] as string) || "";
    const primaryLabel = (HTMLAttributes["data-primary-label"] as string) || "Get started";
    const primaryUrl = (HTMLAttributes["data-primary-url"] as string) || "";
    const secondaryLabel = (HTMLAttributes["data-secondary-label"] as string) || "";
    const secondaryUrl = (HTMLAttributes["data-secondary-url"] as string) || "";
    const align = (HTMLAttributes["data-align"] as string) || "center";
    const variant = (HTMLAttributes["data-variant"] as string) || "default";
    const bgColor = (HTMLAttributes["data-bg-color"] as string) || "";
    const bgGradient = (HTMLAttributes["data-bg-gradient"] as string) || "";
    const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";

    const buttons: unknown[] = [];
    if (primaryLabel) {
      buttons.push(
        primaryUrl
          ? ["a", { href: primaryUrl, class: "block-cta-btn block-cta-btn--primary" }, primaryLabel]
          : ["span", { class: "block-cta-btn block-cta-btn--primary" }, primaryLabel]
      );
    }
    if (secondaryLabel) {
      buttons.push(
        secondaryUrl
          ? ["a", { href: secondaryUrl, class: "block-cta-btn block-cta-btn--secondary" }, secondaryLabel]
          : ["span", { class: "block-cta-btn block-cta-btn--secondary" }, secondaryLabel]
      );
    }

    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        class: `block-cta block-cta--${variant} block-cta--${align}`,
        "data-block-type": "ctaBanner",
        ...(bgStyle ? { style: bgStyle } : {}),
      }),
      [
        "div",
        { class: "block-cta-inner" },
        ...(headline ? [["h2", { class: "block-cta-headline" }, headline]] : []),
        ...(subheadline ? [["p", { class: "block-cta-sub" }, subheadline]] : []),
        ...(buttons.length ? [["div", { class: "block-cta-actions" }, ...buttons]] : []),
      ],
    ];
  },
});
