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
      return {
        title: article.title ?? null,
        byline: article.byline ?? null,
        siteName: article.siteName ?? null,
        publishedTime: article.publishedTime ?? null,
        excerpt: article.excerpt ?? null,
        content: text,
        quality: "readable",
      };
    }
  } catch {
    // jsdom can throw on hostile markup — fall through to the raw path.
  }

  return {
    title: null,
    byline: null,
    siteName: null,
    publishedTime: null,
    excerpt: null,
    content: stripTags(html),
    quality: "raw",
  };
}
