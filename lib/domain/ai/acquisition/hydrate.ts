/**
 * Garden hydration (AI v3 core S2) — garden-as-corpus, passive tier.
 *
 * When an acquisition succeeds and the user already has an ExternalPayload
 * node for that URL, the extracted content is merged into the node's
 * `captureMetadata.acquisition` — the garden itself becomes the research
 * cache (searchable later, staleness-aware via retrievedAt). Best-effort
 * and fire-and-forget: hydration must never fail or slow an acquisition.
 *
 * No schema change: captureMetadata is an existing extensible Json column.
 * The preserveHtml/preservedHtmlSnapshot pair is a different feature
 * (verbatim HTML preservation) and is deliberately not touched.
 *
 * v1 matching is exact-string on url/normalizedUrl/canonicalUrl; aligning
 * with the extension's url-strategy normalization rules is a refinement
 * (catalog E27).
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import type { AcquiredContent } from "./types";

/** Cap stored content well below the envelope cap — it's a cache, not an archive. */
const SNAPSHOT_CONTENT_CHARS = 20_000;

export async function hydrateExternalPayload(
  userId: string,
  content: AcquiredContent,
): Promise<void> {
  try {
    const urls = [content.url, content.canonicalUrl].filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    );
    const payload = await prisma.externalPayload.findFirst({
      where: {
        OR: urls.flatMap((u) => [
          { url: u },
          { normalizedUrl: u },
          { canonicalUrl: u },
        ]),
        content: { ownerId: userId, deletedAt: null },
      },
      select: { contentId: true, captureMetadata: true },
    });
    if (!payload) return;

    const existing =
      payload.captureMetadata && typeof payload.captureMetadata === "object"
        ? (payload.captureMetadata as Record<string, unknown>)
        : {};

    await prisma.externalPayload.update({
      where: { contentId: payload.contentId },
      data: {
        captureMetadata: {
          ...existing,
          acquisition: {
            title: content.title ?? null,
            excerpt: content.excerpt ?? null,
            content: content.content.slice(0, SNAPSHOT_CONTENT_CHARS),
            extraction: content.extraction,
            provider: content.provider,
            retrievedAt: content.retrievedAt,
            tokenEstimate: content.tokenEstimate,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    logger.info({
      layer: "ai",
      event: "acquisition:hydrated",
      summary: `acquisition snapshot stored on ExternalPayload ${payload.contentId}`,
      attrs: { contentId: payload.contentId, url: content.url },
    });
  } catch {
    // Best-effort by contract — a hydration failure must never surface to
    // the acquisition caller.
  }
}
