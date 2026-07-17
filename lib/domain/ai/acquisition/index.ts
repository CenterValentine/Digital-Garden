/**
 * Acquisition Service — entry point (AI v3 core S2).
 *
 * `acquire()` is the ONE door: policy check → provider dispatch → audited
 * envelope. Consumers (chat tools, WDK steps, URL entry) never call
 * providers directly; providers never see consumers. New capability lands
 * as a provider behind this door, never inside a UI surface.
 *
 * Provider status: P1 server-fetch (here). P0 provider-native search is
 * resolved at request composition in the chat route (a different call
 * shape — the vendor executes it). P2/P3 arrive with BROWSER-REACH over
 * seam contract C1/C2.
 */

import { logger } from "@/lib/core/logger";
import { hydrateExternalPayload } from "./hydrate";
import { evaluateAcquirePolicy } from "./policy";
import { serverFetchAcquire } from "./server-fetch";
import type { AcquireContext, AcquireRequest, AcquireResult } from "./types";

export type {
  AcquireContext,
  AcquireRequest,
  AcquireResult,
  AcquiredContent,
  AcquisitionBudget,
  AcquisitionMode,
  TrustTier,
} from "./types";
export { createAcquisitionBudget } from "./types";
export { evaluateAcquirePolicy } from "./policy";
export { resolveNativeWebSearchTool } from "./native-search";

export async function acquire(
  request: AcquireRequest,
  ctx: AcquireContext,
): Promise<AcquireResult> {
  const decision = evaluateAcquirePolicy(request.url, ctx);
  if (!decision.allowed) {
    const reason = decision.reason ?? "blocked by acquisition policy";
    logger.info({
      layer: "ai",
      event: "acquisition:denied",
      summary: `acquisition denied: ${reason}`,
      attrs: { url: request.url, reason },
    });
    return { ok: false, reason };
  }

  const mode = request.mode ?? "static";
  if (mode !== "static") {
    // Session/supervised/interactive modes are extension-executed (P2–P5);
    // they register through seam contract C1 when BROWSER-REACH lands.
    return {
      ok: false,
      reason: `acquisition mode "${mode}" has no available provider yet`,
    };
  }

  try {
    const content = await serverFetchAcquire(request);
    // Garden-as-corpus: if the user already has this URL as an external
    // node, cache the extraction on it. Fire-and-forget by contract.
    void hydrateExternalPayload(ctx.userId, content);
    logger.info({
      layer: "ai",
      event: "acquisition:fetch",
      summary: `acquired ${request.url} (${content.extraction}, ~${content.tokenEstimate} tokens)`,
      attrs: {
        url: request.url,
        provider: content.provider,
        extraction: content.extraction,
        tokenEstimate: content.tokenEstimate,
        truncated: content.truncated,
        userId: ctx.userId,
      },
    });
    return { ok: true, content };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "fetch failed";
    logger.info({
      layer: "ai",
      event: "acquisition:failed",
      summary: `acquisition failed for ${request.url}: ${reason}`,
      attrs: { url: request.url, reason, userId: ctx.userId },
    });
    return { ok: false, reason };
  }
}
