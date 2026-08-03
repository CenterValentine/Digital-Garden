/**
 * Scoped page extraction for the content script (BROWSER-REACH B2).
 *
 * Runs in the page's world with live DOM access. Three scopes, driven by the
 * side-panel context bar:
 *
 *   selection — what the user has highlighted (their explicit "read this")
 *   viewport  — elements currently on screen (what they're looking at)
 *   full      — the whole readable article (Readability, innerText fallback)
 *
 * Returns the same envelope shape the app's Acquisition Service uses
 * (lib/domain/ai/acquisition/extract.ts → ExtractedPage), so page context
 * captured in the browser and content fetched server-side are one contract:
 *   { title, byline, siteName, excerpt, content, quality, scope, url }
 *
 * `quality`: "readable" (Readability found an article), "raw" (fell back to
 * innerText/selection), "empty" (nothing extractable). Callers can escalate.
 */

import { Readability, isProbablyReaderable } from "@mozilla/readability";

const MAX_CHARS = 100_000;
// Minimum text inside a <main>/[role=main]/<article> landmark before we trust
// it over the full body — avoids returning an empty shell's stray label.
const MAIN_LANDMARK_MIN_CHARS = 200;

function normalize(text) {
  return (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}

function baseMeta() {
  const meta = (name) =>
    document
      .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.getAttribute("content") || null;
  return {
    title: document.title || meta("og:title") || null,
    byline: meta("author") || meta("article:author"),
    siteName: meta("og:site_name"),
    excerpt: meta("description") || meta("og:description"),
    url: location.href,
  };
}

function extractSelection() {
  const selection = window.getSelection();
  const text = normalize(selection ? selection.toString() : "");
  if (!text) return null;
  return { ...baseMeta(), content: text, quality: "raw", scope: "selection" };
}

function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  // Any vertical overlap with the viewport, with real size.
  return (
    rect.bottom > 0 &&
    rect.top < vh &&
    rect.right > 0 &&
    rect.left < vw &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function extractViewport() {
  // Text-bearing blocks intersecting the viewport, in document order. Skips
  // scripts/styles/nav chrome so the model sees content, not the furniture.
  const blocks = document.querySelectorAll(
    "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, figcaption, article, section"
  );
  const seen = new Set();
  const parts = [];
  for (const el of blocks) {
    if (!isInViewport(el)) continue;
    if (el.closest("script, style, noscript, nav, header, footer, aside"))
      continue;
    const text = el.innerText?.trim();
    if (!text || text.length < 2 || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  const content = normalize(parts.join("\n\n"));
  if (!content) return null;
  return { ...baseMeta(), content, quality: "raw", scope: "viewport" };
}

function extractFull() {
  const meta = baseMeta();
  // Readability mutates the document it parses, so hand it a clone.
  try {
    if (isProbablyReaderable(document)) {
      const article = new Readability(
        document.cloneNode(true)
      ).parse();
      if (article?.textContent?.trim()) {
        return {
          title: article.title || meta.title,
          byline: article.byline || meta.byline,
          siteName: article.siteName || meta.siteName,
          excerpt: article.excerpt || meta.excerpt,
          url: meta.url,
          content: normalize(article.textContent),
          quality: "readable",
          scope: "full",
        };
      }
    }
  } catch {
    // Fall through to landmark / raw innerText.
  }
  // Non-article / SPA pages: Readability often won't classify an app shell as
  // readerable, but the real content still lives inside the page's main
  // landmark. Prefer it over the whole body so nav/header/footer chrome (and
  // language pickers, cookie bars, etc.) don't drown the signal.
  try {
    const landmark = document.querySelector("main, [role='main'], article");
    const landmarkText = landmark
      ? normalize(landmark.innerText || landmark.textContent || "")
      : "";
    if (landmarkText.length >= MAIN_LANDMARK_MIN_CHARS) {
      return { ...meta, content: landmarkText, quality: "raw", scope: "full" };
    }
  } catch {
    // Fall through to full-body innerText.
  }
  const content = normalize(
    document.body?.innerText || document.body?.textContent || ""
  );
  return {
    ...meta,
    content,
    quality: content ? "raw" : "empty",
    scope: "full",
  };
}

/** Extract for a scope; falls back to full-page when the scope yields nothing. */
export function extractContent(scope = "full") {
  if (scope === "selection") {
    return extractSelection() || extractFull();
  }
  if (scope === "viewport") {
    return extractViewport() || extractFull();
  }
  return extractFull();
}
