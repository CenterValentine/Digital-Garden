import type { PrismaClient } from "@/lib/database/generated/prisma";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";

const PRESENCE_ACCESS_CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 5000;

type PresenceAccessCacheValue =
  | { status: "allowed"; expiresAt: number }
  | { status: "denied"; expiresAt: number; message: string };

declare global {
  var __dgPresenceAccessCache: Map<string, PresenceAccessCacheValue> | undefined;
}

function getCache() {
  globalThis.__dgPresenceAccessCache ??= new Map();
  return globalThis.__dgPresenceAccessCache;
}

function pruneExpired(now = Date.now()) {
  const cache = getCache();
  if (cache.size <= MAX_CACHE_ENTRIES) return;

  for (const [key, value] of cache) {
    if (value.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function getCached(key: string) {
  const value = getCache().get(key);
  if (!value) return null;

  if (value.expiresAt <= Date.now()) {
    getCache().delete(key);
    return null;
  }

  return value;
}

function setCached(
  key: string,
  value:
    | { status: "allowed" }
    | { status: "denied"; message: string }
) {
  const now = Date.now();
  getCache().set(key, {
    ...value,
    expiresAt: now + PRESENCE_ACCESS_CACHE_TTL_MS,
  });
  pruneExpired(now);
}

export async function assertCachedPresenceAccess(
  prisma: PrismaClient,
  input: { contentId: string; userId: string }
) {
  const key = `user:${input.userId}:${input.contentId}`;
  const cached = getCached(key);

  if (cached?.status === "allowed") return;
  if (cached?.status === "denied") throw new Error(cached.message);

  try {
    await resolveContentAccess(prisma, {
      contentId: input.contentId,
      userId: input.userId,
      require: "view",
    });
    setCached(key, { status: "allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "View access required";
    setCached(key, { status: "denied", message });
    throw error;
  }
}

export async function assertCachedPublicPresenceAccess(
  prisma: PrismaClient,
  contentId: string
) {
  const key = `public:${contentId}`;
  const cached = getCached(key);

  if (cached?.status === "allowed") return;
  if (cached?.status === "denied") throw new Error(cached.message);

  const content = await prisma.contentNode.findFirst({
    where: {
      id: contentId,
      deletedAt: null,
      isPublished: true,
    },
    select: { id: true },
  });

  if (!content) {
    const message = "View access required";
    setCached(key, { status: "denied", message });
    throw new Error(message);
  }

  setCached(key, { status: "allowed" });
}

export async function filterCachedPresenceContentIds(
  prisma: PrismaClient,
  input: { contentIds: string[]; userId?: string | null }
) {
  if (input.contentIds.length === 0) return [];

  const accessResults = await Promise.allSettled(
    input.contentIds.map((contentId) =>
      input.userId
        ? assertCachedPresenceAccess(prisma, { contentId, userId: input.userId })
        : assertCachedPublicPresenceAccess(prisma, contentId)
    )
  );

  return input.contentIds.filter(
    (_contentId, index) => accessResults[index]?.status === "fulfilled"
  );
}
