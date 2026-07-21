/**
 * Per-user search-backend resolution (AI v3.1). The active backend + key
 * come from the user's default `SearchConnection` (BYOK, encrypted) — NOT
 * env (owner directive 2026-07-21).
 *
 * STAGED: the SearchConnection Prisma model is added by the owner (schema
 * + migration are outside agent write-permissions). Until it's generated,
 * these resolve to "no search configured" so the tree stays green and the
 * app-search tool simply doesn't attach — no behavior regression. Once the
 * model exists, the bodies below light up (see the marked block).
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
  return (await resolveDefaultSearchBackend(userId)) !== null;
}

/**
 * The user's active search backend + decrypted key, or null when none is
 * configured. The chat route gates app-search attachment on this; the tool
 * calls it again at execute time.
 */
export async function resolveDefaultSearchBackend(
  userId: string,
): Promise<ResolvedSearchBackend | null> {
  // ── Lights up once SearchConnection is generated (owner schema step). ──
  const model = (prisma as { searchConnection?: unknown }).searchConnection;
  if (!model) return null;
  type Row = { provider: string; encryptedKey: string; isDefault: boolean };
  const client = model as {
    findMany: (args: unknown) => Promise<Row[]>;
  };
  const rows = await client.findMany({
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
