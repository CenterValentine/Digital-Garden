/**
 * Search Connections service (AI v3.1) — BYOK CRUD for web-search
 * backends (Tavily/Brave). Keys are encrypted at rest via the shared
 * encryption layer (same as AIConnection); the decrypted key never leaves
 * the server. See `lib/domain/ai/acquisition/search/` for the backends
 * and the per-user resolver the chat route uses.
 */

import "server-only";

import { prisma } from "@/lib/database/client";
import { decrypt, encrypt } from "@/lib/infrastructure/crypto/encryption";
import { getSearchProviderImpl } from "@/lib/domain/ai/acquisition/search/registry";
import type { SearchKeyPayload } from "@/lib/domain/ai/acquisition/search/resolve";
import { OPENAI_SEARCH_MODEL } from "@/lib/domain/ai/acquisition/search/openai";

/**
 * Search backends that can reuse a key the user already saved as an AI
 * connection: search provider id → the AI connection adapter to look for.
 */
const REUSABLE_AI_KEYS: Record<string, string> = { openai: "openai" };

/** The search model a backend runs on, when it is a model (shown in settings). */
const SEARCH_MODELS: Record<string, string> = { openai: OPENAI_SEARCH_MODEL };

/** Client-safe view — NEVER includes the key (not even ciphertext). */
export interface SearchConnectionView {
  id: string;
  provider: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  /** Where the key comes from: pasted here, or reused from an AI connection. */
  keySource: "own" | "ai-connection";
  /** The search model this backend runs on, when it is a model. */
  model?: string;
}

function toView(row: {
  id: string;
  provider: string;
  label: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  encryptedKey: string;
}): SearchConnectionView {
  let keySource: SearchConnectionView["keySource"] = "own";
  try {
    if ((decrypt(row.encryptedKey) as SearchKeyPayload).source === "ai-connection") {
      keySource = "ai-connection";
    }
  } catch {
    /* unreadable payload — reported as its own key; the resolver will fail honestly */
  }
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    keySource,
    ...(SEARCH_MODELS[row.provider] ? { model: SEARCH_MODELS[row.provider] } : {}),
  };
}

/**
 * AI connections whose key a search backend can reuse, by search provider
 * id — the settings card offers "use your saved key" when one exists.
 */
export async function listReusableSearchKeys(
  userId: string,
): Promise<Record<string, { connectionId: string; label: string } | null>> {
  const out: Record<string, { connectionId: string; label: string } | null> = {};
  for (const [provider, adapterKind] of Object.entries(REUSABLE_AI_KEYS)) {
    const connection = await prisma.aIConnection.findFirst({
      // The lab's own endpoint only — an openai-compat connection's key is
      // for someone else's server.
      where: { ownerId: userId, deletedAt: null, adapterKind, baseURL: null },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      select: { id: true, label: true },
    });
    out[provider] = connection ? { connectionId: connection.id, label: connection.label } : null;
  }
  return out;
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
  /** The backend's own key. Ignored when `reuseAiConnection` is set. */
  apiKey: string;
  label?: string;
  makeDefault?: boolean;
  /** Reuse the key of the user's matching AI connection instead of pasting one. */
  reuseAiConnection?: boolean;
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
  let payload: SearchKeyPayload;
  if (input.reuseAiConnection) {
    const reusable = (await listReusableSearchKeys(userId))[input.provider];
    if (!reusable) {
      throw new Error(`No saved ${impl.label} connection to reuse — paste a key instead.`);
    }
    payload = { key: "", source: "ai-connection", connectionId: reusable.connectionId };
  } else {
    if (!input.apiKey.trim()) throw new Error("API key is required.");
    payload = { key: input.apiKey, source: "own" };
  }

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
      encryptedKey: encrypt(payload),
      isDefault: shouldDefault,
    },
    update: {
      label: input.label?.trim() || impl.label,
      encryptedKey: encrypt(payload),
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
