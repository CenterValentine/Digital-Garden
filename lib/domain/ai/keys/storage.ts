/**
 * BYOK Key Storage
 *
 * Encrypted API key CRUD operations.
 * Keys are encrypted at rest using AES-256-GCM via STORAGE_ENCRYPTION_KEY.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import {
  encrypt,
  decrypt,
  maskSensitiveValue,
} from "@/lib/infrastructure/crypto/encryption";
import type { AIProviderId } from "../types";
import type { MaskedKeyResponse } from "./types";

/**
 * Encrypt and store an API key for a provider.
 * Uses upsert — one key per provider per user.
 */
export async function storeProviderKey(
  userId: string,
  providerId: AIProviderId,
  apiKey: string,
  label: string = ""
) {
  const encryptedKey = encrypt({ key: apiKey });

  return prisma.aIProviderKey.upsert({
    where: { userId_providerId: { userId, providerId } },
    create: { userId, providerId, encryptedKey, label },
    update: { encryptedKey, label, isActive: true },
  });
}

/**
 * Retrieve and decrypt the active API key for a provider.
 * Returns null if no key is stored or active.
 */
export async function getProviderKey(
  userId: string,
  providerId: string
): Promise<string | null> {
  const record = await prisma.aIProviderKey.findFirst({
    where: { userId, providerId, isActive: true },
  });

  if (!record) return null;

  const decrypted = decrypt(record.encryptedKey) as { key: string };

  // Update lastUsedAt (fire-and-forget)
  prisma.aIProviderKey
    .update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {}); // Non-critical

  return decrypted.key;
}

/**
 * List all keys for a user with masked values.
 */
export async function listProviderKeys(
  userId: string
): Promise<MaskedKeyResponse[]> {
  const records = await prisma.aIProviderKey.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  return records.map((record) => {
    const decrypted = decrypt(record.encryptedKey) as { key: string };
    return {
      id: record.id,
      providerId: record.providerId as AIProviderId,
      maskedKey: maskSensitiveValue(decrypted.key, 6),
      label: record.label,
      isActive: record.isActive,
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  });
}

/**
 * Update a key's label or active status.
 */
export async function updateProviderKey(
  keyId: string,
  userId: string,
  data: { label?: string; isActive?: boolean }
) {
  return prisma.aIProviderKey.updateMany({
    where: { id: keyId, userId },
    data,
  });
}

/**
 * Delete a stored key.
 */
export async function deleteProviderKey(keyId: string, userId: string) {
  return prisma.aIProviderKey.deleteMany({
    where: { id: keyId, userId },
  });
}
