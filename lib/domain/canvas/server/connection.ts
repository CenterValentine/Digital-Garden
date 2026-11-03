/**
 * Canvas archive — the user's Canvas connection (server-only, §11).
 *
 * A personal access token, encrypted at rest and only ever decrypted here.
 * It carries the user's full Canvas permissions, so it never reaches the
 * client: the client sees the host and a masked hint. "Disconnect" forgets
 * the token but keeps the connection row, because every imported node's
 * provenance (and title lock) hangs off it.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { decrypt, encrypt, maskSensitiveValue } from "@/lib/infrastructure/crypto/encryption";
import { CARTRIDGE_CONNECTION_BASE_URL } from "../types";
import { CanvasError, createCanvasApi, normalizeCanvasBaseUrl, type CanvasApi } from "./http";

export interface CanvasConnectionDto {
  id: string;
  baseUrl: string;
  displayName: string | null;
  connected: boolean;
  tokenHint: string | null;
  lastUsedAt: string | null;
}

interface StoredToken {
  kind: "pat";
  token: string;
}

function readToken(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    const stored = decrypt(encrypted) as Partial<StoredToken>;
    return typeof stored.token === "string" ? stored.token : null;
  } catch {
    return null;
  }
}

/** The user's API connections, most recently used first. */
export async function listApiConnections(ownerId: string): Promise<CanvasConnectionDto[]> {
  const rows = await prisma.canvasConnection.findMany({
    where: { ownerId, kind: "api" },
    orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
  });
  return rows.map((row) => {
    const token = readToken(row.tokenEncrypted);
    return {
      id: row.id,
      baseUrl: row.baseUrl,
      displayName: row.displayName,
      connected: Boolean(token),
      tokenHint: token ? maskSensitiveValue(token) : null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    };
  });
}

/** Validate the token against Canvas (`/users/self`), then store it encrypted. */
export async function saveApiConnection(
  ownerId: string,
  baseUrlInput: string,
  tokenInput: string
): Promise<CanvasConnectionDto> {
  const baseUrl = normalizeCanvasBaseUrl(baseUrlInput);
  const token = tokenInput.trim().replace(/^Bearer\s+/i, "");
  if (!token) throw new CanvasError("Paste the access token you generated in Canvas", 400);
  const api = createCanvasApi(baseUrl, token);
  const self = await api.get<{ id: number; name?: string; short_name?: string }>(
    "/api/v1/users/self",
    {},
    "your profile"
  );
  const tokenEncrypted = encrypt({ kind: "pat", token } satisfies StoredToken);
  const displayName = self.short_name || self.name || null;
  const row = await prisma.canvasConnection.upsert({
    where: { ownerId_baseUrl: { ownerId, baseUrl } },
    create: { ownerId, kind: "api", baseUrl, tokenEncrypted, canvasUserId: String(self.id), displayName, lastUsedAt: new Date() },
    update: { tokenEncrypted, canvasUserId: String(self.id), displayName, lastUsedAt: new Date() },
  });
  return {
    id: row.id,
    baseUrl: row.baseUrl,
    displayName: row.displayName,
    connected: true,
    tokenHint: maskSensitiveValue(token),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

/** Forget the token; keep the row (imported courses still point at it). */
export async function disconnectApiConnection(ownerId: string, connectionId: string): Promise<void> {
  await prisma.canvasConnection.updateMany({
    where: { id: connectionId, ownerId, kind: "api" },
    data: { tokenEncrypted: null },
  });
}

export interface ResolvedConnection {
  id: string;
  kind: "api" | "cartridge";
  baseUrl: string;
}

/** An API client for one of the user's connections, or a clear error. */
export async function apiForConnection(ownerId: string, connectionId: string): Promise<{ api: CanvasApi; connection: ResolvedConnection }> {
  const row = await prisma.canvasConnection.findFirst({ where: { id: connectionId, ownerId } });
  if (!row || row.kind !== "api") throw new CanvasError("That Canvas connection doesn't exist", 404);
  const token = readToken(row.tokenEncrypted);
  if (!token) {
    throw new CanvasError(`Reconnect to ${row.baseUrl} first: add a Canvas access token in Settings → Extensions → Canvas.`, 409);
  }
  await prisma.canvasConnection.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { api: createCanvasApi(row.baseUrl, token), connection: { id: row.id, kind: "api", baseUrl: row.baseUrl } };
}

/** The one connection row every cartridge import shares. */
export async function ensureCartridgeConnection(ownerId: string): Promise<ResolvedConnection> {
  const row = await prisma.canvasConnection.upsert({
    where: { ownerId_baseUrl: { ownerId, baseUrl: CARTRIDGE_CONNECTION_BASE_URL } },
    create: { ownerId, kind: "cartridge", baseUrl: CARTRIDGE_CONNECTION_BASE_URL, displayName: "Course exports" },
    update: { lastUsedAt: new Date() },
  });
  return { id: row.id, kind: "cartridge", baseUrl: row.baseUrl };
}
