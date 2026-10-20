/**
 * The server side of the adapter context (RESEARCH-READER-PLAN.md §9.5).
 *
 * - fetch: the reader's SSRF-guarded fetch (DNS + redirect re-validation, size
 *   and time caps); a 404 is "no such record" → null.
 * - credentials: per the source's `keyPolicy` — the user's own key from a
 *   `ReaderConnection` (provider = source id) wins for `app-or-user`, else the
 *   app's key from the environment. The contact email is always the project's
 *   (`RESEARCH_CONTACT_EMAIL`), never the user's (§7.5).
 * - quotas: the app's free keys are shared by every user, so each user gets a
 *   per-source allowance on the DB-backed rate limiter. A user on their own
 *   key is limited only by the source.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { decrypt } from "@/lib/infrastructure/crypto/encryption";
import { consumeRateLimit } from "@/lib/infrastructure/rate-limiting";
import { ReaderFetchError, readerFetchJson } from "@/lib/domain/reader/server/http";
import type { AdapterContext } from "../adapter";
import { backoffDelay, parseRetryAfter } from "../backoff";
import { DEFAULT_SOURCE_TIMEOUT_MS } from "../federate";
import { RESEARCH_SOURCES, researchSource, type ResearchSourceInfo } from "../sources";

/** Per-user calls per source per hour on the app's shared keys. */
const SHARED_KEY_CALLS_PER_HOUR = 300;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The source an outbound URL belongs to, by host — for the per-source cap. */
function sourceForUrl(url: string): ResearchSourceInfo | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (host.endsWith("openalex.org")) return researchSource("openalex") ?? null;
  if (host.endsWith("semanticscholar.org")) return researchSource("semantic-scholar") ?? null;
  if (host.endsWith("crossref.org")) return researchSource("crossref") ?? null;
  if (host.endsWith("unpaywall.org")) return researchSource("unpaywall") ?? null;
  return null;
}

/**
 * Protect the sources, not only our quota: every outbound call to a source
 * counts against ITS published limit (catalog `rateLimit`), across every
 * user of this deployment, on the DB-backed limiter. A miss waits out the
 * window (short — these are per-second limits) and tries once more; a
 * second miss reports the source as busy rather than hammering it.
 */
async function claimSourceSlot(source: ResearchSourceInfo): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const verdict = await consumeRateLimit({
      key: `research:source:${source.id}`,
      limit: source.rateLimit.requests,
      windowSeconds: source.rateLimit.perSeconds,
    });
    if (verdict.ok) return attempt;
    if (attempt === 0) await sleep(Math.min(verdict.retryAfterSeconds, source.rateLimit.perSeconds) * 1000 + 50);
  }
  return null;
}

export interface ResearchContext extends AdapterContext {
  /** Skip reason when the user is over their shared-key allowance, else null. */
  gate(sourceId: string): Promise<string | null>;
}

async function userKeys(ownerId: string): Promise<Map<string, string>> {
  const providers = RESEARCH_SOURCES.filter((source) => source.keyPolicy === "app-or-user" || source.keyPolicy === "user").map(
    (source) => source.id
  );
  const rows = await prisma.readerConnection.findMany({
    where: { ownerId, provider: { in: providers } },
    select: { provider: true, tokenEncrypted: true },
  });
  const keys = new Map<string, string>();
  for (const row of rows) {
    try {
      const { token } = decrypt(row.tokenEncrypted) as { token?: string };
      if (token) keys.set(row.provider, token);
    } catch {
      // An undecryptable token (rotated key) falls back to the app's.
    }
  }
  return keys;
}

export async function researchContext(ownerId: string): Promise<ResearchContext> {
  const own = await userKeys(ownerId);

  const credential = (sourceId: string): string | null => {
    if (sourceId === "contact-email") return process.env.RESEARCH_CONTACT_EMAIL?.trim() || null;
    const source = researchSource(sourceId);
    if (!source) return null;
    switch (source.keyPolicy) {
      case "none":
        return null;
      case "user":
        return own.get(sourceId) ?? null;
      case "app-or-user":
        return own.get(sourceId) ?? (source.appKeyEnv ? process.env[source.appKeyEnv]?.trim() || null : null);
      case "app":
        return source.appKeyEnv ? process.env[source.appKeyEnv]?.trim() || null : null;
    }
  };

  return {
    credential,

    async fetchJson<T>(url: string, options?: { headers?: Record<string, string>; timeoutMs?: number }) {
      const budgetMs = options?.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;
      const started = Date.now();
      const host = new URL(url).hostname;
      const source = sourceForUrl(url);
      if (source && (await claimSourceSlot(source)) === null) {
        throw new ReaderFetchError(`${source.label} is busy — its rate limit is shared by everyone here; try again in a moment`, 429, 429);
      }
      // Retry 429 / 503 with backoff (Retry-After when the source sends one),
      // inside this call's share of the per-source timeout.
      for (let attempt = 0; ; attempt++) {
        try {
          return await readerFetchJson<T>(url, {
            headers: options?.headers,
            timeoutMs: Math.max(1_000, budgetMs - (Date.now() - started)),
          });
        } catch (error) {
          if (error instanceof ReaderFetchError && error.upstreamStatus === 404) return null;
          const throttled = error instanceof ReaderFetchError && (error.upstreamStatus === 429 || error.upstreamStatus === 503);
          const delay = throttled
            ? backoffDelay(attempt + 1, {
                retryAfterMs: parseRetryAfter(error instanceof ReaderFetchError ? error.retryAfter : null),
                elapsedMs: Date.now() - started,
                budgetMs,
              })
            : null;
          if (delay !== null) {
            await sleep(delay);
            continue;
          }
          if (throttled) {
            // Anonymous pools (Semantic Scholar especially) are shared by every
            // caller on the internet; say what to do, not just the status.
            throw new ReaderFetchError(
              `${host} is rate-limiting right now — try again shortly, or connect your own key in Settings → Reader`,
              429,
              429
            );
          }
          throw error;
        }
      }
    },

    async gate(sourceId: string) {
      const source = researchSource(sourceId);
      if (!source) return "Unknown source";
      if (source.keyPolicy === "user" && !own.has(sourceId)) return `Connect your ${source.label} key to search it`;
      // The user's own key carries its own quota.
      if (own.has(sourceId)) return null;
      const verdict = await consumeRateLimit({
        key: `research:${sourceId}:${ownerId}`,
        limit: SHARED_KEY_CALLS_PER_HOUR,
        windowSeconds: 3_600,
      });
      return verdict.ok
        ? null
        : `Hourly ${source.label} allowance used — try again in ${Math.ceil(verdict.retryAfterSeconds / 60)} min, or connect your own key`;
    },
  };
}
