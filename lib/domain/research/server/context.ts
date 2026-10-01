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
import { RESEARCH_SOURCES, researchSource } from "../sources";

/** Per-user calls per source per hour on the app's shared keys. */
const SHARED_KEY_CALLS_PER_HOUR = 300;

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
      try {
        return await readerFetchJson<T>(url, { headers: options?.headers, timeoutMs: options?.timeoutMs ?? 12_000 });
      } catch (error) {
        if (error instanceof ReaderFetchError && error.upstreamStatus === 404) return null;
        throw error;
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
