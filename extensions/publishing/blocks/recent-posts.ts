/**
 * RecentPosts Block — W3 Publishing Block
 *
 * Atom block: dynamic list of recently published items from the same PublicPath.
 * Populated at render time by the server-side post-processor; in the editor it
 * shows a config preview only.
 *
 * Attrs:
 * - count       number of posts to show (1–10)
 * - pathSlug    which PublicPath to pull from (empty = current path)
 * - showExcerpt include excerpt text
 * - showDate    include publish date
 * - showCover   include cover image
 * - layout      list | grid | cards
 * - excludeSelf omit the containing post (default true)
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

// ─── Schema ──────────────────────────────────────────────────────────────────

const { schema: recentPostsSchema, defaults: recentPostsDefaults } = createBlockSchema(
  "recentPosts",
  {
    count: z.number().int().min(1).max(10).default(5),
    pathSlug: z.string().default("").describe("PublicPath slug to pull from (leave empty = current path's posts)"),
    showExcerpt: z.boolean().default(true),
    showDate: z.boolean().default(true),
    showCover: z.boolean().default(false),
    layout: z.enum(["list", "grid", "cards"]).default("list"),
    excludeSelf: z.boolean().default(true),
  }
);

registerBlock({
  type: "recentPosts",
  label: "Recent Posts",
  description: "Dynamically populated list of recent posts from a publishing path",
  iconName: "Rss",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: recentPostsSchema,
  defaultAttrs: recentPostsDefaults(),
  slashCommand: "/recentposts",
  searchTerms: ["recent", "posts", "feed", "list", "dynamic", "auto"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function recentPostsAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "recentPosts" },
    count: {
      default: 5,
      parseHTML: (el: Element) => parseInt(el.getAttribute("data-count") ?? "5", 10),
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-count": attrs.count }),
    },
    pathSlug: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-path-slug") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.pathSlug ? { "data-path-slug": attrs.pathSlug } : {},
    },
    showExcerpt: {
      default: true,
      parseHTML: (el: Element) => el.getAttribute("data-show-excerpt") !== "false",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-show-excerpt": attrs.showExcerpt }),
    },
    showDate: {
      default: true,
      parseHTML: (el: Element) => el.getAttribute("data-show-date") !== "false",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-show-date": attrs.showDate }),
    },
    showCover: {
      default: false,
      parseHTML: (el: Element) => el.getAttribute("data-show-cover") === "true",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-show-cover": attrs.showCover }),
    },
    layout: {
      default: "list",
      parseHTML: (el: Element) => el.getAttribute("data-layout") ?? "list",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-layout": attrs.layout }),
    },
    excludeSelf: {
      default: true,
      parseHTML: (el: Element) => el.getAttribute("data-exclude-self") !== "false",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-exclude-self": attrs.excludeSelf }),
    },
  };
}

function editorHtml(count: number, layout: string, pathSlug: string): string {
  const WIDTHS = [72, 88, 65, 81, 75];
  return `
    <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="padding:10px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;font-weight:600;color:#374151">Recent Posts</span>
        <span style="font-size:11px;color:#9ca3af">${layout} · ${count} post${count === 1 ? "" : "s"}${pathSlug ? ` · ${pathSlug}` : ""}</span>
      </div>
      <div style="padding:10px 14px;display:flex;flex-direction:column;gap:8px">
        ${Array.from({ length: Math.min(count, 4) }).map((_, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;${i < Math.min(count, 4) - 1 ? "border-bottom:1px solid #f3f4f6;" : ""}">
            <div style="width:32px;height:32px;border-radius:4px;background:#f3f4f6;flex-shrink:0"></div>
            <div style="flex:1">
              <div style="height:10px;background:#e5e7eb;border-radius:3px;width:${WIDTHS[i % 5]}%;margin-bottom:4px"></div>
              <div style="height:8px;background:#f3f4f6;border-radius:3px;width:${WIDTHS[(i + 2) % 5]}%"></div>
            </div>
          </div>
        `).join("")}
        ${count > 4 ? `<p style="margin:2px 0 0;font-size:11px;color:#9ca3af;text-align:center">+${count - 4} more posts</p>` : ""}
      </div>
      <div style="padding:8px 14px;background:#f9fafb;border-top:1px solid #e5e7eb">
        <p style="margin:0;font-size:11px;color:#9ca3af">Populated automatically at publish time</p>
      </div>
    </div>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const RecentPosts = Node.create({
  name: "recentPosts",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: recentPostsAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="recentPosts"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-recent-posts", "data-block-type": "recentPosts" }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "recentPosts",
      label: "Recent Posts",
      iconName: "Rss",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-recent-posts-editor";
        contentDom.innerHTML = editorHtml(
          node.attrs.count as number,
          node.attrs.layout as string,
          node.attrs.pathSlug as string,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          node.attrs.count as number,
          node.attrs.layout as string,
          node.attrs.pathSlug as string,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerRecentPosts = Node.create({
  name: "recentPosts",
  group: "block",
  atom: true,

  addAttributes: recentPostsAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="recentPosts"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // The placeholder wrapper preserves data-* attrs so a future server
    // post-processor can read its config and replace the inner empty
    // state with live data. Until that post-processor exists, every
    // recent-posts block on every published page renders this empty
    // state — see project_publishing_recent_posts_no_processor memory.
    const layout = (HTMLAttributes["data-layout"] as string) || "list";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-recent-posts block-recent-posts--${layout} block-recent-posts--placeholder`,
        "data-block-type": "recentPosts",
      }),
      ["p", { class: "block-recent-posts-empty" }, "No posts yet — published items in this path will appear here."],
    ];
  },
});
