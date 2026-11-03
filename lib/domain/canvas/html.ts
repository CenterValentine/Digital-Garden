/**
 * Canvas archive — making imported HTML stand on its own (§6.3).
 *
 * Canvas pages link to each other and embed images by Canvas URL. Outside
 * Canvas those URLs need a login that will eventually stop working, so:
 *   - a link to something this import brought in becomes a wiki-link to the
 *     imported node (`[[Lipid Bilayers]]`), so the archive links to itself;
 *   - a Canvas link we couldn't bring in stays a link, marked "(not imported)";
 *   - an image we stored points at our copy; one we couldn't store leaves a
 *     visible "[image not captured: …]" — a gap the user can see, never a
 *     broken picture (principle 2: gaps are data);
 *   - embedded iframes (video players, LTI tools) become a marked link.
 *
 * Pure string work over Canvas's well-formed HTML; TipTap parses the result.
 * Pinned by `pnpm canvas:check`.
 */

export interface CanvasRefResolver {
  /** The refKey ("page:<slug>", "file:<id>" …) a URL points at, or null. */
  refKeyOf(url: string): string | null;
  /** Canvas-internal URLs only work inside Canvas, resolved or not. */
  isInternal(url: string): boolean;
  /** An absolute URL for an internal link we keep (relative paths need the host). */
  absolute(url: string): string;
}

export interface RefTarget {
  contentId: string;
  title: string;
}

export interface RewriteInput {
  html: string;
  resolver: CanvasRefResolver;
  /** refKey → the imported node it became. */
  targets: ReadonlyMap<string, RefTarget>;
  /** Image src (decoded) → the stored file node holding it. */
  images: ReadonlyMap<string, string>;
}

export interface RewriteResult {
  html: string;
  unresolvedLinks: string[];
  unresolvedImages: string[];
  droppedEmbeds: string[];
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITY[code.toLowerCase()] ?? whole;
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function fileNameOf(url: string): string {
  const path = url.split(/[?#]/)[0];
  const last = path.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Every `<img src>` in the HTML, decoded, in order (duplicates removed). */
export function listImageSources(html: string): string[] {
  const sources: string[] = [];
  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const src = attr(match[1], "src");
    if (src && !sources.includes(src)) sources.push(src);
  }
  return sources;
}

/** The durable in-app URL for a stored file (survives presigned-URL expiry). */
export function storedFileSrc(contentId: string): string {
  return `/api/content/content/${contentId}/download?stream=true`;
}

export function wikiLinkHtml(target: RefTarget, displayText: string): string {
  const text = displayText.trim() || target.title;
  const display = text !== target.title ? ` data-display-text="${escapeHtml(text)}"` : "";
  return `<span data-type="wiki-link" data-target-id="${escapeHtml(target.contentId)}" data-target-title="${escapeHtml(target.title)}"${display}>${escapeHtml(text)}</span>`;
}

export function rewriteCanvasHtml(input: RewriteInput): RewriteResult {
  const { resolver, targets, images } = input;
  const unresolvedLinks: string[] = [];
  const unresolvedImages: string[] = [];
  const droppedEmbeds: string[] = [];

  let html = input.html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");

  // Links before embeds: an embed becomes a link of its own, already marked,
  // and must not be marked a second time as an unimported page.
  html = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs: string, inner: string) => {
    const href = attr(attrs, "href");
    if (!href || href.startsWith("#") || /^(mailto|tel):/i.test(href)) return whole;
    const refKey = resolver.refKeyOf(href);
    const target = refKey ? targets.get(refKey) : undefined;
    // A link wrapping an image keeps its <a>; the image pass handles the picture.
    if (target && !/<img\b/i.test(inner)) return wikiLinkHtml(target, textOf(inner));
    if (!target && resolver.isInternal(href)) {
      unresolvedLinks.push(href);
      return `<a href="${escapeHtml(resolver.absolute(href))}">${inner}</a> <em>(not imported)</em>`;
    }
    return whole;
  });

  html = html.replace(/<iframe\b([^>]*)>(?:[\s\S]*?<\/iframe>)?/gi, (_whole, attrs: string) => {
    const src = attr(attrs, "src") ?? "";
    const title = attr(attrs, "title") ?? "Embedded content";
    droppedEmbeds.push(src || title);
    const href = src && resolver.isInternal(src) ? resolver.absolute(src) : src;
    return href
      ? `<a href="${escapeHtml(href)}">${escapeHtml(title)}</a> <em>(embedded content not captured)</em>`
      : `<em>[${escapeHtml(title)} — embedded content not captured]</em>`;
  });

  html = html.replace(/<img\b([^>]*)>/gi, (whole, attrs: string) => {
    const src = attr(attrs, "src");
    if (!src) return "";
    const alt = attr(attrs, "alt") ?? "";
    const stored = images.get(src);
    if (stored) {
      return `<img src="${storedFileSrc(stored)}" data-content-id="${escapeHtml(stored)}" alt="${escapeHtml(alt)}">`;
    }
    if (resolver.isInternal(src)) {
      unresolvedImages.push(src);
      return `<em>[image not captured: ${escapeHtml(alt || fileNameOf(src) || "image")}]</em>`;
    }
    return whole;
  });

  return { html, unresolvedLinks, unresolvedImages, droppedEmbeds };
}
