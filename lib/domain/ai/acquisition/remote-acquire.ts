/**
 * Remote acquisition providers — server half (BROWSER-REACH B5).
 *
 * P2 (sw-fetch) and P3 (session-tab) run in the user's browser and hand back
 * RAW material over the page-bridge. This module turns that raw material into a
 * trusted `AcquiredContent` envelope — server-side, so provenance and trust
 * tiering stay authoritative and the untrusted extension can't forge them.
 *
 *   P2 sw-fetch    → returns raw HTML; the server extracts it (reusing the P1
 *                    `extractReadableContent` path — identical to P1 except who
 *                    did the credentialed fetch).
 *   P3 session-tab → the injected reader already ran Readability in a live DOM,
 *                    so it returns extracted fields; the server just wraps them.
 *
 * Policy is re-checked here (defense-in-depth): the extension enforces its own
 * local policy, but the server never trusts a client that says "allowed."
 */

import { extractReadableContent } from "./extract";
import { hydrateExternalPayload } from "./hydrate";
import { evaluateAcquirePolicy } from "./policy";
import type {
  AcquireContext,
  AcquiredContent,
  AcquireResult,
  AcquisitionMode,
  ExtractionQuality,
} from "./types";

/** Cap on returned content characters — mirrors server-fetch's default. */
const REMOTE_MAX_CONTENT_CHARS = 16_000;

/** Which browser-side provider produced the material. */
export type RemoteProvider = "sw-fetch" | "session-tab";

/** Raw material handed back by the extension (never a full envelope). */
export interface RemoteAcquireMaterial {
  mode: RemoteProvider;
  /** P2 sw-fetch: the credentialed raw HTML. */
  rawHtml?: string;
  /** P3 session-tab: Readability output from the live DOM. */
  extracted?: {
    title?: string;
    byline?: string;
    siteName?: string;
    excerpt?: string;
    content: string;
    quality: "readable" | "raw" | "empty";
  };
  /** Final URL after redirects, if the extension observed one. */
  finalUrl?: string;
}

function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Build the trusted envelope from extension-returned material. Returns the same
 * `AcquireResult` shape as `acquire()` so callers are provider-agnostic.
 */
export async function finalizeRemoteAcquire(
  url: string,
  material: RemoteAcquireMaterial,
  ctx: AcquireContext,
): Promise<AcquireResult> {
  const decision = evaluateAcquirePolicy(url, ctx);
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason ?? "blocked by acquisition policy" };
  }

  let title: string | undefined;
  let byline: string | undefined;
  let siteName: string | undefined;
  let excerpt: string | undefined;
  let publishedAt: string | undefined;
  let body: string;
  let quality: ExtractionQuality;

  if (material.mode === "sw-fetch") {
    if (!isNonEmpty(material.rawHtml)) {
      return { ok: false, reason: "the extension returned no content" };
    }
    const extracted = await extractReadableContent(material.rawHtml, url);
    title = extracted.title;
    byline = extracted.byline;
    siteName = extracted.siteName;
    excerpt = extracted.excerpt;
    publishedAt = extracted.publishedTime;
    body = extracted.content;
    quality = extracted.quality;
  } else {
    const ex = material.extracted;
    if (!ex || !isNonEmpty(ex.content)) {
      return { ok: false, reason: "the extension returned no content" };
    }
    title = ex.title;
    byline = ex.byline;
    siteName = ex.siteName;
    excerpt = ex.excerpt;
    body = ex.content;
    // The reader reports "empty" for no-article pages; treat anything but a
    // clean article as "raw" so consumers don't over-trust the extraction.
    quality = ex.quality === "readable" ? "readable" : "raw";
  }

  const truncated = body.length > REMOTE_MAX_CONTENT_CHARS;
  const content = truncated ? body.slice(0, REMOTE_MAX_CONTENT_CHARS) : body;
  const canonicalUrl =
    isNonEmpty(material.finalUrl) && material.finalUrl !== url
      ? material.finalUrl
      : undefined;
  // sw-fetch is a (credentialed) static fetch; session-tab is a live session render.
  const mode: AcquisitionMode = material.mode === "session-tab" ? "session" : "static";

  const acquired: AcquiredContent = {
    content,
    url,
    canonicalUrl,
    title,
    siteName,
    byline,
    publishedAt,
    excerpt,
    retrievedAt: new Date().toISOString(),
    provider: material.mode,
    mode,
    trustTier: "untrusted-web",
    extraction: quality,
    tokenEstimate: Math.ceil(content.length / 4),
    truncated,
  };

  // Garden-as-corpus caching, fire-and-forget by contract (same as P1).
  void hydrateExternalPayload(ctx.userId, acquired);

  return { ok: true, content: acquired };
}
