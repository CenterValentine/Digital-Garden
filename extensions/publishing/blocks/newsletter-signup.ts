/**
 * NewsletterSignup Block — W8 Publishing Block
 *
 * Atom block: an email capture form. On the public side the form
 * submits to a configurable POST endpoint. Renders as a static HTML
 * form — no client JS required for the form itself.
 *
 * Attrs:
 * - headline    Heading above the form
 * - subheadline Supporting copy
 * - placeholder Input placeholder text
 * - buttonLabel Submit button label
 * - endpoint    POST URL that receives { email } JSON body
 * - successText Text shown after successful submission (handled by JS)
 * - variant     default | inline | card | minimal | centered
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

// ─── Schema ──────────────────────────────────────────────────────────────────

const VARIANTS = ["default", "inline", "card", "minimal", "centered"] as const;

const { schema: newsletterSchema, defaults: newsletterDefaults } = createBlockSchema(
  "newsletterSignup",
  {
    headline: z.string().default("Stay in the loop").describe("Heading above the form"),
    subheadline: z.string().default("").describe("Supporting copy (leave blank to hide)"),
    placeholder: z.string().default("your@email.com").describe("Input placeholder"),
    buttonLabel: z.string().default("Subscribe").describe("Submit button label"),
    endpoint: z.string().default("").describe("POST URL for the subscription (receives { email } JSON)"),
    successText: z.string().default("Thanks! You're on the list.").describe("Text shown after successful signup"),
    variant: z.enum(VARIANTS).default("default"),
    ...BACKGROUND_SCHEMA_SHAPE,
  }
);

registerBlock({
  type: "newsletterSignup",
  label: "Newsletter Signup",
  description: "Email capture form with configurable POST endpoint",
  iconName: "Mail",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: newsletterSchema,
  defaultAttrs: newsletterDefaults(),
  slashCommand: "/newsletter",
  searchTerms: ["newsletter", "email", "signup", "subscribe", "form", "capture"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function newsletterAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "newsletterSignup" },
    headline: {
      default: "Stay in the loop",
      parseHTML: (el: Element) => el.getAttribute("data-headline") ?? "Stay in the loop",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-headline": attrs.headline }),
    },
    subheadline: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-subheadline") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-subheadline": attrs.subheadline }),
    },
    placeholder: {
      default: "your@email.com",
      parseHTML: (el: Element) => el.getAttribute("data-placeholder") ?? "your@email.com",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-placeholder": attrs.placeholder }),
    },
    buttonLabel: {
      default: "Subscribe",
      parseHTML: (el: Element) => el.getAttribute("data-button-label") ?? "Subscribe",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-button-label": attrs.buttonLabel }),
    },
    endpoint: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-endpoint") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-endpoint": attrs.endpoint }),
    },
    successText: {
      default: "Thanks! You're on the list.",
      parseHTML: (el: Element) => el.getAttribute("data-success-text") ?? "Thanks! You're on the list.",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-success-text": attrs.successText }),
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
  placeholder: string,
  buttonLabel: string,
  endpoint: string,
  variant: string,
): string {
  return `
    <div style="padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#166534">${headline}</p>
      ${subheadline ? `<p style="margin:0 0 12px;font-size:12px;color:#4ade80">${subheadline}</p>` : ""}
      <div style="display:flex;gap:8px;margin-bottom:4px">
        <input disabled placeholder="${placeholder}" style="flex:1;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff" />
        <span style="padding:7px 14px;background:#16a34a;color:#fff;border-radius:6px;font-size:13px;font-weight:500">${buttonLabel}</span>
      </div>
      ${endpoint ? `<p style="margin:0;font-size:11px;color:#4ade80">→ ${endpoint}</p>` : `<p style="margin:0;font-size:11px;color:#9ca3af">No endpoint configured</p>`}
      <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">${variant}</p>
    </div>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const NewsletterSignup = Node.create({
  name: "newsletterSignup",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: newsletterAttrs,

  parseHTML() {
    return [{ tag: 'section[data-block-type="newsletterSignup"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        class: "block-newsletter",
        "data-block-type": "newsletterSignup",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "newsletterSignup",
      label: "Newsletter Signup",
      iconName: "Mail",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-newsletter-editor";
        contentDom.innerHTML = editorHtml(
          node.attrs.headline as string,
          node.attrs.subheadline as string,
          node.attrs.placeholder as string,
          node.attrs.buttonLabel as string,
          node.attrs.endpoint as string,
          node.attrs.variant as string,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          node.attrs.headline as string,
          node.attrs.subheadline as string,
          node.attrs.placeholder as string,
          node.attrs.buttonLabel as string,
          node.attrs.endpoint as string,
          node.attrs.variant as string,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerNewsletterSignup = Node.create({
  name: "newsletterSignup",
  group: "block",
  atom: true,

  addAttributes: newsletterAttrs,

  parseHTML() {
    return [{ tag: 'section[data-block-type="newsletterSignup"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const headline = (HTMLAttributes["data-headline"] as string) || "Stay in the loop";
    const subheadline = (HTMLAttributes["data-subheadline"] as string) || "";
    const placeholder = (HTMLAttributes["data-placeholder"] as string) || "your@email.com";
    const buttonLabel = (HTMLAttributes["data-button-label"] as string) || "Subscribe";
    const endpoint = (HTMLAttributes["data-endpoint"] as string) || "";
    const successText = (HTMLAttributes["data-success-text"] as string) || "Thanks! You're on the list.";
    const variant = (HTMLAttributes["data-variant"] as string) || "default";
    const bgColor = (HTMLAttributes["data-bg-color"] as string) || "";
    const bgGradient = (HTMLAttributes["data-bg-gradient"] as string) || "";
    const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";

    // The form uses a data-endpoint + data-success-text so a small inline
    // script (loaded separately in the public layout) can progressively
    // enhance it with fetch + success state.
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        class: `block-newsletter block-newsletter--${variant}`,
        "data-block-type": "newsletterSignup",
        ...(bgStyle ? { style: bgStyle } : {}),
      }),
      [
        "div",
        { class: "block-newsletter-inner" },
        ["h2", { class: "block-newsletter-headline" }, headline],
        ...(subheadline ? [["p", { class: "block-newsletter-sub" }, subheadline]] : []),
        [
          "form",
          {
            class: "block-newsletter-form",
            method: "POST",
            ...(endpoint ? { action: endpoint } : {}),
            "data-success": successText,
          },
          [
            "input",
            {
              type: "email",
              name: "email",
              class: "block-newsletter-input",
              placeholder,
              required: "",
            },
          ],
          ["button", { type: "submit", class: "block-newsletter-btn" }, buttonLabel],
        ],
      ],
    ];
  },
});
