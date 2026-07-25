/**
 * Registry-authoritative model population (AI 3.5, server-only).
 *
 * On connection install, the provider's model registry — not the template's
 * seed `defaultModels` — is authoritative. Right after `createConnection`,
 * this auto-fetches the live model list (the plaintext key is still in hand)
 * and replaces the seeds with it. Seeds remain the FALLBACK: if the provider
 * has no model-list API, the fetch fails, times out, or returns nothing, the
 * connection keeps its seed models and the caller surfaces a "using defaults —
 * fetch when ready" hint. So a bad key or a slow/hanging provider never blocks
 * connection creation.
 */

import "server-only";
import type { ConnectionTemplate } from "./templates";
import type { ConnectionModel, ConnectionView } from "./types";
import { getConnectionWithKey, updateConnection } from "./service";
import { fetchUpstreamModels } from "./fetch-models";
import { logger } from "@/lib/core/logger";

/**
 * - `auto`    — the live registry list replaced the seeds
 * - `seed`    — fetch unavailable/failed/empty; kept the template seed models
 * - `skipped` — provider has no model-list API (custom/openai-compat w/o base URL)
 */
export type ModelsPopulateStatus = "auto" | "seed" | "skipped";

export interface AutoPopulateResult {
  status: ModelsPopulateStatus;
  connection: ConnectionView;
  count?: number;
}

/** Hard ceiling so a hanging provider never stalls connection creation. */
const AUTO_FETCH_TIMEOUT_MS = 8_000;

export async function autoPopulateModels(
  userId: string,
  created: ConnectionView,
  template: ConnectionTemplate | null,
): Promise<AutoPopulateResult> {
  // No model-list API for this provider — nothing to fetch, keep manual list.
  if (!template?.supportsModelFetch) {
    return { status: "skipped", connection: created };
  }

  try {
    const withKey = await getConnectionWithKey(userId, created.id);
    const fetched = await Promise.race([
      fetchUpstreamModels(withKey),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("model auto-fetch timed out")),
          AUTO_FETCH_TIMEOUT_MS,
        ),
      ),
    ]);

    if (fetched.length === 0) {
      return { status: "seed", connection: created };
    }

    // Fetched entries carry no contextWindow; default capabilities the same
    // way the manual "Fetch from API" flow does (ModelEditor).
    const models: ConnectionModel[] = fetched.map((f) => ({
      id: f.id,
      name: f.name,
      capabilities: f.capabilities ?? ["text", "streaming"],
    }));
    const connection = await updateConnection(userId, created.id, { models });
    return { status: "auto", connection, count: models.length };
  } catch (error) {
    logger.warn({
      layer: "ai",
      event: "connection:auto_populate_failed",
      summary:
        "auto-fetch of models on connection create failed — kept seed models",
      error,
    });
    return { status: "seed", connection: created };
  }
}
