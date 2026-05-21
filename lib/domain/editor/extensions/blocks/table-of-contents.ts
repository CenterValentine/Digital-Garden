/**
 * Table of Contents Block — W1 Publishing Block
 *
 * Atom block that auto-generates a TOC from the document's headings.
 * In the editor: reads live doc state and updates whenever headings change.
 * In server HTML: renders anchor links from the serialized heading structure.
 *
 * Heading anchor IDs are slugified from heading text and guaranteed unique
 * with a numeric suffix (e.g., "getting-started", "getting-started-2").
 */

import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TocEntry {
  level: number;
  text: string;
  anchor: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractHeadings(doc: ProseMirrorNode, maxDepth: number): TocEntry[] {
  const entries: TocEntry[] = [];
  const seen = new Map<string, number>();

  doc.descendants((node) => {
    if (node.type.name !== "heading") return;
    const level = node.attrs.level as number;
    if (level > maxDepth) return;

    const text = node.textContent;
    if (!text.trim()) return;

    const base = slugifyHeading(text) || `heading-${entries.length + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const anchor = count === 0 ? base : `${base}-${count + 1}`;

    entries.push({ level, text, anchor });
  });

  return entries;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const { schema: tocSchema, defaults: tocDefaults } = createBlockSchema(
  "tableOfContents",
  {
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(6)
      .default(3)
      .describe("Maximum heading depth to include (1–6)"),
    title: z
      .string()
      .default("Contents")
      .describe("Label shown in the TOC header"),
    collapsed: z
      .boolean()
      .default(false)
      .describe("Start collapsed (user can expand)"),
  }
);

registerBlock({
  type: "tableOfContents",
  label: "Table of Contents",
  description: "Auto-generated outline of document headings",
  iconName: "List",
  family: "content",
  group: "text",
  contentModel: null,
  atom: true,
  attrsSchema: tocSchema,
  defaultAttrs: tocDefaults(),
  slashCommand: "/toc",
  searchTerms: ["toc", "contents", "outline", "navigation", "index", "headings"],
});

// ─── DOM renderer (shared between NodeView and server) ───────────────────────

function renderTocEntries(entries: TocEntry[]): string {
  if (entries.length === 0) {
    return '<p class="block-toc-empty">No headings found</p>';
  }
  const minLevel = Math.min(...entries.map((e) => e.level));
  const items = entries
    .map((e) => {
      const indent = e.level - minLevel;
      return `<li class="block-toc-item block-toc-item--h${e.level}" style="padding-left:${indent * 1}rem"><a href="#${e.anchor}" class="block-toc-link">${e.text}</a></li>`;
    })
    .join("");
  return `<ol class="block-toc-list">${items}</ol>`;
}

// ─── Editor DOM builder ───────────────────────────────────────────────────────

/**
 * Fully rebuilds the TOC editor DOM inside `contentDom`.
 * Called both on initial render and every attr update so state stays in sync.
 */
function buildTocDom(
  contentDom: HTMLElement,
  title: string,
  collapsed: boolean,
  maxDepth: number,
  editor: Editor,
  node: ProseMirrorNode
) {
  contentDom.innerHTML = "";
  contentDom.setAttribute("data-collapsed", String(collapsed));

  // Header row: title + toggle chevron (chevron sits right of the title, both left-aligned)
  const header = document.createElement("div");
  header.className = "block-toc-header";
  header.style.cssText =
    "display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none;padding:2px 0 6px";

  const titleEl = document.createElement("span");
  titleEl.className = "block-toc-title";
  titleEl.style.cssText = "font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em";
  titleEl.textContent = title || "Contents";

  const chevron = document.createElement("span");
  chevron.style.cssText = `font-size:0.75rem;color:rgba(0,0,0,0.4);transition:transform .2s ease;transform:rotate(${collapsed ? "-90deg" : "0deg"});flex-shrink:0;width:1.25rem;height:1.25rem;display:inline-flex;align-items:center;justify-content:center;border-radius:3px`;
  chevron.textContent = "▾";

  header.appendChild(titleEl);
  header.appendChild(chevron);

  // Toggle on header click — dispatch setNodeMarkup to flip `collapsed` attr
  header.addEventListener("click", (e) => {
    e.stopPropagation();
    const blockId = node.attrs.blockId as string | null;
    let pos: number | null = null;
    editor.state.doc.descendants((n, p) => {
      if (n.type.name === "tableOfContents" && (!blockId || n.attrs.blockId === blockId)) {
        pos = p;
        return false;
      }
    });
    if (pos === null) return;
    const currentNode = editor.state.doc.nodeAt(pos);
    if (!currentNode) return;
    const newCollapsed = !currentNode.attrs.collapsed;
    editor.view.dispatch(
      editor.view.state.tr.setNodeMarkup(pos, undefined, {
        ...currentNode.attrs,
        collapsed: newCollapsed,
      })
    );
  });

  contentDom.appendChild(header);

  // List — hidden when collapsed
  const listWrap = document.createElement("div");
  listWrap.className = "block-toc-list-wrap";
  listWrap.style.display = collapsed ? "none" : "";
  listWrap.innerHTML = renderTocEntries(extractHeadings(editor.state.doc, maxDepth));
  contentDom.appendChild(listWrap);
}

// ─── Plugin key for doc-change subscriptions ─────────────────────────────────

const tocPluginKey = new PluginKey("tableOfContentsSync");

// ─── Client extension ─────────────────────────────────────────────────────────

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: blockIdAttr,
      blockType: { default: "tableOfContents" },
      maxDepth: {
        default: 3,
        parseHTML: (el) => parseInt(el.getAttribute("data-max-depth") ?? "3", 10),
        renderHTML: (attrs) => ({ "data-max-depth": attrs.maxDepth }),
      },
      title: {
        default: "Contents",
        parseHTML: (el) => el.getAttribute("data-toc-title") ?? "Contents",
        renderHTML: (attrs) => ({ "data-toc-title": attrs.title }),
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
        renderHTML: (attrs) => ({ "data-collapsed": attrs.collapsed }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'nav[data-block-type="tableOfContents"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "nav",
      mergeAttributes(HTMLAttributes, {
        class: "block-toc",
        "data-block-type": "tableOfContents",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "tableOfContents",
      label: "Table of Contents",
      iconName: "List",
      atom: true,
      renderContent(node, contentDom, editor) {
        const maxDepth = (node.attrs.maxDepth as number) ?? 3;
        const title = (node.attrs.title as string) || "Contents";
        const collapsed = !!(node.attrs.collapsed as boolean);

        contentDom.className = "block-toc-editor";
        buildTocDom(contentDom, title, collapsed, maxDepth, editor, node);

        // Subscribe to doc changes and refresh the list
        const refresh = () => {
          const listWrap = contentDom.querySelector<HTMLElement>(".block-toc-list-wrap");
          const isCollapsed = contentDom.getAttribute("data-collapsed") === "true";
          if (listWrap && !isCollapsed) {
            listWrap.innerHTML = renderTocEntries(extractHeadings(editor.state.doc, maxDepth));
          }
        };
        editor.on("update", refresh);
        (contentDom as HTMLElement & { __tocCleanup?: () => void }).__tocCleanup = () =>
          editor.off("update", refresh);
      },
      updateContent(node, contentDom, editor) {
        const maxDepth = (node.attrs.maxDepth as number) ?? 3;
        const title = (node.attrs.title as string) || "Contents";
        const collapsed = !!(node.attrs.collapsed as boolean);
        buildTocDom(contentDom, title, collapsed, maxDepth, editor, node);
        return true;
      },
    });
  },

  // Plugin that forces NodeView updates when headings change anywhere in the doc
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tocPluginKey,
        appendTransaction(transactions, oldState, newState) {
          // Only run if any transaction touched heading nodes
          const headingsChanged = transactions.some((tr) =>
            tr.docChanged &&
            (() => {
              let changed = false;
              tr.mapping.maps.forEach(() => {
                if (changed) return;
              });
              // Quick check: compare heading text in old vs new doc
              const extractText = (doc: ProseMirrorNode) => {
                const texts: string[] = [];
                doc.descendants((n) => {
                  if (n.type.name === "heading") texts.push(n.textContent);
                });
                return texts.join("|");
              };
              changed = extractText(oldState.doc) !== extractText(newState.doc);
              return changed;
            })()
          );

          if (!headingsChanged) return null;

          // Issue a no-op meta transaction on each tableOfContents node.
          // This causes TipTap to call updateContent on those NodeViews.
          let tr = newState.tr;
          let touched = false;
          newState.doc.descendants((node, pos) => {
            if (node.type.name === "tableOfContents") {
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs });
              touched = true;
            }
          });
          return touched ? tr.setMeta("tocSync", true) : null;
        },
      }),
    ];
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerTableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: blockIdAttr,
      blockType: { default: "tableOfContents" },
      maxDepth: {
        default: 3,
        parseHTML: (el) => parseInt(el.getAttribute("data-max-depth") ?? "3", 10),
        renderHTML: (attrs) => ({ "data-max-depth": attrs.maxDepth }),
      },
      title: {
        default: "Contents",
        parseHTML: (el) => el.getAttribute("data-toc-title") ?? "Contents",
        renderHTML: (attrs) => ({ "data-toc-title": attrs.title }),
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
        renderHTML: (attrs) => ({ "data-collapsed": attrs.collapsed }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'nav[data-block-type="tableOfContents"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const title = (HTMLAttributes["data-toc-title"] as string) || "Contents";
    const collapsed = HTMLAttributes["data-collapsed"] === true || HTMLAttributes["data-collapsed"] === "true";

    // Use <details>/<summary> for native HTML collapsibility — zero JS required in published view.
    // The post-processor injects the actual <ol> list inside .block-toc-list-placeholder.
    return [
      "nav",
      mergeAttributes(HTMLAttributes, {
        class: "block-toc",
        "data-block-type": "tableOfContents",
      }),
      [
        "details",
        { class: "block-toc-details", ...(collapsed ? {} : { open: "" }) },
        ["summary", { class: "block-toc-summary" }, title],
        ["div", { class: "block-toc-list-placeholder" }],
      ],
    ];
  },
});
