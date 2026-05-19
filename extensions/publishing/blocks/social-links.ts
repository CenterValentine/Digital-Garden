/**
 * SocialLinks Block — W9 Publishing Block
 *
 * Atom block: a row of social media icon links.
 *
 * Attrs:
 * - links    JSON string: [{platform, url, label?}]
 * - variant  icon-only | icon-label | button | pill
 * - size     sm | md | lg
 * - align    left | center | right
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "@/lib/domain/blocks/data-attr";

export interface SocialLink {
  platform: string;
  url: string;
  label?: string;
}

function parseLinks(raw: string): SocialLink[] {
  try { return JSON.parse(raw) as SocialLink[]; } catch { return []; }
}

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "𝕏 Twitter",
  x: "𝕏",
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  threads: "Threads",
  rss: "RSS",
  email: "Email",
  website: "Website",
};

const PLATFORM_ICONS: Record<string, string> = {
  twitter: "𝕏", x: "𝕏", github: "GH", linkedin: "in",
  instagram: "IG", youtube: "YT", tiktok: "TT", bluesky: "BS",
  mastodon: "🐘", threads: "TH", rss: "RSS", email: "✉", website: "🌐",
};

function ensureAbsoluteUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:")) return url;
  return `https://${url}`;
}

function platformDisplay(platform: string, variant: string, label?: string): string {
  const icon = PLATFORM_ICONS[platform] ?? platform[0]?.toUpperCase() ?? "?";
  const text = label || PLATFORM_LABELS[platform] || platform;
  if (variant === "icon-only") return icon;
  if (variant === "icon-label" || variant === "button" || variant === "pill") return `${icon} ${text}`;
  return icon;
}

const VARIANTS = ["icon-only", "icon-label", "button", "pill"] as const;
const SIZES = ["sm", "md", "lg"] as const;
const ALIGNS = ["left", "center", "right"] as const;

const { schema: socialSchema, defaults: socialDefaults } = createBlockSchema(
  "socialLinks",
  {
    links: z
      .string()
      .default("[]")
      .describe('JSON array: [{"platform":"github","url":"https://github.com/user"},{"platform":"twitter","url":"..."}]')
      .meta({
        fieldType: "json-array",
        addLabel: "Add link",
        emptyMessage: "No social links yet — click Add link",
        jsonArraySchema: [
          { key: "platform", label: "Platform", type: "select", required: true, options: [
            { value: "github", label: "GitHub" },
            { value: "twitter", label: "X / Twitter" },
            { value: "linkedin", label: "LinkedIn" },
            { value: "instagram", label: "Instagram" },
            { value: "youtube", label: "YouTube" },
            { value: "bluesky", label: "Bluesky" },
            { value: "mastodon", label: "Mastodon" },
            { value: "threads", label: "Threads" },
            { value: "tiktok", label: "TikTok" },
            { value: "rss", label: "RSS Feed" },
            { value: "email", label: "Email" },
            { value: "website", label: "Website" },
          ]},
          { key: "url", label: "URL", type: "url", placeholder: "https://...", required: true },
          { key: "label", label: "Custom label", type: "text", placeholder: "Optional display text" },
        ],
      }),
    variant: z.enum(VARIANTS).default("icon-label"),
    size: z.enum(SIZES).default("md"),
    align: z.enum(ALIGNS).default("left"),
  }
);

registerBlock({
  type: "socialLinks",
  label: "Social Links",
  description: "Row of social media profile links",
  iconName: "Share2",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: socialSchema,
  defaultAttrs: socialDefaults(),
  slashCommand: "/social",
  searchTerms: ["social", "links", "twitter", "github", "linkedin", "follow"],
});

function socialAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "socialLinks" },
    links: dataAttr("links", { default: "[]" }),
    variant: dataAttr("variant", { default: "icon-label" }),
    size: dataAttr("size", { default: "md" }),
    align: dataAttr("align", { default: "left" }),
  };
}

function editorHtml(links: SocialLink[], variant: string, size: string, align: string): string {
  if (links.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Social Links</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add links via Properties (⋯)</p>
      </div>
    `;
  }
  const justifyMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
  const items = links.map((l) => {
    const display = platformDisplay(l.platform, variant, l.label);
    const href = ensureAbsoluteUrl(l.url);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="padding:6px 10px;background:#f3f4f6;border-radius:6px;font-size:13px;color:#374151;text-decoration:none">${display}</a>`;
  }).join("");
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:${justifyMap[align] ?? "flex-start"}">${items}</div>`;
}

export const SocialLinks = Node.create({
  name: "socialLinks",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: socialAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="socialLinks"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "block-social-links", "data-block-type": "socialLinks" })];
  },
  addNodeView() {
    return createBlockNodeView({
      blockType: "socialLinks", label: "Social Links", iconName: "Share2", atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-social-links-editor";
        contentDom.innerHTML = editorHtml(parseLinks(node.attrs.links as string), node.attrs.variant as string, node.attrs.size as string, node.attrs.align as string);
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(parseLinks(node.attrs.links as string), node.attrs.variant as string, node.attrs.size as string, node.attrs.align as string);
        return true;
      },
    });
  },
});

export const ServerSocialLinks = Node.create({
  name: "socialLinks",
  group: "block",
  atom: true,

  addAttributes: socialAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="socialLinks"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const links = parseLinks(HTMLAttributes["data-links"] ?? "[]");
    const variant = (HTMLAttributes["data-variant"] as string) || "icon-label";
    const size = (HTMLAttributes["data-size"] as string) || "md";
    const align = (HTMLAttributes["data-align"] as string) || "left";

    const linkEls = links.map((link) => [
      "a",
      {
        href: ensureAbsoluteUrl(link.url),
        class: `block-social-link block-social-link--${link.platform}`,
        target: "_blank",
        rel: "noopener noreferrer",
        title: link.label || PLATFORM_LABELS[link.platform] || link.platform,
      },
      platformDisplay(link.platform, variant, link.label),
    ]);

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-social-links block-social-links--${variant} block-social-links--${size} block-social-links--${align}`,
        "data-block-type": "socialLinks",
      }),
      ...(links.length > 0 ? linkEls : [["span", { class: "block-social-links-empty" }]]),
    ];
  },
});
