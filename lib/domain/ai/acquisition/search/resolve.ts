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
  let payload: SearchKeyPayload;
  try {
    payload = decrypt(chosen.encryptedKey) as SearchKeyPayload;
  } catch {
    return null;
  }
  if (payload.source === "ai-connection" && payload.connectionId) {
    // Key reused from the user's AI connection (OpenAI search): read it at
    // call time so a key rotated there is the key searched with here. A
    // removed connection is an honest error, not a silent fallback.
    const { getConnectionWithKey } = await import(
      "@/lib/features/ai-connections/service"
    );
    try {
      const connection = await getConnectionWithKey(userId, payload.connectionId);
      return { provider: chosen.provider, apiKey: connection.apiKey };
    } catch {
      throw new Error(
        "The AI connection this search backend reuses was removed — reconnect it, or paste a key in Settings → AI → Web Search.",
      );
    }
  }
  return { provider: chosen.provider, apiKey: payload.key };
}

/**
 * What a search connection stores (encrypted): its own key, or a pointer to
 * the AI connection whose key it reuses (owner-requested, 2026-09-30 — an
 * OpenAI key already saved for chat need not be pasted twice).
 */
export interface SearchKeyPayload {
  key: string;
  source?: "own" | "ai-connection";
  connectionId?: string;
}
