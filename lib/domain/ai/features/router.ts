/**
 * Feature Router — Session 3.6.
 *
 * Given a (userId, featureId), returns an ordered list of resolved
 * routes: each route is a `{ connection, modelId }` pair. Position 0
 * is the primary; subsequent entries are user-defined backups.
 *
 * Filtering: routes whose model lacks the feature's required
 * capabilities are dropped. If the user has no configured routes,
 * the registry's `defaultSuggestion` is attempted (matched against
 * the user's connections by preset id). If nothing matches, returns
 * an empty list and the caller must handle the unavailable case.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import {
  getConnectionWithKey,
  listConnections,
  type ConnectionModel,
  type ConnectionView,
  type ConnectionWithKey,
} from "@/lib/features/ai-connections";
import { lookupFeature, type CapabilityFlag } from "./registry";

export interface ResolvedRoute {
  /** Decrypted connection — ready to pass to `resolveChatModelFromConnection`. */
  connection: ConnectionWithKey;
  /** Upstream model id stored on the connection. */
  modelId: string;
  /** 0 = primary; 1+ = ordered backup. */
  position: number;
  /** True when this entry came from the registry default, not the user's config. */
  fromDefault: boolean;
}

export async function resolveFeatureRoute(
  userId: string,
  featureId: string,
): Promise<ResolvedRoute[]> {
  const feature = lookupFeature(featureId);
  if (!feature) return [];

  const userRoutes = await prisma.aIFeatureRoute.findMany({
    where: { ownerId: userId, featureId },
    orderBy: { position: "asc" },
  });

  const resolved: ResolvedRoute[] = [];

  if (userRoutes.length > 0) {
    // User has explicit routes — use them, filtering by capability.
    for (const route of userRoutes) {
      try {
        const conn = await getConnectionWithKey(userId, route.connectionId);
        if (modelSatisfiesCapabilities(conn, route.modelId, feature.requiredCapabilities)) {
          resolved.push({
            connection: conn,
            modelId: route.modelId,
            position: route.position,
            fromDefault: false,
          });
        }
      } catch {
        // Connection was deleted underneath us — skip silently.
      }
    }
  } else if (feature.defaultSuggestion) {
    // Fall back to the registry default. Match by preset id + model id.
    const conns = await listConnections(userId);
    const match = conns.find(
      (c) =>
        c.presetId === feature.defaultSuggestion!.presetId &&
        c.models.some((m) => m.id === feature.defaultSuggestion!.modelId),
    );
    if (match) {
      try {
        const conn = await getConnectionWithKey(userId, match.id);
        if (modelSatisfiesCapabilities(conn, feature.defaultSuggestion.modelId, feature.requiredCapabilities)) {
          resolved.push({
            connection: conn,
            modelId: feature.defaultSuggestion.modelId,
            position: 0,
            fromDefault: true,
          });
        }
      } catch {
        /* skip */
      }
    }
  }

  return resolved;
}

/**
 * Lighter variant — returns just the primary route or null. Most call
 * sites only need the primary; backups kick in inside the fallback
 * wrapper.
 */
export async function resolvePrimaryRoute(
  userId: string,
  featureId: string,
): Promise<ResolvedRoute | null> {
  const all = await resolveFeatureRoute(userId, featureId);
  return all[0] ?? null;
}

/**
 * Infer capability flags from a model's id when the saved
 * `capabilities` array is missing or incomplete.
 *
 * Safety net for older Connection entries that were saved before the
 * fetcher's catalog augmentation existed (or for entries the user
 * added manually via the "Model ID" input, which has no capability
 * field). Lets feature routing find them as compatible pairs without
 * forcing the user to re-add their models.
 *
 * Only adds capabilities — never removes — so explicit `capabilities`
 * on the model still win. Patterns are deliberately conservative; we
 * recognize widely-documented model id stems rather than every
 * variant.
 */
export function inferCapabilities(modelId: string): string[] {
  // Strip a namespace prefix so `openai/dall-e-3` matches the same
  // patterns as `dall-e-3`.
  const slash = modelId.indexOf("/");
  const bare = slash >= 0 ? modelId.slice(slash + 1) : modelId;
  const out: string[] = [];

  // Image generation models. These ids are stable across providers and
  // gateways — DALL·E + GPT Image (OpenAI), Imagen (Google), FLUX
  // (fal.ai / Together / Fireworks).
  if (
    /^dall-e/i.test(bare) ||
    /^gpt-image/i.test(bare) ||
    /^imagen/i.test(bare) ||
    /\bflux\b/i.test(bare) ||
    /^stable-diffusion/i.test(bare) ||
    /^sdxl/i.test(bare)
  ) {
    out.push("image-generation");
  }

  return out;
}

/**
 * Effective capability set for a saved model: union of the explicit
 * `capabilities` array (catalog/fetcher-derived) and any flags
 * inferred from the model id. Use this anywhere a feature-routing
 * filter wants to know what a model can do.
 */
export function effectiveCapabilities(
  model: { id: string; capabilities?: string[] },
): Set<string> {
  const have = new Set<string>(model.capabilities ?? []);
  for (const inferred of inferCapabilities(model.id)) have.add(inferred);
  return have;
}

function modelSatisfiesCapabilities(
  connection: ConnectionView,
  modelId: string,
  required: CapabilityFlag[],
): boolean {
  if (required.length === 0) return true;
  const model = connection.models.find((m) => m.id === modelId);
  if (!model) return false;
  const have = effectiveCapabilities(model);
  return required.every((cap) => have.has(cap));
}

/** Public utility used by the settings UI when listing compatible models. */
export function listCompatibleModels(
  connection: ConnectionView,
  required: CapabilityFlag[],
): ConnectionModel[] {
  return connection.models.filter((m) => {
    const have = effectiveCapabilities(m);
    return required.every((cap) => have.has(cap));
  });
}
