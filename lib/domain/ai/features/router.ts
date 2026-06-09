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

  // Last-resort auto-bind: no explicit route and the registry default didn't
  // match a connection (e.g. the user added `tts-1-hd` but the default suggests
  // `tts-1`). Pick the FIRST connection holding any model that satisfies the
  // feature's required capabilities, so a feature "just works" the moment a
  // compatible provider exists — no manual binding step. Capability-keyed, not
  // a hardcoded provider list. Purely additive: only runs when nothing else
  // resolved, so it never overrides a user's explicit choice or a working
  // default. Marked `fromDefault` so the UI can show it as auto-selected.
  if (resolved.length === 0) {
    const conns = await listConnections(userId);
    for (const c of conns) {
      const model = c.models.find((m) =>
        feature.requiredCapabilities.every((cap) =>
          effectiveCapabilities(m).has(cap),
        ),
      );
      if (!model) continue;
      try {
        const conn = await getConnectionWithKey(userId, c.id);
        resolved.push({
          connection: conn,
          modelId: model.id,
          position: 0,
          fromDefault: true,
        });
        break;
      } catch {
        /* connection vanished — try the next */
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

// Capability helpers live in `./capabilities.ts` so client components
// can import them without dragging server-only deps through this file.
// Re-export here so existing server-side callers keep working.
export { inferCapabilities, effectiveCapabilities } from "./capabilities";
import { effectiveCapabilities } from "./capabilities";

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
