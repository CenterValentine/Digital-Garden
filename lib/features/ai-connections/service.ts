/**
 * AI Connections Service
 *
 * Server-only CRUD over `AIConnection`. Every operation is ownership-
 * gated — queries filter on `ownerId`. API keys are encrypted before
 * storage and only decrypted when the resolver needs to actually call
 * the upstream service.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";
import { encrypt, decrypt } from "@/lib/infrastructure/crypto/encryption";
import { logger } from "@/lib/core/logger";
import type {
  ConnectionModel,
  ConnectionRow,
  ConnectionView,
  ConnectionWithKey,
  CreateConnectionInput,
  UpdateConnectionPatch,
} from "./types";

export class ConnectionNotFoundError extends Error {
  constructor(id: string) {
    super(`AIConnection ${id} not found`);
    this.name = "ConnectionNotFoundError";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Read
// ────────────────────────────────────────────────────────────────────────────

/** List a user's active connections, pinned first, then most recent. */
export async function listConnections(userId: string): Promise<ConnectionView[]> {
  const rows = await prisma.aIConnection.findMany({
    where: { ownerId: userId, deletedAt: null },
    orderBy: [
      { isPinned: "desc" },
      { pinOrder: "asc" },
      { updatedAt: "desc" },
    ],
  });
  return rows.map(toView);
}

/** Get a single connection without exposing its key. */
export async function getConnection(
  userId: string,
  id: string,
): Promise<ConnectionView> {
  const row = await prisma.aIConnection.findFirst({
    where: { id, ownerId: userId, deletedAt: null },
  });
  if (!row) throw new ConnectionNotFoundError(id);
  return toView(row);
}

/**
 * Internal — fetch a connection together with its decrypted API key.
 * Used by the resolver when actually making an upstream call. Never
 * exposed via API; callers must already have an authenticated session.
 */
export async function getConnectionWithKey(
  userId: string,
  id: string,
): Promise<ConnectionWithKey> {
  const row = await prisma.aIConnection.findFirst({
    where: { id, ownerId: userId, deletedAt: null },
  });
  if (!row) throw new ConnectionNotFoundError(id);
  const apiKey = decryptKey(row.encryptedKey);
  return { ...toView(row), apiKey };
}

// ────────────────────────────────────────────────────────────────────────────
// Write
// ────────────────────────────────────────────────────────────────────────────

export async function createConnection(
  userId: string,
  input: CreateConnectionInput,
): Promise<ConnectionView> {
  const encryptedKey = encryptKey(input.apiKey);

  const row = await prisma.aIConnection.create({
    data: {
      ownerId: userId,
      kind: input.kind,
      presetId: input.presetId ?? null,
      label: input.label,
      baseURL: input.baseURL ?? null,
      encryptedKey,
      adapterKind: input.adapterKind,
      models: (input.models ?? []) as unknown as Prisma.InputJsonValue,
      isPinned: input.isPinned ?? false,
      pinOrder: input.pinOrder ?? null,
      preferRouteVia: input.preferRouteVia ?? null,
    },
  });

  logger.info({
    layer: "ai",
    event: "connection.create",
    summary: `connection created (${input.kind}/${input.presetId ?? "custom"})`,
    attrs: {
      connection_id: row.id,
      kind: input.kind,
      preset_id: input.presetId ?? null,
      adapter_kind: input.adapterKind,
      model_count: (input.models ?? []).length,
    },
  });

  return toView(row);
}

export async function updateConnection(
  userId: string,
  id: string,
  patch: UpdateConnectionPatch,
): Promise<ConnectionView> {
  const data: Prisma.AIConnectionUpdateInput = {};
  if (patch.label !== undefined) data.label = patch.label;
  if (patch.baseURL !== undefined) data.baseURL = patch.baseURL;
  if (patch.apiKey !== undefined) data.encryptedKey = encryptKey(patch.apiKey);
  if (patch.models !== undefined) {
    data.models = patch.models as unknown as Prisma.InputJsonValue;
  }
  if (patch.isPinned !== undefined) data.isPinned = patch.isPinned;
  if (patch.pinOrder !== undefined) data.pinOrder = patch.pinOrder;
  if (patch.preferRouteVia !== undefined) {
    data.preferRouteVia = patch.preferRouteVia;
  }

  const { count } = await prisma.aIConnection.updateMany({
    where: { id, ownerId: userId, deletedAt: null },
    data,
  });
  if (count === 0) throw new ConnectionNotFoundError(id);

  const row = await prisma.aIConnection.findUniqueOrThrow({ where: { id } });
  return toView(row);
}

/** Soft-delete a connection. FeatureRoutes referencing it cascade-delete. */
export async function deleteConnection(
  userId: string,
  id: string,
): Promise<void> {
  const { count } = await prisma.aIConnection.updateMany({
    where: { id, ownerId: userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) throw new ConnectionNotFoundError(id);

  // Hard-delete any feature routes that referenced this connection.
  // (Cascade on FK is set; this is belt-and-suspenders for soft-delete UX.)
  await prisma.aIFeatureRoute.deleteMany({
    where: { connectionId: id, ownerId: userId },
  });

  logger.info({
    layer: "ai",
    event: "connection.delete",
    summary: "connection soft-deleted",
    attrs: { connection_id: id },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Mapping helpers
// ────────────────────────────────────────────────────────────────────────────

function toView(row: ConnectionRow): ConnectionView {
  return {
    id: row.id,
    kind: row.kind,
    presetId: row.presetId,
    label: row.label,
    baseURL: row.baseURL,
    adapterKind: row.adapterKind,
    models: (row.models as unknown as ConnectionModel[]) ?? [],
    isPinned: row.isPinned,
    pinOrder: row.pinOrder,
    preferRouteVia: row.preferRouteVia,
    hasKey: row.encryptedKey.length > 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function encryptKey(plain: string): string {
  return encrypt({ key: plain });
}

function decryptKey(encrypted: string): string {
  const obj = decrypt(encrypted) as { key: string };
  return obj.key;
}
