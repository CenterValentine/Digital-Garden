/**
 * AI Feature Routes Service — Session 3.6.
 *
 * Server-only CRUD over `AIFeatureRoute`. Ownership-gated, like every
 * other AI domain service. Maintains the (ownerId, featureId, position)
 * unique constraint by re-numbering positions on every write — callers
 * pass the desired ordered list and the service replaces the previous
 * one atomically.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";

export interface FeatureRouteEntry {
  /** Position 0 = primary; 1+ = ordered backups. */
  position: number;
  connectionId: string;
  modelId: string;
}

export interface FeatureRouteView extends FeatureRouteEntry {
  id: string;
  featureId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * List a user's routes for a specific feature, in position order.
 * Empty array if none configured.
 */
export async function listFeatureRoutes(
  userId: string,
  featureId: string,
): Promise<FeatureRouteView[]> {
  const rows = await prisma.aIFeatureRoute.findMany({
    where: { ownerId: userId, featureId },
    orderBy: { position: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    featureId: r.featureId,
    position: r.position,
    connectionId: r.connectionId,
    modelId: r.modelId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** List every route the user has configured, grouped by featureId. */
export async function listAllUserRoutes(
  userId: string,
): Promise<Record<string, FeatureRouteView[]>> {
  const rows = await prisma.aIFeatureRoute.findMany({
    where: { ownerId: userId },
    orderBy: [{ featureId: "asc" }, { position: "asc" }],
  });
  const out: Record<string, FeatureRouteView[]> = {};
  for (const r of rows) {
    if (!out[r.featureId]) out[r.featureId] = [];
    out[r.featureId].push({
      id: r.id,
      featureId: r.featureId,
      position: r.position,
      connectionId: r.connectionId,
      modelId: r.modelId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return out;
}

/**
 * Replace the entire ordered route list for a (user, feature). All
 * existing rows for that feature are deleted; the new ones are
 * inserted with sequential positions starting at 0.
 *
 * Pass an empty `entries` array to clear the routes for a feature.
 */
export async function setFeatureRoutes(
  userId: string,
  featureId: string,
  entries: Array<Omit<FeatureRouteEntry, "position">>,
): Promise<FeatureRouteView[]> {
  // Validate that every connectionId is owned by the user — silently
  // drop invalid ones. (Returning a hard error tempts UI bugs; the
  // defensive drop matches our snapshot-association behavior.)
  const ids = Array.from(new Set(entries.map((e) => e.connectionId)));
  const valid = await prisma.aIConnection.findMany({
    where: { id: { in: ids }, ownerId: userId, deletedAt: null },
    select: { id: true },
  });
  const validSet = new Set(valid.map((c) => c.id));
  const filtered = entries.filter((e) => validSet.has(e.connectionId));

  const created = await prisma.$transaction(async (tx) => {
    await tx.aIFeatureRoute.deleteMany({
      where: { ownerId: userId, featureId },
    });
    if (filtered.length === 0) return [];
    const inserts = filtered.map((e, i) => ({
      ownerId: userId,
      featureId,
      position: i,
      connectionId: e.connectionId,
      modelId: e.modelId,
    }));
    await tx.aIFeatureRoute.createMany({ data: inserts });
    return tx.aIFeatureRoute.findMany({
      where: { ownerId: userId, featureId },
      orderBy: { position: "asc" },
    });
  });

  logger.info({
    layer: "ai",
    event: "feature_route.set",
    summary: `routes set for ${featureId}: ${filtered.length} entries`,
    attrs: {
      feature_id: featureId,
      entry_count: filtered.length,
      dropped_invalid: entries.length - filtered.length,
    },
  });

  return created.map((r) => ({
    id: r.id,
    featureId: r.featureId,
    position: r.position,
    connectionId: r.connectionId,
    modelId: r.modelId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Delete all routes for (user, feature). */
export async function clearFeatureRoutes(
  userId: string,
  featureId: string,
): Promise<number> {
  const { count } = await prisma.aIFeatureRoute.deleteMany({
    where: { ownerId: userId, featureId },
  });
  return count;
}
