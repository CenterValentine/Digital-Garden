/**
 * ProjectCard Block — W3 Publishing Block
 *
 * Atom block: a project showcase card with cover, title, description,
 * tech stack chips, and optional links.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { makeWrapAttrs } from "@/lib/domain/blocks/wrap-size";
import { makeEditableField, syncEditableField } from "@/lib/domain/blocks/inline-edit";

function parseTech(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

const { schema: projectCardSchema, defaults: projectCardDefaults } = createBlockSchema("projectCard", {
  title: z.string().default("").describe("Project name"),
  description: z.string().default("").describe("Short project description"),
  tech: z
    .string()
    .default("[]")
    .describe('Tech stack — JSON array of strings, e.g. ["React","TypeScript","Postgres"]')
    .meta({ tooltip: "Enter a JSON array of technology names. These appear as small chips on the card." }),
  coverUrl: z.string().default("").describe("Cover image URL").meta({ uploadType: "image" }),
  liveUrl: z.string().default("").describe("Live demo link"),
  repoUrl: z.string().default("").describe("Source repository link"),
  status: z.enum(["active", "wip", "archived"]).default("active").describe("Project status"),
  variant: z.enum(["default", "compact", "featured"]).default("default").describe("Card layout variant"),
});

registerBlock({
  type: "projectCard",
  label: "Project Card",
  description: "Project showcase card with tech stack and links",
  iconName: "Layers",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: projectCardSchema,
  defaultAttrs: projectCardDefaults(),
  slashCommand: "/projectcard",
  searchTerms: ["project", "card", "portfolio", "showcase", "work"],
});

function projectCardAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "projectCard" },
    title: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-title") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.title ? { "data-title": attrs.title } : {},
    },
    description: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-description") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.description ? { "data-description": attrs.description } : {},
    },
    tech: {
      default: "[]",
      parseHTML: (el: Element) => el.getAttribute("data-tech") ?? "[]",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-tech": attrs.tech }),
    },
    coverUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-cover-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.coverUrl ? { "data-cover-url": attrs.coverUrl } : {},
    },
    liveUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-live-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.liveUrl ? { "data-live-url": attrs.liveUrl } : {},
    },
    repoUrl: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-repo-url") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.repoUrl ? { "data-repo-url": attrs.repoUrl } : {},
    },
    status: {
      default: "active",
      parseHTML: (el: Element) => el.getAttribute("data-status") ?? "active",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-status": attrs.status }),
    },
    variant: {
      default: "default",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "default",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    ...makeWrapAttrs(),
  };
}

const STATUS_LABELS: Record<string, string> = { active: "Active", wip: "In Progress", archived: "Archived" };

// ─── Editor DOM refs ──────────────────────────────────────────────────────────

interface ProjectEditorRefs {
  coverEl: HTMLElement;
  titleEl: HTMLElement;
  statusEl: HTMLElement;
  descEl: HTMLElement;
  techEl: HTMLElement;
  linksEl: HTMLElement;
}
const projectRefs = new WeakMap<HTMLElement, ProjectEditorRefs>();

function buildProjectDom(
  contentDom: HTMLElement,
  title: string, description: string, tech: string[],
  coverUrl: string, liveUrl: string, repoUrl: string,
  status: string, variant: string,
): ProjectEditorRefs {
  contentDom.className = `block-project-card block-project-card--${variant} block-project-card--${status} block-project-card-editor`;
  contentDom.innerHTML = "";

  const coverEl = document.createElement("div");
  coverEl.className = "block-project-card-cover-wrap";
  renderProjectCover(coverEl, coverUrl, title);

  const body = document.createElement("div");
  body.className = "block-project-card-body";

  const header = document.createElement("header");
  header.className = "block-project-card-header";

  const titleEl = makeEditableField("h3", "block-project-card-title", title, "title", "Project name");
  const statusEl = document.createElement("span");
  statusEl.className = `block-project-card-status block-project-card-status--${status}`;
  statusEl.textContent = STATUS_LABELS[status] ?? status;

  header.appendChild(titleEl);
  header.appendChild(statusEl);

  const descEl = makeEditableField("p", "block-project-card-description", description, "description", "Short description…");

  const techEl = document.createElement("ul");
  techEl.className = "block-project-card-tech";
  renderTechChips(techEl, tech);

  const linksEl = document.createElement("div");
  linksEl.className = "block-project-card-links";
  renderProjectLinks(linksEl, liveUrl, repoUrl);

  body.appendChild(header);
  body.appendChild(descEl);
  body.appendChild(techEl);
  body.appendChild(linksEl);

  contentDom.appendChild(coverEl);
  contentDom.appendChild(body);

  return { coverEl, titleEl, statusEl, descEl, techEl, linksEl };
}

function renderProjectCover(coverEl: HTMLElement, coverUrl: string, title: string) {
  coverEl.innerHTML = "";
  if (coverUrl) {
    const img = document.createElement("img");
    img.src = coverUrl;
    img.alt = title || "";
    img.className = "block-project-card-cover";
    coverEl.appendChild(img);
    coverEl.style.display = "";
  } else {
    coverEl.style.display = "none";
  }
}

function renderTechChips(techEl: HTMLElement, tech: string[]) {
  techEl.innerHTML = "";
  tech.forEach((t) => {
    const li = document.createElement("li");
    li.className = "block-project-card-tech-item";
    li.textContent = t;
    techEl.appendChild(li);
  });
}

function renderProjectLinks(linksEl: HTMLElement, liveUrl: string, repoUrl: string) {
  linksEl.innerHTML = "";
  if (liveUrl) {
    const a = document.createElement("span");
    a.className = "block-project-card-link block-project-card-link--live";
    a.textContent = "↗ Live demo";
    linksEl.appendChild(a);
  }
  if (repoUrl) {
    const a = document.createElement("span");
    a.className = "block-project-card-link block-project-card-link--repo";
    a.textContent = "↗ Source";
    linksEl.appendChild(a);
  }
  linksEl.style.display = liveUrl || repoUrl ? "" : "none";
}

export const ProjectCard = Node.create({
  name: "projectCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: projectCardAttrs,
  parseHTML() { return [{ tag: 'article[data-block-type="projectCard"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["article", mergeAttributes(HTMLAttributes, { class: "block-project-card", "data-block-type": "projectCard" })];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "projectCard",
      label: "Project Card",
      iconName: "Layers",
      atom: true,
      supportWrap: true,
      renderContent(node, contentDom) {
        const a = node.attrs as Record<string, string>;
        const refs = buildProjectDom(
          contentDom, a.title, a.description, parseTech(a.tech),
          a.coverUrl, a.liveUrl, a.repoUrl, a.status, a.variant,
        );
        projectRefs.set(contentDom, refs);
      },
      updateContent(node, contentDom) {
        const refs = projectRefs.get(contentDom);
        if (!refs) return false;
        const a = node.attrs as Record<string, string>;
        const status = a.status || "active";
        const variant = a.variant || "default";

        contentDom.className = `block-project-card block-project-card--${variant} block-project-card--${status} block-project-card-editor`;
        renderProjectCover(refs.coverEl, a.coverUrl, a.title);
        syncEditableField(refs.titleEl, a.title);
        refs.statusEl.className = `block-project-card-status block-project-card-status--${status}`;
        refs.statusEl.textContent = STATUS_LABELS[status] ?? status;
        syncEditableField(refs.descEl, a.description);
        renderTechChips(refs.techEl, parseTech(a.tech));
        renderProjectLinks(refs.linksEl, a.liveUrl, a.repoUrl);
        return true;
      },
    });
  },
});

export const ServerProjectCard = Node.create({
  name: "projectCard",
  group: "block",
  atom: true,

  addAttributes: projectCardAttrs,
  parseHTML() { return [{ tag: 'article[data-block-type="projectCard"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const title = (HTMLAttributes["data-title"] ?? "") as string;
    const description = (HTMLAttributes["data-description"] ?? "") as string;
    const tech = parseTech(HTMLAttributes["data-tech"] ?? "[]");
    const coverUrl = (HTMLAttributes["data-cover-url"] ?? "") as string;
    const liveUrl = (HTMLAttributes["data-live-url"] ?? "") as string;
    const repoUrl = (HTMLAttributes["data-repo-url"] ?? "") as string;
    const status = (HTMLAttributes["data-status"] ?? "active") as string;
    const variant = (HTMLAttributes["data-variant"] ?? "default") as string;

    return [
      "article",
      mergeAttributes(HTMLAttributes, { class: `block-project-card block-project-card--${variant} block-project-card--${status}`, "data-block-type": "projectCard" }),
      ...(coverUrl ? [["img", { src: coverUrl, alt: title, class: "block-project-card-cover", loading: "lazy" }]] : []),
      [
        "div", { class: "block-project-card-body" },
        ["header", { class: "block-project-card-header" },
          ...(title ? [["h3", { class: "block-project-card-title" }, title]] : []),
          ["span", { class: `block-project-card-status block-project-card-status--${status}` }, STATUS_LABELS[status] ?? status],
        ],
        ...(description ? [["p", { class: "block-project-card-description" }, description]] : []),
        ...(tech.length > 0 ? [["ul", { class: "block-project-card-tech" }, ...tech.map(t => ["li", { class: "block-project-card-tech-item" }, t])]] : []),
        ...(liveUrl || repoUrl ? [["div", { class: "block-project-card-links" },
          ...(liveUrl ? [["a", { href: liveUrl, class: "block-project-card-link block-project-card-link--live", rel: "noopener", target: "_blank" }, "Live demo"]] : []),
          ...(repoUrl ? [["a", { href: repoUrl, class: "block-project-card-link block-project-card-link--repo", rel: "noopener", target: "_blank" }, "Source"]] : []),
        ]] : []),
      ],
    ];
  },
});
