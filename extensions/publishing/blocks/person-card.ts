/**
 * PersonCard Block — W8 Publishing Block
 *
 * Atom block: a profile card for a person — photo, name, title, bio,
 * and optional social links. Useful for team/about pages and People
 * extension integration.
 *
 * Attrs:
 * - name        Full name
 * - title       Job title or role
 * - bio         Short biography or description
 * - photoUrl    Profile photo URL
 * - links       JSON string: [{platform, url}] — twitter|github|linkedin|website|email
 * - variant     default | horizontal | compact | featured
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
import { makeWrapAttrs } from "@/lib/domain/blocks/wrap-size";
import { makeEditableField, syncEditableField } from "@/lib/domain/blocks/inline-edit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersonLink {
  platform: "twitter" | "github" | "linkedin" | "website" | "email" | string;
  url: string;
}

function parseLinks(raw: string): PersonLink[] {
  try { return JSON.parse(raw) as PersonLink[]; } catch { return []; }
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    twitter: "𝕏",
    github: "GH",
    linkedin: "in",
    website: "🌐",
    email: "✉",
  };
  return labels[platform] ?? platform;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const VARIANTS = ["default", "horizontal", "compact", "featured"] as const;

const { schema: personSchema, defaults: personDefaults } = createBlockSchema(
  "personCard",
  {
    name: z.string().default("").describe("Full name"),
    title: z.string().default("").describe("Job title or role"),
    bio: z.string().default("").describe("Short biography or description"),
    photoUrl: z.string().default("").describe("Profile photo URL").meta({ uploadType: "image" }),
    links: z
      .string()
      .default("[]")
      .describe('JSON array of social links. Each item: {"platform":"github","url":"https://..."}')
      .meta({
        fieldType: "json-array",
        addLabel: "Add link",
        emptyMessage: "No links yet — click Add link",
        jsonArraySchema: [
          { key: "platform", label: "Platform", type: "select", required: true, options: [
            { value: "github", label: "GitHub" },
            { value: "twitter", label: "X / Twitter" },
            { value: "linkedin", label: "LinkedIn" },
            { value: "website", label: "Website" },
            { value: "email", label: "Email" },
          ]},
          { key: "url", label: "URL", type: "url", placeholder: "https://...", required: true },
        ],
      }),
    variant: z.enum(VARIANTS).default("default"),
    ...BACKGROUND_SCHEMA_SHAPE,
  }
);

registerBlock({
  type: "personCard",
  label: "Person Card",
  description: "Profile card with photo, name, bio, and social links",
  iconName: "User",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: personSchema,
  defaultAttrs: personDefaults(),
  slashCommand: "/person",
  searchTerms: ["person", "profile", "team", "author", "bio", "card", "about"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function personAttrs() {
  return {
    blockId: blockIdAttr,
    blockType: { default: "personCard" },
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
    bio: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-bio") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-bio": attrs.bio }),
    },
    photoUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-photo-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-photo-url": attrs.photoUrl }),
    },
    links: {
      default: "[]",
      parseHTML: (el: Element) => el.getAttribute("data-links") ?? "[]",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-links": attrs.links }),
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

// ─── Editor DOM refs (WeakMap keyed on contentDom) ────────────────────────────

interface PersonEditorRefs {
  nameEl: HTMLElement;
  titleEl: HTMLElement;
  bioEl: HTMLElement;
  photoWrap: HTMLElement;
  linksEl: HTMLElement;
}
const personRefs = new WeakMap<HTMLElement, PersonEditorRefs>();

function buildPersonDom(
  contentDom: HTMLElement,
  name: string,
  title: string,
  bio: string,
  photoUrl: string,
  links: PersonLink[],
  variant: string,
): PersonEditorRefs {
  contentDom.className = `block-person block-person--${variant} block-person-editor`;
  contentDom.innerHTML = "";

  // Photo
  const photoWrap = document.createElement("div");
  photoWrap.className = "block-person-photo-wrap";
  renderPhoto(photoWrap, photoUrl, name);

  // Body
  const body = document.createElement("div");
  body.className = "block-person-body";

  const nameEl = makeEditableField("h3", "block-person-name", name, "name", "Name");
  const titleEl = makeEditableField("p", "block-person-title", title, "title", "Job title");
  const bioEl = makeEditableField("p", "block-person-bio", bio, "bio", "Short bio…");

  body.appendChild(nameEl);
  body.appendChild(titleEl);
  body.appendChild(bioEl);

  const linksEl = document.createElement("div");
  linksEl.className = "block-person-links";
  renderLinks(linksEl, links);
  body.appendChild(linksEl);

  contentDom.appendChild(photoWrap);
  contentDom.appendChild(body);

  return { nameEl, titleEl, bioEl, photoWrap, linksEl };
}

function renderPhoto(photoWrap: HTMLElement, photoUrl: string, name: string) {
  photoWrap.innerHTML = "";
  if (photoUrl) {
    const img = document.createElement("img");
    img.src = photoUrl;
    img.className = "block-person-photo";
    img.alt = name || "";
    photoWrap.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "block-person-avatar-placeholder";
    placeholder.textContent = "👤";
    photoWrap.appendChild(placeholder);
  }
}

function renderLinks(linksEl: HTMLElement, links: PersonLink[]) {
  linksEl.innerHTML = "";
  links.forEach((l) => {
    const chip = document.createElement("span");
    chip.className = `block-person-link block-person-link--${l.platform}`;
    chip.textContent = platformLabel(l.platform);
    linksEl.appendChild(chip);
  });
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const PersonCard = Node.create({
  name: "personCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: personAttrs,

  parseHTML() {
    return [{ tag: 'article[data-block-type="personCard"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "article",
      mergeAttributes(HTMLAttributes, {
        class: "block-person",
        "data-block-type": "personCard",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "personCard",
      label: "Person Card",
      iconName: "User",
      atom: true,
      supportWrap: true,
      renderContent(node, contentDom) {
        const a = node.attrs as Record<string, string>;
        const refs = buildPersonDom(
          contentDom, a.name, a.title, a.bio,
          a.photoUrl, parseLinks(a.links), a.variant,
        );
        personRefs.set(contentDom, refs);
      },
      updateContent(node, contentDom) {
        const refs = personRefs.get(contentDom);
        if (!refs) return false;
        const a = node.attrs as Record<string, string>;
        const variant = a.variant || "default";

        contentDom.className = `block-person block-person--${variant} block-person-editor`;
        syncEditableField(refs.nameEl, a.name);
        syncEditableField(refs.titleEl, a.title);
        syncEditableField(refs.bioEl, a.bio);
        renderPhoto(refs.photoWrap, a.photoUrl, a.name);
        renderLinks(refs.linksEl, parseLinks(a.links));
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerPersonCard = Node.create({
  name: "personCard",
  group: "block",
  atom: true,

  addAttributes: personAttrs,

  parseHTML() {
    return [{ tag: 'article[data-block-type="personCard"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const name = (HTMLAttributes["data-name"] as string) || "";
    const title = (HTMLAttributes["data-title"] as string) || "";
    const bio = (HTMLAttributes["data-bio"] as string) || "";
    const photoUrl = (HTMLAttributes["data-photo-url"] as string) || "";
    const links = parseLinks(HTMLAttributes["data-links"] ?? "[]");
    const variant = (HTMLAttributes["data-variant"] as string) || "default";
    const bgColor = (HTMLAttributes["data-bg-color"] as string) || "";
    const bgGradient = (HTMLAttributes["data-bg-gradient"] as string) || "";
    const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";

    const photoEl = photoUrl
      ? ["img", { src: photoUrl, class: "block-person-photo", alt: name, loading: "lazy" }]
      : ["div", { class: "block-person-avatar-placeholder", "aria-hidden": "true" }, "👤"];

    const linkEls = links.map((link) =>
      ["a", { href: link.url, class: `block-person-link block-person-link--${link.platform}`, rel: "noopener noreferrer" }, platformLabel(link.platform)]
    );

    return [
      "article",
      mergeAttributes(HTMLAttributes, {
        class: `block-person block-person--${variant}`,
        "data-block-type": "personCard",
        ...(bgStyle ? { style: bgStyle } : {}),
      }),
      ["div", { class: "block-person-photo-wrap" }, photoEl],
      [
        "div",
        { class: "block-person-body" },
        ["h3", { class: "block-person-name" }, name],
        ...(title ? [["p", { class: "block-person-title" }, title]] : []),
        ...(bio ? [["p", { class: "block-person-bio" }, bio]] : []),
        ...(linkEls.length ? [["div", { class: "block-person-links" }, ...linkEls]] : []),
      ],
    ];
  },
});
