/**
 * Server component: renders a TipTap JSON document to HTML.
 *
 * TipTap v3's generateHTML calls DOMSerializer.serializeFragment which needs
 * a real DOM document. We bypass the TipTap wrapper and call ProseMirror
 * directly, passing a jsdom document so it works in Node.js server components.
 */

import { DOMSerializer, Node, Fragment } from "@tiptap/pm/model";
import { getSchema } from "@tiptap/core";
import { JSDOM } from "jsdom";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { logger } from "@/lib/core/logger";
import type { JSONContent } from "@tiptap/core";

interface TipTapContentProps {
  bodyJson: JSONContent;
  className?: string;
}

// Ensure every node has a content array — ProseMirror fromJSON is tolerant
// of missing content but the recursive normalisation avoids edge-case errors.
function normalizeDoc(node: JSONContent): JSONContent {
  if (!node || typeof node !== "object") return node;
  return {
    ...node,
    content: (node.content ?? []).map(normalizeDoc),
  };
}

function slugifyAnchor(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Four-pass DOM post-processor:
 * 1. Assign unique `id` attributes to every heading so anchor links resolve.
 * 2. Fill each `.block-toc-list-placeholder` with the actual <ol> list,
 *    respecting the TOC block's `data-max-depth` attribute.
 * 3. Synthesize a `.block-tabs-bar` for every `.block-tabs` by reading each
 *    child panel's `data-label`, and mark the active panel/button per
 *    `data-active-tab`. (Panels can't compute their own active state in
 *    renderHTML because they don't see their parent's attrs.)
 * 4. Strip elements marked `data-form-empty="true"`. Form-input blocks
 *    (text-input, date-input, select-input, etc.) emit this marker when
 *    their value is empty so the publisher omits them entirely — keeping
 *    the published output clean of "unfilled form" artifacts.
 */
function postProcessDom(container: HTMLElement, jsdomDocument: Document): void {
  // Pass 1 — heading IDs
  const seen = new Map<string, number>();
  const headingData: Array<{ level: number; text: string; id: string }> = [];
  container.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6").forEach((el) => {
    const base = slugifyAnchor(el.textContent ?? "") || "heading";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    el.id = id;
    headingData.push({ level: parseInt(el.tagName[1]!, 10), text: el.textContent ?? "", id });
  });

  // Pass 2 — TOC placeholders
  container.querySelectorAll<HTMLElement>(".block-toc-list-placeholder").forEach((placeholder) => {
    const nav = placeholder.closest<HTMLElement>('nav[data-block-type="tableOfContents"]');
    const maxDepth = parseInt(nav?.getAttribute("data-max-depth") ?? "3", 10);
    const entries = headingData.filter((h) => h.level <= maxDepth);
    if (entries.length === 0) {
      const empty = jsdomDocument.createElement("p");
      empty.className = "block-toc-empty";
      empty.textContent = "No headings found";
      placeholder.appendChild(empty);
      return;
    }
    const minLevel = Math.min(...entries.map((e) => e.level));
    const ol = jsdomDocument.createElement("ol");
    ol.className = "block-toc-list";
    entries.forEach((entry) => {
      const li = jsdomDocument.createElement("li");
      li.className = `block-toc-item block-toc-item--h${entry.level}`;
      if (entry.level > minLevel) li.style.paddingLeft = `${entry.level - minLevel}rem`;
      const a = jsdomDocument.createElement("a");
      a.href = `#${entry.id}`;
      a.className = "block-toc-link";
      a.textContent = entry.text;
      li.appendChild(a);
      ol.appendChild(li);
    });
    placeholder.appendChild(ol);
  });

  // Pass 3 — Tabs: build tab bar + mark active panel
  container.querySelectorAll<HTMLElement>(".block-tabs").forEach((tabsEl) => {
    const activeIndex = parseInt(tabsEl.getAttribute("data-active-tab") ?? "0", 10);
    const content = tabsEl.querySelector<HTMLElement>(".block-tabs-content");
    if (!content) return;
    const panels = Array.from(content.querySelectorAll<HTMLElement>(":scope > .block-tab-panel"));
    if (panels.length === 0) return;

    const bar = jsdomDocument.createElement("div");
    bar.className = "block-tabs-bar";

    panels.forEach((panel, i) => {
      const label = panel.getAttribute("data-label") || `Tab ${i + 1}`;
      const isActive = i === activeIndex;

      const btn = jsdomDocument.createElement("button");
      btn.className = "block-tab-btn" + (isActive ? " block-tab-active" : "");
      btn.type = "button";
      const labelSpan = jsdomDocument.createElement("span");
      labelSpan.className = "block-tab-label";
      labelSpan.textContent = label;
      btn.appendChild(labelSpan);
      bar.appendChild(btn);

      panel.classList.add(isActive ? "block-tab-panel-active" : "block-tab-panel-hidden");
    });

    tabsEl.insertBefore(bar, content);
  });

  // Pass 4 — Strip empty form-input blocks (text-input, date-input, etc.)
  // Policy: forms with no value contribute nothing to the published page.
  container.querySelectorAll<HTMLElement>('[data-form-empty="true"]').forEach((el) => {
    el.remove();
  });
}

function generateHTMLServer(doc: JSONContent): string {
  const extensions = getServerExtensions();
  const schema = getSchema(extensions);
  const contentNode = Node.fromJSON(schema, doc);

  const { document: jsdomDocument } = new JSDOM("").window;
  const serializer = DOMSerializer.fromSchema(schema);

  // Try full serialization first (fast path).
  try {
    const fragment = serializer.serializeFragment(contentNode.content, {
      document: jsdomDocument,
    });
    const container = jsdomDocument.createElement("div");
    container.appendChild(fragment);
    postProcessDom(container, jsdomDocument);
    return container.innerHTML;
  } catch (fullErr) {
    // Full pass failed — fall back to per-node serialization so one broken
    // block doesn't blank the entire page.
    logger.warn({
      layer: "editor",
      event: "public_render_full:failed",
      summary: "full serialization failed, falling back to per-node",
      error: fullErr,
    });
    const container = jsdomDocument.createElement("div");
    contentNode.content.forEach((node) => {
      try {
        const nodeFrag = serializer.serializeFragment(Fragment.from(node), {
          document: jsdomDocument,
        });
        container.appendChild(nodeFrag);
      } catch (nodeErr) {
        logger.error({
          layer: "editor",
          event: "public_render_node:caught",
          summary: "per-node serialization failed — skipping block",
          attrs: { node_type: node.type.name },
          error: nodeErr,
        });
      }
    });
    postProcessDom(container, jsdomDocument);
    return container.innerHTML;
  }
}

export function TipTapContent({ bodyJson, className }: TipTapContentProps) {
  let html = "";
  try {
    html = generateHTMLServer(normalizeDoc(bodyJson));
  } catch (err) {
    logger.error({
      layer: "editor",
      event: "public_render:caught",
      summary: "TipTapContent server-render failed (returned fallback HTML)",
      error: err,
    });
    html = "<p><em>Content could not be rendered.</em></p>";
  }

  return (
    <div
      className={className ?? "public-prose"}
      // Browser extensions (e.g. crypto wallets) sometimes mutate innerHTML
      // before React hydrates, causing a benign mismatch warning.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
