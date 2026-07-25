/**
 * TipTap ↔ Markdown serializer (v3.2 T2 — turndown-based, self-verifying)
 *
 * Replaces the attr-sensitive regex `htmlToMarkdown` with `turndown` (a real
 * HTML→markdown converter: DOM walk, escaping, GFM) for everything markdown can
 * represent, and falls back to a verbatim `dg-block` fence for everything it
 * can't (custom/data blocks, configured nodes turndown would flatten).
 *
 * SAFETY MODEL — deny-by-default via self-verification. A block is emitted as
 * pretty markdown ONLY if, when immediately re-parsed, it round-trips
 * deep-equal to its canonical form. Any discrepancy — a dropped attribute,
 * an escaping edge turndown got wrong, an unrepresentable mark — forces a fence.
 * So loss is structurally impossible: the serializer never ships markdown it
 * can't prove reversible. Turndown is the *prettiness* layer; the fence is the
 * *correctness* floor.
 *
 * Pure of extensions-server (imports would crash tsx via code-block-lowlight):
 * extensions are injected, so the block-safety gate exercises this real code.
 */

import { generateHTML, generateJSON } from "@tiptap/core";
// Root entry has conditional exports — Turbopack resolves `browser` for the
// client bundle and `node` (zeed-dom) for the server, so this is safe in BOTH
// (unlike `@tiptap/html/server`, which is Node-only and breaks the client
// bundle). Under tsx the root mis-resolves to the browser build and would throw
// in Node — but the block-safety gate injects its own `/server` bridge, so the
// default below is loaded-but-never-called there.
import {
  generateHTML as generateHTMLServer,
  generateJSON as generateJSONServer,
} from "@tiptap/html";
import type { JSONContent, Extensions } from "@tiptap/core";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { serializeUnknownBlock, restoreDgBlocks, DG_BLOCK_PREFIX } from "./markdown-fences";
import { getBlockCodec, applyBlockReTags } from "./markdown-block-codecs";

/**
 * The TipTap HTML (de)serialization pair. Injectable so the CI gate can supply a
 * Node/tsx-safe implementation (@tiptap/html/server) without the client bundle
 * ever pulling in that Node-only entry.
 */
export interface HtmlBridge {
  toHtml(json: JSONContent, extensions: Extensions): string;
  toJson(html: string, extensions: Extensions): JSONContent;
}

// Environment-split default: native DOM in the browser, zeed-dom in Node.
const defaultBridge: HtmlBridge = {
  toHtml: (json, extensions) =>
    typeof window === "undefined"
      ? generateHTMLServer(json, extensions)
      : generateHTML(json, extensions),
  toJson: (html, extensions) =>
    (typeof window === "undefined"
      ? generateJSONServer(html, extensions)
      : generateJSON(html, extensions)) as JSONContent,
};

/**
 * Node types markdown *might* represent — candidates for the pretty path.
 * Anything else fences immediately (fast path; self-verify would fence it
 * anyway). Note: presence here is NOT a guarantee — self-verification is.
 */
const CANDIDATE_PRETTY_TYPES = new Set<string>([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "image",
  "hardBreak",
  "text",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);

let cachedTurndown: TurndownService | null = null;
function getTurndown(): TurndownService {
  cachedTurndown ??= createTurndown();
  return cachedTurndown;
}

/**
 * Build the configured turndown service.
 *
 * `Service` is injectable because turndown ships two builds that differ in how
 * they parse the HTML string: the browser one (what Turbopack bundles for the
 * client, and what the source-view toggle actually runs) uses the DOM's
 * `DOMParser`; the Node one uses domino. Our table rules walk that parsed tree,
 * so the smoke test constructs a browser-build service and asserts both agree.
 */
export function createTurndown(
  Service: typeof TurndownService = TurndownService,
): TurndownService {
  const td = new Service({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  td.use(gfm);
  // TipTap task lists render as <li data-type="taskItem" data-checked>…<label>
  // <input type=checkbox></label><div><p>text</p></div></li>. The GFM plugin's
  // rule looks for an <input> that is a direct child of <li>, so it misses this
  // (the input is nested in a <label>). Emit `- [x]/[ ]` ourselves and drop the
  // checkbox UI. Parsed back by reTagTaskLists().
  td.addRule("dgTaskItem", {
    filter: (node) =>
      node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem",
    replacement: (content, node) => {
      const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
      const text = content.replace(/\n+/g, " ").trim();
      return `- [${checked ? "x" : " "}] ${text}\n`;
    },
  });
  td.addRule("dgTaskCheckbox", {
    filter: (node) =>
      node.nodeName === "INPUT" && node.getAttribute("type") === "checkbox",
    replacement: () => "",
  });
  // TipTap tables need our own rules — the GFM plugin's don't fit its HTML:
  //   • it only converts a table whose first row is a heading row, and that test
  //     (isFirstTbody) demands <tbody> be the table's FIRST child. TipTap always
  //     renders <colgroup> ahead of <tbody> for column sizing, so EVERY TipTap
  //     table failed it and was `keep`-ed verbatim as raw HTML — the source view
  //     showed an unreadable HTML blob instead of a table you can edit as
  //     markdown, and the markdown we exported wasn't portable markdown at all.
  //   • its cell() keeps the blank lines TipTap's <p>-wrapped cell content
  //     produces (a GFM cell is one line) and never escapes `|` (a pipe in a
  //     cell silently invents a column).
  // addRule() unshifts, so these outrank both the plugin's rules and its TABLE
  // keep(). Anything we get wrong here still cannot cause loss: serializeBlock
  // only ships markdown that re-parses deep-equal, else it falls to the node's
  // own HTML (tier 2) or a verbatim fence (tier 3) — which is exactly what a
  // headerless table, merged cells, or a per-cell alignment does.
  td.remove("colgroup");
  td.addRule("dgTableCell", {
    filter: ["th", "td"],
    replacement: (content, node) => tableCell(content, node as Element),
  });
  td.addRule("dgTableRow", {
    filter: "tr",
    replacement: (content, node) => {
      const table = closestTable(node);
      if (!table || headerRowOf(table) !== node) return `\n${content}`;
      const separator = elementChildren(node as Element)
        .map((cell) => tableCell(alignmentBar(cell), cell))
        .join("");
      return `\n${content}\n${separator}`;
    },
  });
  td.addRule("dgTable", {
    filter: (node) => node.nodeName === "TABLE" && headerRowOf(node) !== null,
    // Rows already carry their own leading newline; collapse the blank lines
    // the surrounding block elements add so the grid stays contiguous.
    replacement: (content) => `\n\n${content.replace(/\n{2,}/g, "\n").trim()}\n\n`,
  });
  return td;
}

// ── GFM table helpers ────────────────────────────────────────────────────────
// Written against bare DOM primitives (childNodes/parentNode/nodeName) because
// turndown runs on the browser's DOM in the client and on its own domino DOM in
// Node — `closest`, `table.rows` and friends aren't reliably present in both.

/** Element (nodeType 1) children of `node`, in document order. */
function elementChildren(node: Node): Element[] {
  return Array.from(node.childNodes).filter(
    (child): child is Element => child.nodeType === 1,
  );
}

/** Nearest enclosing `<table>`, or null. */
function closestTable(node: Node): Element | null {
  let current: Node | null = node.parentNode;
  while (current) {
    if (current.nodeName === "TABLE") return current as Element;
    current = current.parentNode;
  }
  return null;
}

/** The table's first `<tr>` in document order (through thead/tbody/tfoot). */
function firstRowOf(table: Element): Element | null {
  for (const child of elementChildren(table)) {
    if (child.nodeName === "TR") return child;
    if (child.nodeName === "THEAD" || child.nodeName === "TBODY" || child.nodeName === "TFOOT") {
      const row = elementChildren(child).find((n) => n.nodeName === "TR");
      if (row) return row;
    }
  }
  return null;
}

/**
 * The table's header row, or null when it has none. GFM has no way to express a
 * headerless table, so those keep falling through to the raw-HTML tier.
 */
function headerRowOf(table: Element): Element | null {
  const row = firstRowOf(table);
  if (!row) return null;
  const cells = elementChildren(row);
  const allHeaders = cells.length > 0 && cells.every((cell) => cell.nodeName === "TH");
  return allHeaders ? row : null;
}

/** `---` / `:--` / `--:` / `:-:` for the separator row, per the cell's align. */
function alignmentBar(cell: Element): string {
  switch ((cell.getAttribute("align") || "").toLowerCase()) {
    case "left":
      return ":--";
    case "right":
      return "--:";
    case "center":
      return ":-:";
    default:
      return "---";
  }
}

/**
 * One GFM cell. Flattens to a single line (TipTap wraps cell content in <p>,
 * and a multi-block cell has no GFM form — flattening lets self-verification
 * catch it and fence the table rather than quietly reshaping it) and escapes
 * pipes so cell text can never invent a column.
 */
function tableCell(content: string, node: Element): string {
  const text = content.trim().replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|");
  const first = node.parentNode ? elementChildren(node.parentNode)[0] === node : false;
  return `${first ? "| " : " "}${text} |`;
}

/**
 * Reconstruct TipTap task lists from marked's checkbox HTML. marked emits
 * `<ul><li><input type=checkbox[ checked]> text</li>`, which generateJSON would
 * parse as a plain bullet list (the checked state lost). Re-tag it into the
 * `data-type="taskList"` / `data-type="taskItem" data-checked` shape TipTap's
 * TaskList/TaskItem parseHTML expects. Self-verification fences anything this
 * gets wrong, so it can only add prettiness, never risk loss.
 */
function reTagTaskLists(html: string): string {
  const withItems = html.replace(
    /<li[^>]*>\s*<input([^>]*?)type="checkbox"([^>]*?)>\s*([\s\S]*?)<\/li>/gi,
    (_m, pre: string, post: string, body: string) => {
      const checked = /\bchecked\b/i.test(pre) || /\bchecked\b/i.test(post);
      return `<li data-type="taskItem" data-checked="${checked}"><p>${body.trim()}</p></li>`;
    },
  );
  return withItems.replace(
    /<ul>(\s*<li data-type="taskItem")/gi,
    '<ul data-type="taskList">$1',
  );
}

const canon = (v: unknown): string => JSON.stringify(v);

/** Schema-canonical single-block form (what the editor would store). */
function canonicalBlock(
  block: JSONContent,
  extensions: Extensions,
  bridge: HtmlBridge,
): JSONContent | undefined {
  const html = bridge.toHtml({ type: "doc", content: [block] }, extensions);
  return (bridge.toJson(html, extensions).content ?? [])[0];
}

/** Does re-parsing `segment` yield a block deep-equal to `canonical`? */
function roundTripsTo(
  segment: string,
  canonical: JSONContent,
  extensions: Extensions,
  bridge: HtmlBridge,
): boolean {
  const reBlock = (markdownToTiptapRich(segment, extensions, bridge).content ?? [])[0];
  return !!reBlock && canon(reBlock) === canon(canonical);
}

/**
 * Serialize one top-level block through the tiered ladder, each rung gated by
 * self-verification (deny-by-default — a rung is used only if it round-trips
 * deep-equal, else we fall to the next):
 *
 *   Tier 1  pretty markdown (turndown)  — everything markdown can express
 *   Tier 2  the node's own HTML         — config markdown can't (image
 *                                          width/align, text alignment,
 *                                          underline/highlight, link attrs);
 *                                          lossless via TipTap's parseHTML,
 *                                          human-readable, marked passes it
 *                                          through
 *   Tier 3  opaque base64 dg-block fence — verbatim; data-bearing / custom
 *                                          blocks whose HTML isn't faithful
 */
function serializeBlock(
  block: JSONContent,
  extensions: Extensions,
  bridge: HtmlBridge,
): string {
  // North-star codec (custom-block pretty syntax, e.g. callout → "> [!note]").
  // Tried first for any block type that registers one; used only if it
  // round-trips, else falls through to the fence.
  const codec = getBlockCodec(typeof block.type === "string" ? block.type : undefined);
  if (codec) {
    try {
      const canonical = canonicalBlock(block, extensions, bridge);
      if (canonical) {
        const md = codec.toMarkdown(block, (nodes) =>
          tiptapToMarkdownRich({ type: "doc", content: nodes }, extensions, bridge),
        );
        if (md && roundTripsTo(md, canonical, extensions, bridge)) return md;
      }
    } catch {
      /* fall through to fence */
    }
  }

  // Custom / data blocks (no working codec) go straight to the fence — their
  // HTML may be a lossy placeholder, and base64 keeps them opaque-and-safe.
  if (typeof block.type !== "string" || !CANDIDATE_PRETTY_TYPES.has(block.type)) {
    return serializeUnknownBlock(block);
  }

  let html: string;
  let canonical: JSONContent | undefined;
  try {
    html = bridge.toHtml({ type: "doc", content: [block] }, extensions);
    canonical = canonicalBlock(block, extensions, bridge);
  } catch {
    return serializeUnknownBlock(block);
  }
  if (!html || !canonical) return serializeUnknownBlock(block);

  // Tier 1 — pretty markdown.
  try {
    const md = getTurndown().turndown(html).trim();
    if (md && roundTripsTo(md, canonical, extensions, bridge)) return md;
  } catch {
    /* fall through */
  }

  // Tier 2 — the node's own HTML, for config markdown can't express.
  try {
    const htmlBlock = html.trim();
    if (htmlBlock && roundTripsTo(htmlBlock, canonical, extensions, bridge)) {
      return htmlBlock;
    }
  } catch {
    /* fall through */
  }

  // Tier 3 — verbatim fence.
  return serializeUnknownBlock(block);
}

/** TipTap doc → markdown. Pretty where provable, fenced where not. */
export function tiptapToMarkdownRich(
  doc: JSONContent,
  extensions: Extensions,
  bridge: HtmlBridge = defaultBridge,
): string {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return "";
  return doc.content
    .map((block) => serializeBlock(block, extensions, bridge))
    .filter((seg) => seg.length > 0)
    .join("\n\n");
}

// ── Parse: markdown → TipTap ─────────────────────────────────────────────────

/** Generate a fresh unique blockId for a de-duplicated (copied) fence. */
function freshBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `blk-${crypto.randomUUID()}`;
  }
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * De-duplicate blockIds after restore. If a user copies a `dg-block` fence in
 * source view, two nodes decode with the same blockId — a collision (for
 * data-bearing blocks, a shared Y.js sub-map). Re-id the duplicate so the two
 * can never share state; the copy is preserved, the collision neutralized.
 */
function dedupeBlockIds(doc: JSONContent): JSONContent {
  const seen = new Set<string>();
  const walk = (node: JSONContent): void => {
    const attrs = node.attrs as { blockId?: unknown } | undefined;
    if (attrs && typeof attrs.blockId === "string" && attrs.blockId) {
      if (seen.has(attrs.blockId)) {
        attrs.blockId = freshBlockId();
      } else {
        seen.add(attrs.blockId);
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return doc;
}

/**
 * marked appends a trailing newline to fenced/indented code content (the
 * newline before the closing ``` is the delimiter, not content). Strip one
 * trailing "\n" from parsed code blocks so a code block round-trips — this is
 * correct CommonMark semantics, not a round-trip hack. Skips dg-block fence
 * carriers (their base64 is decoded verbatim by restoreDgBlocks anyway).
 */
function normalizeCodeBlocks(doc: JSONContent): void {
  const walk = (node: JSONContent): void => {
    if (node.type === "codeBlock") {
      const first = node.content?.[0];
      if (
        first &&
        first.type === "text" &&
        typeof first.text === "string" &&
        first.text.endsWith("\n") &&
        !first.text.startsWith(DG_BLOCK_PREFIX)
      ) {
        first.text = first.text.slice(0, -1);
        if (first.text === "") node.content = [];
      }
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
}

/**
 * Markdown → TipTap. marked → HTML → generateJSON, normalize code blocks,
 * restore dg-block fences and de-dupe blockIds. Used as both the runtime parse
 * AND the serializer's self-verification oracle, so serialize and parse can
 * never disagree.
 */
export function markdownToTiptapRich(
  markdown: string,
  extensions: Extensions,
  bridge: HtmlBridge = defaultBridge,
): JSONContent {
  const html = applyBlockReTags(
    reTagTaskLists(marked.parse(markdown, { async: false, gfm: true }) as string),
  );
  const json = bridge.toJson(html, extensions);
  normalizeCodeBlocks(json);
  return dedupeBlockIds(restoreDgBlocks(json).json);
}
