/**
 * Acquisition Service — types (AI v3 core S2).
 *
 * The subsystem that gets external content into the AI's hands. Every
 * consumer (chat tools, WDK steps, URL entry) speaks this contract; every
 * provider (P0 native → P6 headless-remote) returns the same envelope.
 * Authority: AI-V3-CORE-PLAN.md seam contract C1.
 *
 * Non-negotiables baked into the envelope:
 * - Provenance always (url + retrievedAt + provider) so downstream
 *   artifacts can cite sources.
 * - Trust tiering: web content is labeled untrusted at the envelope level —
 *   it can inform, never instruct.
 */

export type AcquisitionMode = "static" | "session" | "supervised" | "interactive";

export type TrustTier = "untrusted-web" | "trusted-garden";

/** How the readable content was derived. */
export type ExtractionQuality = "readable" | "raw";

export interface AcquireRequest {
  url: string;
  /** Defaults to "static" (P1 server-fetch). */
  mode?: AcquisitionMode;
  /** Cap on returned content characters (default in server-fetch). */
  maxContentLength?: number;
}

export interface AcquiredContent {
  /** Extracted main content, plain text with paragraph breaks. */
  content: string;
  url: string;
  /** Final URL after redirects, when it differs from the request URL. */
  canonicalUrl?: string;
  title?: string;
  siteName?: string;
  byline?: string;
  publishedAt?: string;
  excerpt?: string;
  /** ISO timestamp of the fetch — freshness metadata for consumers. */
  retrievedAt: string;
  /** Provider id, e.g. "server-fetch" (P1). */
  provider: string;
  mode: AcquisitionMode;
  trustTier: TrustTier;
  extraction: ExtractionQuality;
  /** chars/4 heuristic — lets consumers budget before sending to a model. */
  tokenEstimate: number;
  truncated: boolean;
}

/**
 * Flat shape (not a discriminated union) — the repo compiles with
 * `strict: false`, where boolean-discriminant narrowing is unreliable.
 * `content` is present exactly when `ok` is true; `reason` when false.
 */
export interface AcquireResult {
  ok: boolean;
  content?: AcquiredContent;
  reason?: string;
}

export interface AcquireContext {
  userId: string;
  /**
   * Per-turn budget, shared across all acquisitions in one request scope.
   * Create with `createAcquisitionBudget()`; the policy engine decrements.
   */
  budget?: AcquisitionBudget;
}

export interface AcquisitionBudget {
  pagesUsed: number;
  maxPages: number;
}

export function createAcquisitionBudget(maxPages = 5): AcquisitionBudget {
  return { pagesUsed: 0, maxPages };
}
