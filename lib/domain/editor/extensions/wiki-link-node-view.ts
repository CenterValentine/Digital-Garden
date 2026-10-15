/**
 * wikiLink NodeView — the chip and card displays.
 *
 * The DOM starts as EXACTLY what renderHTML produces (the span with every
 * data-* attr, built through the schema's own toDOM), so the click handler,
 * the context menu and the hover chooser — all of which read
 * `[data-type="wiki-link"]` and its data attrs off the DOM — see no
 * difference between a link, a chip and a card. The link display returns
 * that span untouched. Chip and card then decorate it in place with chrome
 * that exists ONLY here: ProseMirror serializes the clipboard through
 * renderHTML, so none of this chrome can leak into a paste (the trap the
 * accordion and pull-quote blocks fell into).
 *
 * Card content comes from the shared preview cache (lib/domain/editor/
 * link-preview.ts); until it arrives the card shows the title alone.
 * Vanilla DOM on purpose — a note with forty links should not mount forty
 * React roots.
 */

import type { NodeViewRenderer } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { DEFAULT_WIKI_LINK_VIEW } from "@/lib/domain/content/wiki-link-markdown";
import { fetchLinkPreview } from "../link-preview";
import { wikiLinkDisplayText, wikiLinkViewOf } from "./wiki-link-attrs";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Lucide outlines, by content type (file-text, folder, database, file, book). */
const ICON_PATHS: Record<string, string[]> = {
  note: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M10 9H8",
    "M16 13H8",
    "M16 17H8",
  ],
  folder: [
    "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  ],
  data: ["M12 3C7.03 3 3 4.79 3 7s4.03 4 9 4 9-1.79 9-4-4.03-4-9-4Z", "M3 7v10c0 2.21 4.03 4 9 4s9-1.79 9-4V7", "M3 12c0 2.21 4.03 4 9 4s9-1.79 9-4"],
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4"],
  book: ["M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"],
};

function iconFor(contentType: string | null): SVGSVGElement {
  const paths = ICON_PATHS[contentType ?? "note"] ?? ICON_PATHS.file;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("wiki-link-icon");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The span renderHTML would produce for this node, through the schema. */
function renderedSpan(node: PMNode): HTMLElement {
  const toDOM = node.type.spec.toDOM;
  if (!toDOM) throw new Error("wikiLink has no toDOM");
  const { dom } = DOMSerializer.renderSpec(document, toDOM(node));
  return dom as HTMLElement;
}

function decorateChip(dom: HTMLElement, node: PMNode): void {
  const label = wikiLinkDisplayText(node.attrs);
  dom.textContent = "";
  const icon = iconFor(null);
  dom.appendChild(icon);
  dom.appendChild(el("span", "wiki-link-label", label));
  void fetchLinkPreview({ targetId: node.attrs.targetId, targetTitle: node.attrs.targetTitle ?? "" }).then(
    (preview) => {
      if (!preview || !dom.isConnected) return;
      icon.replaceWith(iconFor(preview.contentType));
    },
  );
}

function decorateCard(dom: HTMLElement, node: PMNode): void {
  const label = wikiLinkDisplayText(node.attrs);
  dom.textContent = "";
  const icon = iconFor(null);
  const body = el("span", "wiki-link-card-body");
  const title = el("span", "wiki-link-card-title", label);
  const excerpt = el("span", "wiki-link-card-excerpt");
  body.appendChild(title);
  body.appendChild(excerpt);
  dom.appendChild(icon);
  dom.appendChild(body);
  void fetchLinkPreview({ targetId: node.attrs.targetId, targetTitle: node.attrs.targetTitle ?? "" }).then(
    (preview) => {
      if (!dom.isConnected) return;
      if (!preview) {
        excerpt.textContent = "Not found";
        dom.classList.add("wiki-link-broken");
        return;
      }
      icon.replaceWith(iconFor(preview.contentType));
      // The alias wins when the author set one; otherwise the live title.
      if (!node.attrs.displayText && preview.title) title.textContent = preview.title;
      excerpt.textContent = preview.excerpt || preview.contentType;
    },
  );
}

export function createWikiLinkNodeView(): NodeViewRenderer {
  return ({ node }) => {
    const dom = renderedSpan(node);
    const view = wikiLinkViewOf(node.attrs);
    if (view !== DEFAULT_WIKI_LINK_VIEW) {
      dom.setAttribute("contenteditable", "false");
      if (view === "chip") decorateChip(dom, node);
      else decorateCard(dom, node);
    }
    return {
      dom,
      // Any attr change (a new view, a healed id, a renamed target) rebuilds
      // the element — cheap for an inline atom, and it keeps this view free
      // of diffing logic.
      update: (updated) => updated.type === node.type && updated.sameMarkup(node),
      ignoreMutation: () => true,
    };
  };
}
