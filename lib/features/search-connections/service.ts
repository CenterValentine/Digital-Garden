/**
 * Search Connections service (AI v3.1) — BYOK CRUD for web-search
 * backends (Tavily/Brave). Keys are encrypted at rest via the shared
 * encryption layer (same as AIConnection); the decrypted key never leaves
 * the server. See `lib/domain/ai/acquisition/search/` for the backends
 * and the per-user resolver the chat route uses.
 */

import "server-only";

import { prisma } from "@/lib/database/client";
import { encrypt } from "@/lib/infrastructure/crypto/encryption";
import { getSearchProviderImpl } from "@/lib/domain/ai/acquisition/search/registry";

/** Client-safe view — NEVER includes the key (not even ciphertext). */
export interface SearchConnectionView {
  id: string;
  provider: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

function toView(row: {
  id: string;
  provider: string;
  label: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SearchConnectionView {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSearchConnections(
  userId: string,
): Promise<SearchConnectionView[]> {
  const rows = await prisma.searchConnection.findMany({
    where: { ownerId: userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(toView);
}

export interface UpsertSearchConnectionInput {
  provider: string;
  apiKey: string;
  label?: string;
  makeDefault?: boolean;
}

/**
 * Create or update (by provider) a search connection. One row per
 * (owner, provider) — re-saving the same provider rotates the key.
 * The first connection a user adds becomes their default automatically.
 */
export async function upsertSearchConnection(
  userId: string,
  input: UpsertSearchConnectionInput,
): Promise<SearchConnectionView> {
  const impl = getSearchProviderImpl(input.provider);
  if (!impl) throw new Error(`Unknown search backend "${input.provider}".`);
  if (!input.apiKey.trim()) throw new Error("API key is required.");

  const existingCount = await prisma.searchConnection.count({
    where: { ownerId: userId },
  });
  const shouldDefault = input.makeDefault ?? existingCount === 0;

  if (shouldDefault) {
    // At most one default per user — clear the others first.
    await prisma.searchConnection.updateMany({
      where: { ownerId: userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const row = await prisma.searchConnection.upsert({
    where: { ownerId_provider: { ownerId: userId, provider: input.provider } },
    create: {
      ownerId: userId,
      provider: input.provider,
      label: input.label?.trim() || impl.label,
      encryptedKey: encrypt({ key: input.apiKey }),
      isDefault: shouldDefault,
    },
    update: {
      label: input.label?.trim() || impl.label,
      encryptedKey: encrypt({ key: input.apiKey }),
      ...(shouldDefault ? { isDefault: true } : {}),
    },
  });
  return toView(row);
}

export async function setDefaultSearchConnection(
  userId: string,
  id: string,
): Promise<void> {
  const target = await prisma.searchConnection.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!target) throw new Error("Search connection not found.");
  await prisma.$transaction([
    prisma.searchConnection.updateMany({
      where: { ownerId: userId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.searchConnection.update({
      where: { id },
      data: { isDefault: true },
    }),
  ]);
}

export async function deleteSearchConnection(
  userId: string,
  id: string,
): Promise<void> {
  const row = await prisma.searchConnection.findFirst({
    where: { id, ownerId: userId },
    select: { id: true, isDefault: true },
  });
  if (!row) return;
  await prisma.searchConnection.delete({ where: { id } });
  // If we removed the default, promote the most recent remaining one so a
  // user with connections always has an active backend.
  if (row.isDefault) {
    const next = await prisma.searchConnection.findFirst({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (next) {
      await prisma.searchConnection.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }
}
