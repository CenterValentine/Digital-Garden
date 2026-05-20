/**
 * PostCard Block — W3 Publishing Block
 *
 * Atom block: a single blog post preview card (manually authored).
 * Use RecentPosts for a dynamic auto-populated list.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "@/lib/domain/blocks/data-attr";
import { makeWrapAttrs } from "@/lib/domain/blocks/wrap-size";
import { makeEditableField, syncEditableField } from "@/lib/domain/blocks/inline-edit";

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

const { schema: postCardSchema, defaults: postCardDefaults } = createBlockSchema("postCard", {
  title: z.string().default("").describe("Post title"),
  excerpt: z.string().default("").describe("Short excerpt shown under the title"),
  publishedAt: z.string().default("").describe("Publish date — ISO format (e.g. 2026-05-01)"),
  tags: z.string().default("[]").describe('JSON array of tag strings — e.g. ["Design","Code"]').meta({
    fieldType: "string-array",
    addLabel: "Add tag",
    placeholder: "e.g. Design",
    emptyMessage: "No tags yet",
  }),
  coverUrl: z.string().default("").describe("Cover image URL").meta({ uploadType: "image" }),
  href: z.string().default("").describe("Link destination for the card (e.g. /blog/my-post)"),
  variant: z.enum(["default", "horizontal", "minimal"]).default("default").describe("Card layout variant"),
});

registerBlock({
  type: "postCard",
  label: "Post Card",
  description: "Blog post preview card with cover, title, excerpt, and tags",
  iconName: "FileText",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: postCardSchema,
  defaultAttrs: postCardDefaults(),
  slashCommand: "/postcard",
  searchTerms: ["post", "card", "blog", "article", "preview"],
});

function postCardAttrs() {
  return {
    blockId: blockIdAttr,
    blockType: { default: "postCard" },
    title: dataAttr("title"),
    excerpt: dataAttr("excerpt"),
    publishedAt: dataAttr("publishedAt"),
    tags: dataAttr("tags", { default: "[]" }),
    coverUrl: dataAttr("coverUrl"),
    href: dataAttr("href"),
    variant: dataAttr("variant", { default: "default" }),
    ...makeWrapAttrs(),
  };
}

// ─── Editor DOM refs ──────────────────────────────────────────────────────────

interface PostCardEditorRefs {
  imgWrap: HTMLElement;
  titleEl: HTMLElement;
  excerptEl: HTMLElement;
  metaEl: HTMLElement;
}
const postCardRefs = new WeakMap<HTMLElement, PostCardEditorRefs>();

function buildPostCardDom(
  contentDom: HTMLElement,
  title: string, excerpt: string, date: string,
  tags: string[], coverUrl: string, variant: string,
): PostCardEditorRefs {
  contentDom.className = `block-post-card block-post-card--${variant} block-post-card-editor`;
  contentDom.innerHTML = "";

  const imgWrap = document.createElement("div");
  imgWrap.className = "block-post-card-img-wrap";
  renderPostCover(imgWrap, coverUrl, title);

  const body = document.createElement("div");
  body.className = "block-post-card-body";

  const titleEl = makeEditableField("h3", "block-post-card-title", title, "title", "Post title");
  const excerptEl = makeEditableField("p", "block-post-card-excerpt", excerpt, "excerpt", "Short excerpt…");

  const metaEl = document.createElement("footer");
  metaEl.className = "block-post-card-meta";
  renderPostMeta(metaEl, date, tags);

  body.appendChild(titleEl);
  body.appendChild(excerptEl);
  body.appendChild(metaEl);

  contentDom.appendChild(imgWrap);
  contentDom.appendChild(body);

  return { imgWrap, titleEl, excerptEl, metaEl };
}

function renderPostCover(imgWrap: HTMLElement, coverUrl: string, title: string) {
  imgWrap.innerHTML = "";
  if (coverUrl) {
    const img = document.createElement("img");
    img.src = coverUrl;
    img.alt = title || "";
    img.className = "block-post-card-cover";
    imgWrap.appendChild(img);
    imgWrap.style.display = "";
  } else {
    imgWrap.style.display = "none";
  }
}

function renderPostMeta(metaEl: HTMLElement, date: string, tags: string[]) {
  metaEl.innerHTML = "";
  if (date) {
    const time = document.createElement("time");
    time.className = "block-post-card-date";
    time.setAttribute("datetime", date);
    time.textContent = formatDate(date);
    metaEl.appendChild(time);
  }
  if (tags.length) {
    const ul = document.createElement("ul");
    ul.className = "block-post-card-tags";
    tags.forEach((t) => {
      const li = document.createElement("li");
      li.className = "block-post-card-tag";
      li.textContent = t;
      ul.appendChild(li);
    });
    metaEl.appendChild(ul);
  }
}

export const PostCard = Node.create({
  name: "postCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: postCardAttrs,
  parseHTML() { return [{ tag: 'article[data-block-type="postCard"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["article", mergeAttributes(HTMLAttributes, { class: "block-post-card", "data-block-type": "postCard" })];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "postCard",
      label: "Post Card",
      iconName: "FileText",
      atom: true,
      supportWrap: true,
      renderContent(node, contentDom) {
        const a = node.attrs as Record<string, string>;
        const refs = buildPostCardDom(
          contentDom, a.title, a.excerpt, a.publishedAt,
          parseTags(a.tags), a.coverUrl, a.variant,
        );
        postCardRefs.set(contentDom, refs);
      },
      updateContent(node, contentDom) {
        const refs = postCardRefs.get(contentDom);
        if (!refs) return false;
        const a = node.attrs as Record<string, string>;

        contentDom.className = `block-post-card block-post-card--${a.variant || "default"} block-post-card-editor`;
        renderPostCover(refs.imgWrap, a.coverUrl, a.title);
        syncEditableField(refs.titleEl, a.title);
        syncEditableField(refs.excerptEl, a.excerpt);
        renderPostMeta(refs.metaEl, a.publishedAt, parseTags(a.tags));
        return true;
      },
    });
  },
});

export const ServerPostCard = Node.create({
  name: "postCard",
  group: "block",
  atom: true,

  addAttributes: postCardAttrs,
  parseHTML() { return [{ tag: 'article[data-block-type="postCard"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const title = (HTMLAttributes["data-title"] ?? "") as string;
    const excerpt = (HTMLAttributes["data-excerpt"] ?? "") as string;
    const publishedAt = (HTMLAttributes["data-published-at"] ?? "") as string;
    const tags = parseTags(HTMLAttributes["data-tags"] ?? "[]");
    const coverUrl = (HTMLAttributes["data-cover-url"] ?? "") as string;
    const href = (HTMLAttributes["data-href"] ?? "") as string;
    const variant = (HTMLAttributes["data-variant"] ?? "default") as string;

    const inner = [
      ...(coverUrl ? [["div", { class: "block-post-card-img-wrap" }, ["img", { src: coverUrl, alt: title, class: "block-post-card-cover", loading: "lazy" }]]] : []),
      [
        "div", { class: "block-post-card-body" },
        ...(title ? [["h3", { class: "block-post-card-title" }, title]] : []),
        ...(excerpt ? [["p", { class: "block-post-card-excerpt" }, excerpt]] : []),
        ...(publishedAt || tags.length > 0 ? [[
          "footer", { class: "block-post-card-meta" },
          ...(publishedAt ? [["time", { datetime: publishedAt, class: "block-post-card-date" }, formatDate(publishedAt)]] : []),
          ...(tags.length > 0 ? [["ul", { class: "block-post-card-tags" }, ...tags.map(t => ["li", { class: "block-post-card-tag" }, t])]] : []),
        ]] : []),
      ],
    ];

    const attrs = mergeAttributes(HTMLAttributes, { class: `block-post-card block-post-card--${variant}`, "data-block-type": "postCard" });
    return href ? ["a", { ...attrs, href }, ...inner] : ["article", attrs, ...inner];
  },
});
