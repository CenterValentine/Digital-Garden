/**
 * Wiki-link ⇄ markdown grammar (pure — no TipTap, no DOM).
 *
 * One reference, two shapes:
 *
 *   [[Title]]            inline link      (wikiLink node, view "link")
 *   [[Title|alias]]      inline link with display text
 *   [[#Heading]]         in-document heading link
 *   [[Title#^kind:id]]   anchored link (lib/domain/content/link-anchor.ts)
 *   ![[Title]]           the note WINDOWED in place (noteWindow block) —
 *                        Obsidian's transclusion syntax, which is what a
 *                        window is
 *
 * Markdown cannot say what the editor must remember — the rename-durable
 * target id, the chosen display, a window's height — so those ride in a
 * pandoc-style attribute brace straight after the link, the same grammar
 * heading folds already use (`## Title {.collapsed}`):
 *
 *   [[Title]]{#3f2a…}                 target id (always emitted when known)
 *   [[Title]]{#3f2a… .card}           display: .chip / .card (link = none)
 *   [[Title]]{.no-context}            per-link context-expansion opt-out
 *   [[Title#^annotation:x]]{label="…"} anchor label (quoted, \" and \\ escaped)
 *   [[#Heading]]{slug=heading-2}      only when the stored slug differs from
 *                                     the one derived from the text
 *   ![[Title]]{#3f2a… block=blk-… height=300 .no-border view=… row=…}
 *
 * Defaults are omitted so the common link reads as plain `[[Title]]{#id}`.
 * Everything here is used by BOTH halves of the lossless system — the
 * turndown rules that write it and the codec reTags that read it — so the
 * two can never disagree. A title this grammar cannot carry (brackets,
 * braces, a pipe, a newline) makes the serializer DECLINE: the paragraph
 * falls to the HTML tier, lossless and merely less pretty.
 */

import { slugifyHeading } from "./heading-ids";

/** Inline displays a wikiLink node can take. The window is the block shape. */
export const WIKI_LINK_INLINE_VIEWS = ["link", "chip", "card"] as const;
export type WikiLinkInlineView = (typeof WIKI_LINK_INLINE_VIEWS)[number];
export const DEFAULT_WIKI_LINK_VIEW: WikiLinkInlineView = "link";

export function isWikiLinkInlineView(value: unknown): value is WikiLinkInlineView {
  return (WIKI_LINK_INLINE_VIEWS as readonly unknown[]).includes(value);
}

/** The wikiLink node's attrs, as stored (all optional; null = default). */
export interface WikiLinkMarkdownAttrs {
  targetId?: string | null;
  targetTitle?: string | null;
  displayText?: string | null;
  headingSlug?: string | null;
  anchor?: string | null;
  anchorLabel?: string | null;
  /** null = expand (default); only `false` is ever stored. */
  expand?: boolean | null;
  /** null = "link". */
  view?: string | null;
}

/** The noteWindow block's attrs that the markdown form carries. */
export interface NoteWindowMarkdownAttrs {
  blockId?: string | null;
  targetContentId?: string | null;
  targetTitle?: string | null;
  targetViewId?: string | null;
  targetRowId?: string | null;
  height?: number | null;
  showBorder?: boolean | null;
}

export const NOTE_WINDOW_DEFAULT_HEIGHT = 245;

// ── Brace attribute list: {#id .class key=value key="quoted"} ───────────────

interface BraceAttrs {
  id: string | null;
  classes: string[];
  values: Record<string, string>;
}

function quoteValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A value that can stand unquoted: no whitespace, quotes, braces or `=`. */
function bareValue(value: string): string {
  return /^[^\s"'{}=]+$/.test(value) ? value : quoteValue(value);
}

function formatBrace(attrs: BraceAttrs): string {
  const parts: string[] = [];
  if (attrs.id) parts.push(`#${attrs.id}`);
  for (const cls of attrs.classes) parts.push(`.${cls}`);
  for (const [key, value] of Object.entries(attrs.values)) {
    parts.push(`${key}=${bareValue(value)}`);
  }
  return parts.length ? `{${parts.join(" ")}}` : "";
}

/**
 * Parse the inside of a brace. Returns null on anything malformed, so a
 * stray `{…}` after a link is left alone rather than half-applied.
 */
function parseBrace(body: string): BraceAttrs | null {
  const out: BraceAttrs = { id: null, classes: [], values: {} };
  let i = 0;
  const n = body.length;
  while (i < n) {
    const ch = body[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "#" || ch === ".") {
      let j = i + 1;
      while (j < n && !/\s/.test(body[j])) j++;
      const token = body.slice(i + 1, j);
      if (!token) return null;
      if (ch === "#") out.id = token;
      else out.classes.push(token);
      i = j;
      continue;
    }
    // key=value
    let j = i;
    while (j < n && /[A-Za-z0-9_-]/.test(body[j])) j++;
    const key = body.slice(i, j);
    if (!key || body[j] !== "=") return null;
    j++;
    if (body[j] === '"') {
      let value = "";
      j++;
      let closed = false;
      while (j < n) {
        const c = body[j];
        if (c === "\\" && j + 1 < n) {
          value += body[j + 1];
          j += 2;
          continue;
        }
        if (c === '"') {
          closed = true;
          j++;
          break;
        }
        value += c;
        j++;
      }
      if (!closed) return null;
      out.values[key] = value;
    } else {
      let k = j;
      while (k < n && !/\s/.test(body[k])) k++;
      const value = body.slice(j, k);
      if (!value) return null;
      out.values[key] = value;
      j = k;
    }
    i = j;
  }
  return out;
}

// ── Markdown text escaping ──────────────────────────────────────────────────

/**
 * Characters a title can carry only by declining (the grammar itself uses
 * them). `#^` is the anchor marker inside the brackets.
 */
function titleIsRepresentable(title: string): boolean {
  return !/[\[\]{}|\n\r]/.test(title) && !title.includes("#^");
}

function displayIsRepresentable(display: string): boolean {
  return !/[\[\]{}\n\r]/.test(display);
}

/**
 * Backslash-escape the inline markdown metacharacters marked would
 * otherwise interpret inside the brackets (`*`, `_`, `` ` ``, `~`, `\`).
 * marked turns `\*` back into `*`, so the reTag sees the literal title.
 */
function escapeInline(text: string): string {
  return text.replace(/[\\*_`~]/g, (m) => `\\${m}`);
}

// ── HTML helpers (the reTag side rewrites marked's HTML) ────────────────────

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Inline wikiLink ─────────────────────────────────────────────────────────

/**
 * `[[…]]{…}` for a wikiLink node, or null when the attrs cannot be
 * expressed (the caller falls through to the next tier).
 */
export function wikiLinkToMarkdown(attrs: WikiLinkMarkdownAttrs): string | null {
  const title = (attrs.targetTitle ?? "").trim();
  if (!title || !titleIsRepresentable(title)) return null;
  // A title that opens with `#` would re-parse as a heading link.
  if (!attrs.headingSlug && title.startsWith("#")) return null;
  if (attrs.headingSlug && attrs.anchor) return null;
  const display = attrs.displayText?.trim() || null;
  if (display && !displayIsRepresentable(display)) return null;
  if (attrs.anchor && /[\s\]{}|]/.test(attrs.anchor)) return null;

  const body =
    `${attrs.headingSlug ? "#" : ""}${escapeInline(title)}` +
    `${attrs.anchor ? `#^${attrs.anchor}` : ""}` +
    `${display ? `|${escapeInline(display)}` : ""}`;

  const brace: BraceAttrs = { id: attrs.targetId || null, classes: [], values: {} };
  const view = attrs.view || null;
  if (view && view !== DEFAULT_WIKI_LINK_VIEW) {
    if (isWikiLinkInlineView(view)) brace.classes.push(view);
    else brace.values.view = view;
  }
  if (attrs.expand === false) brace.classes.push("no-context");
  if (attrs.headingSlug && attrs.headingSlug !== (slugifyHeading(title) || "heading")) {
    brace.values.slug = attrs.headingSlug;
  }
  if (attrs.anchorLabel) brace.values.label = attrs.anchorLabel;

  return `[[${body}]]${formatBrace(brace)}`;
}

/**
 * Attrs for a `[[body]]` + optional brace, as the reTag finds them in
 * marked's HTML (entities decoded here). Null when the brace is malformed.
 */
export function parseWikiLinkMarkdown(
  rawBody: string,
  rawBrace: string | null,
): WikiLinkMarkdownAttrs | null {
  const body = decodeHtmlEntities(rawBody);
  const brace = rawBrace ? parseBrace(decodeHtmlEntities(rawBrace.slice(1, -1))) : { id: null, classes: [], values: {} };
  if (!brace) return null;

  const pipeAt = body.indexOf("|");
  const target = (pipeAt >= 0 ? body.slice(0, pipeAt) : body).trim();
  const display = pipeAt >= 0 ? body.slice(pipeAt + 1).trim() : "";
  if (!target) return null;

  const attrs: WikiLinkMarkdownAttrs = {};
  const anchorAt = target.indexOf("#^");
  if (anchorAt > 0) {
    attrs.targetTitle = target.slice(0, anchorAt).trim();
    attrs.anchor = target.slice(anchorAt + 2).trim();
    if (!attrs.targetTitle || !attrs.anchor) return null;
  } else if (target.startsWith("#")) {
    const headingText = target.slice(1).trim();
    if (!headingText) return null;
    attrs.targetTitle = headingText;
    attrs.headingSlug = brace.values.slug || slugifyHeading(headingText) || "heading";
  } else {
    attrs.targetTitle = target;
  }
  if (display) attrs.displayText = display;
  if (brace.id) attrs.targetId = brace.id;
  const viewClass = brace.classes.find((c) => isWikiLinkInlineView(c) && c !== DEFAULT_WIKI_LINK_VIEW);
  if (viewClass) attrs.view = viewClass;
  else if (brace.values.view) attrs.view = brace.values.view;
  if (brace.classes.includes("no-context")) attrs.expand = false;
  if (brace.values.label) attrs.anchorLabel = brace.values.label;
  return attrs;
}

/** The `<span data-type="wiki-link" …>` TipTap's wikiLink parseHTML reads. */
export function wikiLinkAttrsToHtml(attrs: WikiLinkMarkdownAttrs): string {
  const data: Array<[string, string]> = [];
  if (attrs.targetId) data.push(["data-target-id", attrs.targetId]);
  if (attrs.targetTitle) data.push(["data-target-title", attrs.targetTitle]);
  if (attrs.displayText) data.push(["data-display-text", attrs.displayText]);
  if (attrs.headingSlug) data.push(["data-heading-slug", attrs.headingSlug]);
  if (attrs.anchor) data.push(["data-anchor", attrs.anchor]);
  if (attrs.anchorLabel) data.push(["data-anchor-label", attrs.anchorLabel]);
  if (attrs.expand === false) data.push(["data-expand", "false"]);
  if (attrs.view && attrs.view !== DEFAULT_WIKI_LINK_VIEW) data.push(["data-view", attrs.view]);
  const attrText = data.map(([k, v]) => ` ${k}="${escapeHtmlAttr(v)}"`).join("");
  const label = attrs.displayText || attrs.targetTitle || "";
  return `<span data-type="wiki-link"${attrText}>${escapeHtmlText(label)}</span>`;
}

/**
 * Matches `[[body]]` with an optional brace, but not `![[…]]` (the window
 * form, handled by the block codec). Groups: body, brace (with braces).
 */
export const WIKI_LINK_MARKDOWN_RE = /(?<!!)\[\[([^\[\]\n]+?)\]\](\{[^{}\n]*\})?/g;

/** Matches a window on its own paragraph in marked's HTML. */
export const NOTE_WINDOW_MARKDOWN_RE = /<p>!\[\[([^\[\]\n]+?)\]\](\{[^{}\n]*\})?<\/p>/g;

// ── noteWindow block ────────────────────────────────────────────────────────

/** `![[Title]]{…}` for a noteWindow, or null when it cannot be expressed. */
export function noteWindowToMarkdown(attrs: NoteWindowMarkdownAttrs): string | null {
  const title = (attrs.targetTitle ?? "").trim();
  if (!title || !titleIsRepresentable(title) || title.startsWith("#")) return null;
  // An unassigned window has nothing to say in markdown.
  if (!attrs.targetContentId) return null;

  const brace: BraceAttrs = { id: attrs.targetContentId, classes: [], values: {} };
  if (attrs.blockId) brace.values.block = attrs.blockId;
  if (typeof attrs.height === "number" && attrs.height !== NOTE_WINDOW_DEFAULT_HEIGHT) {
    brace.values.height = String(attrs.height);
  }
  if (attrs.showBorder === false) brace.classes.push("no-border");
  if (attrs.targetViewId) brace.values.view = attrs.targetViewId;
  if (attrs.targetRowId) brace.values.row = attrs.targetRowId;
  return `![[${escapeInline(title)}]]${formatBrace(brace)}`;
}

/** Attrs for a `![[body]]` + optional brace found in marked's HTML. */
export function parseNoteWindowMarkdown(
  rawBody: string,
  rawBrace: string | null,
): NoteWindowMarkdownAttrs | null {
  const title = decodeHtmlEntities(rawBody).trim();
  if (!title || title.includes("|") || title.includes("#^")) return null;
  const brace = rawBrace ? parseBrace(decodeHtmlEntities(rawBrace.slice(1, -1))) : { id: null, classes: [], values: {} };
  if (!brace) return null;
  const attrs: NoteWindowMarkdownAttrs = { targetTitle: title };
  if (brace.id) attrs.targetContentId = brace.id;
  if (brace.values.block) attrs.blockId = brace.values.block;
  if (brace.values.height) {
    const h = Number(brace.values.height);
    if (Number.isFinite(h)) attrs.height = h;
  }
  if (brace.classes.includes("no-border")) attrs.showBorder = false;
  if (brace.values.view) attrs.targetViewId = brace.values.view;
  if (brace.values.row) attrs.targetRowId = brace.values.row;
  return attrs;
}

/** The `<div data-block-type="noteWindow" …>` the block's parseHTML reads. */
export function noteWindowAttrsToHtml(attrs: NoteWindowMarkdownAttrs): string {
  const data: Array<[string, string]> = [["data-block-type", "noteWindow"]];
  if (attrs.blockId) data.push(["data-block-id", attrs.blockId]);
  if (attrs.targetContentId) data.push(["data-target-content-id", attrs.targetContentId]);
  if (attrs.targetTitle) data.push(["data-target-title", attrs.targetTitle]);
  if (attrs.targetViewId) data.push(["data-target-view-id", attrs.targetViewId]);
  if (attrs.targetRowId) data.push(["data-target-row-id", attrs.targetRowId]);
  if (typeof attrs.height === "number") data.push(["data-height", String(attrs.height)]);
  if (attrs.showBorder === false) data.push(["data-show-border", "false"]);
  const attrText = data.map(([k, v]) => ` ${k}="${escapeHtmlAttr(v)}"`).join("");
  return `<div${attrText}></div>`;
}
