/**
 * Per-user search-backend resolution (AI v3.1). The active backend + key
 * come from the user's default `SearchConnection` (BYOK, encrypted) — NOT
 * env (owner directive 2026-07-21). The chat route gates app-search
 * attachment on this; the tool calls it again at execute time.
 */

import { prisma } from "@/lib/database/client";
import { decrypt } from "@/lib/infrastructure/crypto/encryption";

export interface ResolvedSearchBackend {
  provider: string;
  apiKey: string;
}

/** True when the user has at least one usable search backend configured. */
export async function userHasSearchConnection(
  userId: string,
): Promise<boolean> {
  const count = await prisma.searchConnection.count({
    where: { ownerId: userId },
  });
  return count > 0;
}

/**
 * The user's active search backend + decrypted key, or null when none is
 * configured. Default row wins; otherwise the most recently updated.
 */
export async function resolveDefaultSearchBackend(
  userId: string,
): Promise<ResolvedSearchBackend | null> {
  const rows = await prisma.searchConnection.findMany({
    where: { ownerId: userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  const chosen = rows.find((r) => r.isDefault) ?? rows[0];
  if (!chosen) return null;
  try {
    const apiKey = (decrypt(chosen.encryptedKey) as { key: string }).key;
    return { provider: chosen.provider, apiKey };
  } catch {
    return null;
  }
}
