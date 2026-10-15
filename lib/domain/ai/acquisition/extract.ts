/**
 * Readable-content extraction (AI v3 core S2).
 *
 * Readability (Firefox Reader View engine) over jsdom, dynamically imported
 * so the chat route's cold path doesn't pay for jsdom until a page is
 * actually acquired. Falls back to tag-stripping when Readability can't
 * find an article body (search results, dashboards, thin pages) — callers
 * see which path ran via `quality` and can escalate to a session provider.
 */

import type { ExtractionQuality } from "./types";

export interface ExtractedPage {
  title: string | null;
  byline: string | null;
  siteName: string | null;
  publishedTime: string | null;
  excerpt: string | null;
  content: string;
  quality: ExtractionQuality;
  /** See `AcquiredContent.contentNote` — set when the body is navigation chrome. */
  contentNote?: string;
}

/** The note consumers relay when the body is chrome, not content. */
export const CHROME_ONLY_NOTE =
  "The fetched body is navigation chrome (lists of short links — menus, 'similar' items, footers), NOT the page's main content. Sites like LinkedIn serve the main text only to signed-in sessions. Treat this as NOT having read the page's main text.";

/**
 * Line-shape heuristic for a body that is a link list rather than prose
 * (ITERATION-RUN-HARNESS-FIXES P7, prod 2026-09-27: LinkedIn's anonymous
 * job page yielded 4 KB of "Similar jobs" titles that cleared every length
 * gate and was read as the posting). Prose has sentences; chrome has many
 * short lines and no long one. Deliberately not a site list — site lists
 * rot, the shape of a link list does not. Pinned by the run-harness gate.
 */
export function looksLikeNavigationChrome(text: string): boolean {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 15) return false;
  const words = lines.map((l) => l.split(/\s+/).length);
  const sorted = [...words].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const shortShare = words.filter((n) => n <= 6).length / lines.length;
  const longest = Math.max(...lines.map((l) => l.length));
  return median <= 4 && shortShare >= 0.75 && longest <= 120;
}

function withChromeNote(page: ExtractedPage): ExtractedPage {
  if (!looksLikeNavigationChrome(page.content)) return page;
  // Chrome is never a clean article, whatever Readability believed.
  return { ...page, quality: "raw", contentNote: CHROME_ONLY_NOTE };
}

/** Collapse runs of blank lines / spaces while preserving paragraph breaks. */
function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(html: string): string {
  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"'),
  );
}

export async function extractReadableContent(
  html: string,
  url: string,
): Promise<ExtractedPage> {
  try {
    const [{ JSDOM }, { Readability }] = await Promise.all([
      import("jsdom"),
      import("@mozilla/readability"),
    ]);
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const text = article?.textContent ? normalizeText(article.textContent) : "";
    if (article && text.length > 0) {
      return withChromeNote({
        title: article.title ?? null,
        byline: article.byline ?? null,
        siteName: article.siteName ?? null,
        publishedTime: article.publishedTime ?? null,
        excerpt: article.excerpt ?? null,
        content: text,
        quality: "readable",
      });
    }
  } catch {
    // jsdom can throw on hostile markup — fall through to the raw path.
  }

  return withChromeNote({
    title: null,
    byline: null,
    siteName: null,
    publishedTime: null,
    excerpt: null,
    content: stripTags(html),
    quality: "raw",
  });
}
