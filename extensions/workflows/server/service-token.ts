import crypto from "crypto";

import { prisma } from "@/lib/database/client";
import type { ServiceToken } from "@/lib/database/generated/prisma";

import {
  WORKFLOWS_CALLBACK_SCOPE,
  type ServiceTokenCreateDto,
  type ServiceTokenDto,
} from "../shared";

/**
 * Workflow service tokens (PATs) — the auth credential an external execution
 * spoke (Plan 3: n8n) presents when posting run events/gates/artifacts back to
 * the callback surface. Mirrors BrowserExtensionToken: sha256-hashed at rest,
 * a short prefix kept for display, revocable, optional expiry. The plaintext
 * secret is returned exactly once (at creation) and never persisted.
 */

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Public: the same hash the guard and lookups use. */
export function hashServiceToken(token: string): string {
  return hashToken(token.trim());
}

/** `dgwf_` + 48 hex chars. The `dgwf` prefix distinguishes it from `dgext_`. */
export function createServiceTokenValue(): string {
  return `dgwf_${crypto.randomBytes(24).toString("hex")}`;
}

/** First 12 chars — enough to recognize a token in the UI without exposing it. */
export function createServiceTokenPrefix(token: string): string {
  return token.slice(0, 12);
}

function asIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function formatRecord(
  token: Pick<
    ServiceToken,
    | "id"
    | "name"
    | "tokenPrefix"
    | "scopes"
    | "createdAt"
    | "lastUsedAt"
    | "expiresAt"
    | "revokedAt"
  >
): ServiceTokenDto {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: asIso(token.lastUsedAt),
    expiresAt: asIso(token.expiresAt),
    revokedAt: asIso(token.revokedAt),
  };
}

export { formatRecord as formatServiceTokenRecord };

/**
 * Validate a presented token for a required scope. Returns the token's
 * owner id + record on success, or null on any failure (unknown, revoked,
 * expired, or scope not granted). Bumps `lastUsedAt` best-effort. The guard
 * layer (service-token-http) is the only intended caller.
 */
export async function validateServiceToken(
  token: string,
  requiredScope: string = WORKFLOWS_CALLBACK_SCOPE
): Promise<{ userId: string; record: ServiceTokenDto } | null> {
  const tokenHash = hashServiceToken(token);
  const record = await prisma.serviceToken.findUnique({ where: { tokenHash } });

  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;
  if (!record.scopes.includes(requiredScope)) return null;

  // Best-effort last-used stamp; a write failure must not reject a valid token.
  try {
    await prisma.serviceToken.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    // ignore — the token is still valid regardless of the stamp
  }

  return { userId: record.userId, record: formatRecord(record) };
}

export async function listServiceTokens(userId: string): Promise<ServiceTokenDto[]> {
  const tokens = await prisma.serviceToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return tokens.map(formatRecord);
}

export async function createServiceTokenRecord(
  userId: string,
  input: { name?: string; expiresAt?: string | null }
): Promise<ServiceTokenCreateDto> {
  const tokenValue = createServiceTokenValue();
  const token = await prisma.serviceToken.create({
    data: {
      userId,
      name: input.name?.trim() || "Workflow engine token",
      tokenHash: hashServiceToken(tokenValue),
      tokenPrefix: createServiceTokenPrefix(tokenValue),
      scopes: [WORKFLOWS_CALLBACK_SCOPE],
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });

  return { token: tokenValue, record: formatRecord(token) };
}

export async function revokeServiceToken(
  userId: string,
  tokenId: string
): Promise<ServiceTokenDto> {
  // Scope the lookup to the owner so one user can't revoke another's token.
  const token = await prisma.serviceToken.findFirst({
    where: { id: tokenId, userId },
  });
  if (!token) {
    throw new Error("Service token not found");
  }

  const updated = await prisma.serviceToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  });

  return formatRecord(updated);
}

/**
 * Hard-delete a token row (owner-scoped). Cleanup for already-dead tokens —
 * the UI only offers this on revoked rows. Revoking first (soft) preserves the
 * audit stamp; deleting is the tidy-up that removes the row entirely.
 */
export async function deleteServiceToken(
  userId: string,
  tokenId: string
): Promise<{ id: string }> {
  const token = await prisma.serviceToken.findFirst({
    where: { id: tokenId, userId },
  });
  if (!token) {
    throw new Error("Service token not found");
  }

  await prisma.serviceToken.delete({ where: { id: token.id } });
  return { id: token.id };
}
