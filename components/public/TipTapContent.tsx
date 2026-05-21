/**
 * Server component: renders a TipTap JSON document to HTML.
 *
 * TipTap v3's generateHTML calls DOMSerializer.serializeFragment which needs
 * a real DOM document. We bypass the TipTap wrapper and call ProseMirror
 * directly, passing a jsdom document so it works in Node.js server components.
 *
 * Visualization blocks (mermaidBlock, excalidrawBlock) reference their data
 * via a contentId pointing to a VisualizationPayload row. This component is
 * an async server component so it can batch-fetch those sources up front
 * and inject them into the rendered HTML (mermaid: source for client-side
 * hydration; excalidraw: cached SVG when present, placeholder otherwise).
 */

import { DOMSerializer, Node, Fragment } from "@tiptap/pm/model";
import { getSchema } from "@tiptap/core";
import { JSDOM } from "jsdom";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { getActiveTrace, logger, withSpan } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import type { JSONContent } from "@tiptap/core";

interface TipTapContentProps {
  bodyJson: JSONContent;
  className?: string;
}

interface VisualizationSource {
  mermaidSource?: string;
  cachedSvg?: string;
}

type VisualizationSourceMap = Map<string, VisualizationSource>;

/**
 * Walk the TipTap JSON to find every visualization-block contentId.
 * Returns contentIds split by engine so we can shape the DB query.
 */
function collectVisualizationContentIds(json: JSONContent): {
  mermaid: string[];
  excalidraw: string[];
} {
  const mermaid: string[] = [];
  const excalidraw: string[] = [];
  function walk(node: JSONContent | undefined | null) {
    if (!node || typeof node !== "object") return;
    const id = (node.attrs?.contentId as string | undefined) ?? null;
    if (id) {
      if (node.type === "mermaidBlock") mermaid.push(id);
      else if (node.type === "excalidrawBlock") excalidraw.push(id);
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  }
  walk(json);
  return { mermaid, excalidraw };
}

/**
 * Batch-fetch visualization sources for every block in this document.
 * One query per engine type. Returns a Map keyed by contentId.
 *
 * Wrapped in a span when called from a traced context (the public page
 * route now opens one via withPageTrace). When invoked from contexts
 * without a trace (build-time prerender, scripts), the span call is
 * skipped — bare DB query, logger.warn fallback on failure.
 */
async function fetchVisualizationSources(
  json: JSONContent,
): Promise<VisualizationSourceMap> {
  const { mermaid, excalidraw } = collectVisualizationContentIds(json);
  if (mermaid.length === 0 && excalidraw.length === 0) {
    return new Map();
  }

  const doFetch = async (): Promise<VisualizationSourceMap> => {
    const map: VisualizationSourceMap = new Map();
    try {
      const rows = await prisma.visualizationPayload.findMany({
        where: { contentId: { in: [...mermaid, ...excalidraw] } },
        select: { contentId: true, engine: true, data: true },
      });
      for (const row of rows) {
        if (row.engine === "mermaid") {
          const source = (row.data as { source?: string })?.source ?? "";
          map.set(row.contentId, { mermaidSource: source });
        } else if (row.engine === "excalidraw") {
          const cachedSvg = (row.data as { cachedSvg?: string })?.cachedSvg;
          map.set(row.contentId, { cachedSvg });
        }
      }
    } catch (err) {
      logger.warn({
        layer: "editor",
        event: "public_render_visualization_fetch:failed",
        summary: "could not fetch visualization sources; diagrams will render empty",
        error: err,
      });
    }
    return map;
  };

  // Span only when trace context exists — withSpan throws without one.
  if (!getActiveTrace()) return doFetch();
  return withSpan(
    { layer: "editor", name: "publisher_visualization_fetch" },
    {
      summary: `fetch ${mermaid.length + excalidraw.length} visualization source(s)`,
      attrs: {
        mermaid_count: mermaid.length,
        excalidraw_count: excalidraw.length,
      },
    },
    async (span) => {
      const result = await doFetch();
      span.attr("rows_returned", result.size);
      return result;
    },
  );
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
 * Six-pass DOM post-processor:
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
 * 5. Strip elements marked `data-publisher-omit="true"`. Different
 *    semantic from data-form-empty: these blocks (currently calendar) are
 *    deliberately not rendered on the publisher for privacy/data-stale
 *    reasons regardless of whether they have content.
 * 6. Inject visualization sources: mermaid blocks get `<pre class="mermaid">
 *    {source}</pre>` for client-side hydration; excalidraw blocks get the
 *    cached SVG inline (or a styled "Drawing — view in app" placeholder
 *    if the cache hasn't been populated yet). Source map is fetched
 *    upstream by fetchVisualizationSources().
 */
function postProcessDom(
  container: HTMLElement,
  jsdomDocument: Document,
  visualizationSources: VisualizationSourceMap,
): void {
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

  // Pass 5 — Strip blocks explicitly omitted from publisher.
  // Currently: calendar (privacy + staleness). May extend later if
  // other blocks need a "never on publisher" policy.
  container.querySelectorAll<HTMLElement>('[data-publisher-omit="true"]').forEach((el) => {
    el.remove();
  });

  // Pass 6 — Visualization injection (mermaid + excalidraw).
  container.querySelectorAll<HTMLElement>('[data-block-type="mermaidBlock"]').forEach((el) => {
    const contentId = el.getAttribute("data-content-id") ?? "";
    const source = visualizationSources.get(contentId)?.mermaidSource;
    if (!source) {
      // No source available — emit an empty marker that the publisher
      // CSS can hide. (Editing without saving leaves the row absent.)
      el.classList.add("block-mermaid-empty");
      el.textContent = "";
      return;
    }
    el.classList.add("block-mermaid-rendered");
    // <pre class="mermaid">{source}</pre> is the standard hydration
    // target — the client-side MermaidHydrate script picks these up.
    el.textContent = "";
    const pre = jsdomDocument.createElement("pre");
    pre.className = "mermaid";
    pre.textContent = source;
    el.appendChild(pre);
  });

  container.querySelectorAll<HTMLElement>('[data-block-type="excalidrawBlock"]').forEach((el) => {
    const contentId = el.getAttribute("data-content-id") ?? "";
    const cachedSvg = visualizationSources.get(contentId)?.cachedSvg;
    if (cachedSvg) {
      el.classList.add("block-excalidraw-rendered");
      el.innerHTML = cachedSvg;
      return;
    }
    // No cached SVG → emit a styled placeholder. The editor save flow
    // will populate the cache in a follow-up commit; until then this
    // is what visitors see.
    el.classList.add("block-excalidraw-placeholder");
    el.textContent = "";
    const placeholder = jsdomDocument.createElement("div");
    placeholder.className = "block-excalidraw-placeholder-inner";
    placeholder.textContent = "Drawing — open in the app to view";
    el.appendChild(placeholder);
  });
}

function generateHTMLServer(
  doc: JSONContent,
  visualizationSources: VisualizationSourceMap,
): string {
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
    postProcessDom(container, jsdomDocument, visualizationSources);
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
    postProcessDom(container, jsdomDocument, visualizationSources);
    return container.innerHTML;
  }
}

export async function TipTapContent({ bodyJson, className }: TipTapContentProps) {
  const normalized = normalizeDoc(bodyJson);
  const visualizationSources = await fetchVisualizationSources(normalized);
  let html = "";
  try {
    html = generateHTMLServer(normalized, visualizationSources);
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
