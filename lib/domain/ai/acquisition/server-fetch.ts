/**
 * P1 server-fetch provider (AI v3 core S2).
 *
 * Static acquisition: plain server-side fetch + Readability extraction.
 * Covers most job boards, docs, and articles. JS-rendered or bot-hostile
 * pages need the extension's session providers (P2/P3, BROWSER-REACH via
 * seam contract C1) — this provider reports thin results honestly via
 * `extraction: "raw"` so callers can escalate.
 */

import { extractReadableContent } from "./extract";
import type { AcquireRequest, AcquiredContent } from "./types";

export const SERVER_FETCH_PROVIDER_ID = "server-fetch";

const FETCH_TIMEOUT_MS = 15_000;
/** Reject absurd payloads before parsing (jsdom cost scales with input). */
const MAX_HTML_CHARS = 1_500_000;
/**
 * Default envelope content cap ≈ 4k tokens. Deliberately tight: tool
 * results ride EVERY subsequent step of an agent loop, so this number is
 * the dominant per-step token term — 40k chars at 30k-TPM orgs meant ~3
 * steps/minute before rate exhaustion (observed in the S4 smoke). A job
 * posting or article body fits comfortably; callers may override upward,
 * and the full content is in the garden snapshot when hydration matched.
 */
const DEFAULT_MAX_CONTENT_CHARS = 16_000;

const ACCEPTED_CONTENT_TYPES = ["text/html", "application/xhtml", "text/plain"];

/**
 * Statuses that anti-bot layers emit intermittently for legitimate pages
 * (GitHub has been observed returning 404 under burst). One retry after a
 * short pause resolves most of them; a real 404 just 404s again.
 */
const RETRYABLE_STATUSES = new Set([404, 429, 500, 502, 503]);
const RETRY_DELAY_MS = 1200;

async function fetchOnce(url: string): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      "accept-language": "en",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) DigitalGarden/1.0 (reader)",
    },
  });
}

export async function serverFetchAcquire(
  request: AcquireRequest,
): Promise<AcquiredContent> {
  let response = await fetchOnce(request.url);
  if (!response.ok && RETRYABLE_STATUSES.has(response.status)) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    response = await fetchOnce(request.url);
  }

  if (!response.ok) {
    throw new Error(`fetch failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!ACCEPTED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
    throw new Error(
      `unsupported content type "${contentType.split(";")[0] || "unknown"}" — only HTML/plain text pages can be read here`,
    );
  }

  const raw = (await response.text()).slice(0, MAX_HTML_CHARS);
  const isPlainText = contentType.includes("text/plain");

  const extracted = isPlainText
    ? {
        title: null,
        byline: null,
        siteName: null,
        publishedTime: null,
        excerpt: null,
        content: raw.trim(),
        quality: "raw" as const,
      }
    : await extractReadableContent(raw, response.url || request.url);

  const cap = request.maxContentLength ?? DEFAULT_MAX_CONTENT_CHARS;
  const truncated = extracted.content.length > cap;
  const content = truncated ? extracted.content.slice(0, cap) : extracted.content;

  const finalUrl = response.url || request.url;
  return {
    content,
    url: request.url,
    canonicalUrl: finalUrl !== request.url ? finalUrl : undefined,
    title: extracted.title ?? undefined,
    siteName: extracted.siteName ?? undefined,
    byline: extracted.byline ?? undefined,
    publishedAt: extracted.publishedTime ?? undefined,
    excerpt: extracted.excerpt ?? undefined,
    retrievedAt: new Date().toISOString(),
    provider: SERVER_FETCH_PROVIDER_ID,
    mode: "static",
    trustTier: "untrusted-web",
    extraction: extracted.quality,
    tokenEstimate: Math.ceil(content.length / 4),
    truncated,
  };
}
