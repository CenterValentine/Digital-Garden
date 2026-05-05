import { prisma } from "@/lib/database/client";
import type {
  BookmarkSyncConnectionInstall,
  BookmarkSyncConnection,
  BrowserExtensionInstall,
  BrowserExtensionToken,
  ContentNode,
  ExternalReadingStatus,
  Prisma,
} from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content";
import {
  createBrowserExtensionTokenPrefix,
  createBrowserExtensionTokenValue,
  hashBrowserExtensionToken,
} from "./auth";
import { ensureWebResourceForExternalContent } from "@/lib/domain/browser-extension";
import {
  BROWSER_BOOKMARKS_API_VERSION,
  BROWSER_BOOKMARKS_SCOPE,
  type BrowserBookmarkPreferences,
  type BookmarkSyncBootstrapResponse,
  type BookmarkSyncConnectionRecord,
  type BrowserBookmarksCapabilityResponse,
  type BrowserExtensionInstallRecord,
  type BrowserExtensionInstallTrustResponse,
  type BrowserExtensionTokenCreateResponse,
  type BrowserExtensionTokenRecord,
  type BrowserReadingQueueItem,
  type BrowserSyncMutation,
  type BrowserSyncNodeRecord,
  type BrowserSyncPullResponse,
  type BrowserSyncPushResponse,
} from "./types";
import { normalizeUrl } from "@/lib/domain/content/external-validation";

type ConnectionWithRoot = BookmarkSyncConnection & {
  appRoot: Pick<ContentNode, "id" | "title" | "contentType" | "ownerId">;
  installLinks?: Array<
    Pick<BookmarkSyncConnectionInstall, "id" | "installId" | "chromeRootId" | "chromeRootTitle">
  >;
};

type ContentWithSyncPayload = Prisma.ContentNodeGetPayload<{
  include: {
    folderPayload: true;
    externalPayload: true;
    notePayload: true;
    bookmarkSyncLinks: true;
    contentTags: {
      include: {
        tag: { select: { slug: true } };
      };
    };
    children: { select: { id: true } };
  };
}>;

function asIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function getBrowserBookmarksCapability(): BrowserBookmarksCapabilityResponse {
  return {
    apiVersion: BROWSER_BOOKMARKS_API_VERSION,
    extensionId: "browser-bookmarks",
    supports: {
      tokenAuth: true,
      connections: true,
      bootstrap: true,
      push: true,
      pull: true,
      readingQueue: false,
      preserveHtml: true,
      noteText: false,
      descriptionField: true,
      resourceClassification: true,
      optionalSidePanel: true,
      trustedInstalls: true,
    },
  };
}

function formatTokenRecord(
  token: Pick<
    BrowserExtensionToken,
    | "id"
    | "name"
    | "tokenPrefix"
    | "scopes"
    | "createdAt"
    | "updatedAt"
    | "lastUsedAt"
    | "expiresAt"
    | "revokedAt"
  >
): BrowserExtensionTokenRecord {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes,
    createdAt: token.createdAt.toISOString(),
    updatedAt: token.updatedAt.toISOString(),
    lastUsedAt: asIsoString(token.lastUsedAt),
    expiresAt: asIsoString(token.expiresAt),
    revokedAt: asIsoString(token.revokedAt),
  };
}

function formatInstallRecord(
  install: Pick<
    BrowserExtensionInstall,
    | "id"
    | "tokenId"
    | "installInstanceId"
    | "extensionId"
    | "extensionName"
    | "extensionVersion"
    | "browserName"
    | "browserVersion"
    | "osName"
    | "osVersion"
    | "trustedAt"
    | "lastSeenAt"
    | "revokedAt"
    | "createdAt"
    | "updatedAt"
  >
): BrowserExtensionInstallRecord {
  return {
    id: install.id,
    tokenId: install.tokenId,
    installInstanceId: install.installInstanceId,
    extensionId: install.extensionId,
    extensionName: install.extensionName,
    extensionVersion: install.extensionVersion,
    browserName: install.browserName,
    browserVersion: install.browserVersion,
    osName: install.osName,
    osVersion: install.osVersion,
    trustedAt: install.trustedAt.toISOString(),
    lastSeenAt: asIsoString(install.lastSeenAt),
    revokedAt: asIsoString(install.revokedAt),
    createdAt: install.createdAt.toISOString(),
    updatedAt: install.updatedAt.toISOString(),
  };
}

function formatConnectionRecord(
  connection:
    | (Pick<
        BookmarkSyncConnection,
        | "id"
        | "name"
        | "appRootId"
        | "chromeRootId"
        | "chromeRootTitle"
        | "lastSyncedAt"
        | "lastPulledAt"
        | "lastPushedAt"
        | "lastSyncError"
        | "createdAt"
        | "updatedAt"
      > & {
        installLinks?: Array<
          Pick<BookmarkSyncConnectionInstall, "installId" | "chromeRootId" | "chromeRootTitle">
        >;
      })
    | ConnectionWithRoot
): BookmarkSyncConnectionRecord {
  return {
    id: connection.id,
    name: connection.name,
    appRootId: connection.appRootId,
    chromeRootId: connection.chromeRootId,
    chromeRootTitle: connection.chromeRootTitle,
    lastSyncedAt: asIsoString(connection.lastSyncedAt),
    lastPulledAt: asIsoString(connection.lastPulledAt),
    lastPushedAt: asIsoString(connection.lastPushedAt),
    lastSyncError: connection.lastSyncError,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    installCount: connection.installLinks?.length ?? 0,
    installs: connection.installLinks?.map((link) => ({
      installId: link.installId,
      chromeRootId: link.chromeRootId ?? null,
      chromeRootTitle: link.chromeRootTitle,
    })),
  };
}

function extractNoteText(notePayload: { tiptapJson: Prisma.JsonValue } | null) {
  if (!notePayload) return null;
  const doc = notePayload.tiptapJson as {
    content?: Array<{ type?: string; text?: string; content?: Array<{ text?: string }> }>;
  };
  const parts: string[] = [];
  for (const node of doc.content ?? []) {
    if (typeof node.text === "string") {
      parts.push(node.text);
    }
    for (const child of node.content ?? []) {
      if (typeof child.text === "string") {
        parts.push(child.text);
      }
    }
  }
  const text = parts.join(" ").trim();
  return text.length > 0 ? text : null;
}

function createSimpleNoteDoc(text: string): Prisma.JsonObject {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function normalizeOptionalBookmarkText(
  value: string | null | undefined,
  maxLength = 2000
) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function normalizeOptionalBookmarkTagValue(
  value: string | null | undefined,
  maxLength = 120
) {
  return normalizeOptionalBookmarkText(value, maxLength);
}

function extractDomainParts(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const parts = hostname.split(".").filter(Boolean);
    const domain =
      parts.length >= 2 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : hostname;
    return { hostname, domain };
  } catch {
    return { hostname: null, domain: null };
  }
}

function normalizeExternalFields(input: {
  url?: string | null;
  canonicalUrl?: string | null;
  faviconUrl?: string | null;
  readingStatus?: ExternalReadingStatus | null;
  preserveHtml?: boolean;
  preservedHtmlSnapshot?: Record<string, unknown> | null;
  captureMetadata?: Record<string, unknown>;
  matchMetadata?: Record<string, unknown>;
}) {
  const normalizedUrl = input.url ? normalizeUrl(input.url) : null;
  const normalizedCanonicalUrl = input.canonicalUrl
    ? normalizeUrl(input.canonicalUrl)
    : normalizedUrl;
  const domainParts = normalizedUrl ? extractDomainParts(normalizedUrl) : { hostname: null, domain: null };

  return {
    normalizedUrl,
    canonicalUrl: normalizedCanonicalUrl,
    faviconUrl: input.faviconUrl ?? null,
    readingStatus: input.readingStatus ?? "inbox",
    sourceHostname: domainParts.hostname,
    sourceDomain: domainParts.domain,
    preserveHtml: input.preserveHtml ?? false,
    preservedHtmlSnapshot: (input.preservedHtmlSnapshot ?? null) as Prisma.JsonObject | null,
    preservedHtmlCapturedAt:
      input.preserveHtml && input.preservedHtmlSnapshot ? new Date() : null,
    captureMetadata: (input.captureMetadata ?? {}) as Prisma.JsonObject,
    matchMetadata: (input.matchMetadata ?? {}) as Prisma.JsonObject,
  };
}

function getBrowserBookmarkPreferencesForSettings(
  settings: Record<string, unknown> | null | undefined
): BrowserBookmarkPreferences {
  const external =
    settings && typeof settings.external === "object" && settings.external
      ? (settings.external as Record<string, unknown>)
      : {};
  const bookmarkMetadata =
    external.bookmarkMetadata &&
    typeof external.bookmarkMetadata === "object"
      ? (external.bookmarkMetadata as Record<string, unknown>)
      : {};

  const toStringArray = (value: unknown, fallback: string[]) =>
    Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
          )
        )
      : fallback;

  return {
    resourceTypes: toStringArray(bookmarkMetadata.resourceTypes, [
      "article",
      "video",
      "song",
      "course",
      "lesson",
      "documentation",
      "repository",
      "package",
      "issue",
      "discussion",
      "social_post",
      "product",
      "service",
      "tool",
      "dataset",
      "paper",
      "book",
      "map_location",
      "profile",
      "organization",
      "unknown",
    ]),
    resourceRelationships: toStringArray(bookmarkMetadata.resourceRelationships, [
      "cites",
      "supports",
      "contradicts",
      "explains",
      "teaches",
      "demonstrates",
      "implements",
      "depends_on",
      "uses",
      "compares",
      "evaluates",
      "archives",
      "inspired_by",
      "mentions",
      "related_to",
    ]),
    userIntents: toStringArray(bookmarkMetadata.userIntents, [
      "learn",
      "research",
      "build",
      "cite",
      "decide",
      "compare",
      "buy",
      "monitor",
      "archive",
      "share",
      "teach",
    ]),
  };
}

export async function getBrowserBookmarkPreferences(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const settings =
    user?.settings && typeof user.settings === "object"
      ? (user.settings as Record<string, unknown>)
      : null;
  return getBrowserBookmarkPreferencesForSettings(settings);
}

export async function updateBrowserBookmarkPreferences(
  userId: string,
  updates: Partial<BrowserBookmarkPreferences>
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const currentSettings =
    user?.settings && typeof user.settings === "object"
      ? ({ ...(user.settings as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const currentExternal =
    currentSettings.external && typeof currentSettings.external === "object"
      ? ({ ...(currentSettings.external as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const currentBookmarkMetadata =
    currentExternal.bookmarkMetadata &&
    typeof currentExternal.bookmarkMetadata === "object"
      ? ({
          ...(currentExternal.bookmarkMetadata as Record<string, unknown>),
        } as Record<string, unknown>)
      : {};

  const normalizeArray = (values: string[] | undefined, fallback: string[]) =>
    values === undefined
      ? fallback
      : Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).slice(0, 100);

  const currentPrefs = getBrowserBookmarkPreferencesForSettings(currentSettings);
  currentExternal.bookmarkMetadata = {
    ...currentBookmarkMetadata,
    resourceTypes: normalizeArray(updates.resourceTypes, currentPrefs.resourceTypes),
    resourceRelationships: normalizeArray(
      updates.resourceRelationships,
      currentPrefs.resourceRelationships
    ),
    userIntents: normalizeArray(updates.userIntents, currentPrefs.userIntents),
  };
  currentSettings.external = currentExternal;

  await prisma.user.update({
    where: { id: userId },
    data: {
      settings: currentSettings as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });

  return getBrowserBookmarkPreferencesForSettings(currentSettings);
}

function buildExternalPreviewFromMutation(
  mutation: {
    title?: string | null;
    observedAt: string;
    description?: string | null;
    captureMetadata?: Record<string, unknown>;
  },
  normalized: {
    sourceDomain: string | null;
    sourceHostname: string | null;
  },
  existingPreview?: Prisma.JsonValue | null
) {
  const basePreview =
    existingPreview && typeof existingPreview === "object" && !Array.isArray(existingPreview)
      ? ((existingPreview as Record<string, unknown>) ?? {})
      : {};
  const baseCached =
    basePreview.cached &&
    typeof basePreview.cached === "object" &&
    !Array.isArray(basePreview.cached)
      ? ((basePreview.cached as Record<string, unknown>) ?? {})
      : {};

  const screenshotDataUrl =
    typeof mutation.captureMetadata?.screenshotDataUrl === "string"
      ? mutation.captureMetadata.screenshotDataUrl
      : null;
  const title = mutation.title?.trim() || (baseCached.title as string | undefined) || null;
  const siteName =
    normalized.sourceDomain ||
    normalized.sourceHostname ||
    (typeof baseCached.siteName === "string" ? baseCached.siteName : null);
  const imageUrl =
    screenshotDataUrl ||
    (typeof baseCached.imageUrl === "string" ? baseCached.imageUrl : null);
  const description =
    normalizeOptionalBookmarkText(mutation.description) ??
    (typeof mutation.captureMetadata?.selectionText === "string"
      ? mutation.captureMetadata.selectionText
      : typeof baseCached.description === "string"
        ? baseCached.description
        : null);

  if (!title && !siteName && !imageUrl && !description) {
    return (basePreview ?? {}) as Prisma.JsonObject;
  }

  return {
    ...basePreview,
    mode:
      typeof basePreview.mode === "string"
        ? basePreview.mode
        : imageUrl
          ? "browser_capture"
          : "bookmark_capture",
    cached: {
      ...baseCached,
      ...(title ? { title } : {}),
      ...(siteName ? { siteName } : {}),
      ...(description ? { description } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      fetchedAt: mutation.observedAt,
    },
  } as Prisma.JsonObject;
}

async function getOwnedConnection(userId: string, connectionId: string) {
  const connection = await prisma.bookmarkSyncConnection.findFirst({
    where: { id: connectionId, userId },
    include: {
      appRoot: {
        select: {
          id: true,
          title: true,
          contentType: true,
          ownerId: true,
        },
      },
      installLinks: {
        select: {
          id: true,
          installId: true,
          chromeRootId: true,
          chromeRootTitle: true,
        },
      },
    },
  });

  if (!connection) {
    throw new Error("Bookmark sync connection not found");
  }

  if (connection.appRoot.contentType !== "folder") {
    throw new Error("Bookmark sync root must be a folder");
  }

  return connection as ConnectionWithRoot;
}

async function getAuthorizedConnectionForInstall(
  userId: string,
  connectionId: string,
  installId: string
) {
  const connection = await prisma.bookmarkSyncConnection.findFirst({
    where: {
      id: connectionId,
      userId,
      OR: [
        { installLinks: { some: { installId } } },
        { token: { is: { install: { is: { id: installId, revokedAt: null } } } } },
      ],
    },
    include: {
      appRoot: {
        select: {
          id: true,
          title: true,
          contentType: true,
          ownerId: true,
        },
      },
      installLinks: {
        where: { installId },
        select: {
          id: true,
          installId: true,
          chromeRootId: true,
          chromeRootTitle: true,
        },
      },
    },
  });

  if (!connection) {
    throw new Error("Bookmark sync connection not found");
  }

  if (connection.appRoot.contentType !== "folder") {
    throw new Error("Bookmark sync root must be a folder");
  }

  return connection as ConnectionWithRoot;
}

function getEffectiveChromeRootId(
  connection: Pick<BookmarkSyncConnection, "chromeRootId"> & {
    installLinks?: Array<Pick<BookmarkSyncConnectionInstall, "chromeRootId">>;
  }
) {
  return connection.installLinks?.[0]?.chromeRootId ?? connection.chromeRootId;
}

function getEffectiveChromeRootTitle(
  connection: Pick<BookmarkSyncConnection, "chromeRootTitle"> & {
    installLinks?: Array<Pick<BookmarkSyncConnectionInstall, "chromeRootTitle">>;
  }
) {
  return connection.installLinks?.[0]?.chromeRootTitle ?? connection.chromeRootTitle;
}

async function getMappedParentContentId(
  connection: ConnectionWithRoot,
  chromeParentId: string | null | undefined
) {
  if (!chromeParentId || chromeParentId === getEffectiveChromeRootId(connection)) {
    return connection.appRootId;
  }

  const parentMapping = await prisma.bookmarkSyncLink.findFirst({
    where: {
      connectionId: connection.id,
      chromeNodeId: chromeParentId,
      content: {
        is: {
          deletedAt: null,
          ownerId: connection.userId,
        },
      },
    },
    select: { contentId: true },
  });

  return parentMapping?.contentId ?? connection.appRootId;
}

async function nextDisplayOrder(parentId: string) {
  const lastSibling = await prisma.contentNode.findFirst({
    where: { parentId, deletedAt: null },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });

  return (lastSibling?.displayOrder ?? -1) + 1;
}

async function upsertSimpleNote(contentId: string, text: string | null | undefined) {
  if (text === undefined) return;

  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    await prisma.notePayload.deleteMany({ where: { contentId } });
    return;
  }

  const doc = createSimpleNoteDoc(trimmed);
  await prisma.notePayload.upsert({
    where: { contentId },
    update: {
      tiptapJson: doc,
      searchText: trimmed,
      metadata: {
        wordCount: trimmed.split(/\s+/).filter(Boolean).length,
        characterCount: trimmed.length,
        readingTime: Math.max(1, Math.ceil(trimmed.split(/\s+/).filter(Boolean).length / 200)),
        source: "browser-bookmarks-placeholder",
      },
    },
    create: {
      contentId,
      tiptapJson: doc,
      searchText: trimmed,
      metadata: {
        wordCount: trimmed.split(/\s+/).filter(Boolean).length,
        characterCount: trimmed.length,
        readingTime: Math.max(1, Math.ceil(trimmed.split(/\s+/).filter(Boolean).length / 200)),
        source: "browser-bookmarks-placeholder",
      },
    },
  });
}

async function softDeleteContentNode(contentId: string, userId: string) {
  const existing = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId: userId },
    include: {
      children: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });

  if (!existing) {
    throw new Error("Content not found");
  }

  const now = new Date();
  const scheduledDeletion = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.contentNode.update({
      where: { id: existing.id },
      data: {
        deletedAt: now,
        deletedBy: userId,
      },
    }),
    prisma.trashBin.upsert({
      where: { contentId: existing.id },
      update: {
        deletedAt: now,
        deletedBy: userId,
        scheduledDeletion,
        contentSnapshot: {
          title: existing.title,
          slug: existing.slug,
          parentId: existing.parentId,
          hasChildren: existing.children.length > 0,
        },
      },
      create: {
        contentId: existing.id,
        deletedBy: userId,
        scheduledDeletion,
        contentSnapshot: {
          title: existing.title,
          slug: existing.slug,
          parentId: existing.parentId,
          hasChildren: existing.children.length > 0,
        },
      },
    }),
  ]);
}

async function findExistingExternalForDedupe(
  userId: string,
  url: string | null,
  canonicalUrl: string | null
) {
  const candidates = [canonicalUrl, url].filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return null;

  return prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      deletedAt: null,
      contentType: "external",
      externalPayload: {
        is: {
          OR: [
            { normalizedUrl: { in: candidates } },
            { canonicalUrl: { in: candidates } },
            { url: { in: candidates } },
          ],
        },
      },
    },
    include: {
      externalPayload: true,
      notePayload: true,
      bookmarkSyncLinks: true,
      children: { select: { id: true } },
      folderPayload: true,
    },
  });
}

async function applyExternalBookmarkUpdate(params: {
  connection: ConnectionWithRoot;
  userId: string;
  contentId: string;
  mappingId: string | null;
  currentChromeParentId: string | null;
  currentNormalizedUrl: string | null;
  currentLastKnownTitle: string | null;
  mutation: BrowserSyncMutation;
  normalized: ReturnType<typeof normalizeExternalFields>;
  existingPreview?: Prisma.JsonValue | null;
}) {
  const {
    connection,
    userId,
    contentId,
    mappingId,
    currentChromeParentId,
    currentNormalizedUrl,
    currentLastKnownTitle,
    mutation,
    normalized,
    existingPreview,
  } = params;

  const contentUpdate: Prisma.ContentNodeUpdateInput = {};
  if (mutation.title?.trim()) {
    contentUpdate.title = mutation.title.trim().slice(0, 255);
    contentUpdate.slug = await generateUniqueSlug(contentUpdate.title, userId, contentId);
  }
  if (mutation.parentChromeNodeId) {
    contentUpdate.parent = {
      connect: {
        id: await getMappedParentContentId(connection, mutation.parentChromeNodeId),
      },
    };
  }

  if (Object.keys(contentUpdate).length > 0) {
    await prisma.contentNode.update({
      where: { id: contentId },
      data: contentUpdate,
    });
  }

  await prisma.externalPayload.update({
    where: { contentId },
    data: {
      ...(mutation.url?.trim() ? { url: mutation.url.trim() } : {}),
      ...(mutation.preserveHtml !== undefined
        ? { subtype: mutation.preserveHtml ? "preserved-html" : "website" }
        : {}),
      ...(mutation.description !== undefined
        ? { description: normalizeOptionalBookmarkText(mutation.description) }
        : {}),
      ...(mutation.resourceType !== undefined
        ? { resourceType: normalizeOptionalBookmarkTagValue(mutation.resourceType) }
        : {}),
      ...(mutation.resourceRelationship !== undefined
        ? {
            resourceRelationship: normalizeOptionalBookmarkTagValue(
              mutation.resourceRelationship
            ),
          }
        : {}),
      ...(mutation.userIntent !== undefined
        ? { userIntent: normalizeOptionalBookmarkTagValue(mutation.userIntent) }
        : {}),
      ...normalized,
      preview: buildExternalPreviewFromMutation(mutation, normalized, existingPreview),
    },
  });

  await ensureWebResourceForExternalContent(userId, {
    contentId,
    url: mutation.url?.trim() || "https://example.com",
    canonicalUrl: normalized.canonicalUrl,
    title:
      typeof contentUpdate.title === "string"
        ? contentUpdate.title
        : mutation.title?.trim() || null,
    faviconUrl: normalized.faviconUrl,
  });

  if (mappingId) {
    await prisma.bookmarkSyncLink.update({
      where: { id: mappingId },
      data: {
        chromeParentId: mutation.parentChromeNodeId ?? currentChromeParentId,
        normalizedUrl: normalized.normalizedUrl ?? currentNormalizedUrl,
        lastKnownTitle: mutation.title?.trim() || currentLastKnownTitle,
        lastSeenAt: new Date(mutation.observedAt),
      },
    });
  }
}

function externalPayloadToResponse(content: ContentWithSyncPayload["externalPayload"], noteText: string | null, tags: string[]): BrowserSyncNodeRecord["external"] {
  if (!content) return undefined;
  return {
    url: content.url,
    normalizedUrl: content.normalizedUrl ?? null,
    canonicalUrl: content.canonicalUrl ?? null,
    subtype: content.subtype ?? "website",
    readingStatus: content.readingStatus,
    description: content.description ?? null,
    resourceType: content.resourceType ?? null,
    resourceRelationship: content.resourceRelationship ?? null,
    userIntent: content.userIntent ?? null,
    sourceDomain: content.sourceDomain ?? null,
    sourceHostname: content.sourceHostname ?? null,
    faviconUrl: content.faviconUrl ?? null,
    preserveHtml: content.preserveHtml,
    noteText,
    tags,
    preview: (content.preview ?? {}) as Record<string, unknown>,
    captureMetadata: (content.captureMetadata ?? {}) as Record<string, unknown>,
    matchMetadata: (content.matchMetadata ?? {}) as Record<string, unknown>,
    preservedHtmlSnapshot: (content.preservedHtmlSnapshot as Record<string, unknown> | null) ?? null,
    preservedHtmlCapturedAt: asIsoString(content.preservedHtmlCapturedAt),
  };
}

async function loadSubtreeContent(
  userId: string,
  rootId: string
) {
  const allContent = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      OR: [{ contentType: "folder" }, { contentType: "external" }],
    },
    include: {
      folderPayload: true,
      externalPayload: true,
      notePayload: true,
      bookmarkSyncLinks: true,
      children: {
        where: { deletedAt: null },
        select: { id: true },
      },
      contentTags: {
        include: {
          tag: { select: { slug: true } },
        },
      },
    },
  });

  const byParent = new Map<string | null, ContentWithSyncPayload[]>();
  const byId = new Map<string, ContentWithSyncPayload>();
  for (const item of allContent as ContentWithSyncPayload[]) {
    byId.set(item.id, item);
    const list = byParent.get(item.parentId) ?? [];
    list.push(item);
    byParent.set(item.parentId, list);
  }

  const subtree: ContentWithSyncPayload[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = byId.get(currentId);
    if (!node || node.deletedAt) continue;
    subtree.push(node);
    for (const child of byParent.get(currentId) ?? []) {
      queue.push(child.id);
    }
  }

  return subtree;
}

function serializeNodeForSync(
  connection: ConnectionWithRoot,
  content: ContentWithSyncPayload,
  parentChromeIdByContentId: Map<string, string>
): BrowserSyncNodeRecord {
  const mapping =
    content.bookmarkSyncLinks.find((link) => link.connectionId === connection.id) ?? null;
  const noteText = extractNoteText(content.notePayload);
  const tags = content.contentTags.map((entry) => entry.tag.slug);

  return {
    contentId: content.id,
    chromeNodeId: mapping?.chromeNodeId ?? null,
    parentContentId: content.parentId,
    parentChromeNodeId:
      content.parentId === connection.appRootId
        ? connection.chromeRootId
        : (content.parentId ? parentChromeIdByContentId.get(content.parentId) ?? null : null),
    nodeKind: content.contentType === "folder" ? "folder" : "bookmark",
    contentType: content.contentType === "folder" ? "folder" : "external",
    payloadShape: content.contentType === "folder" ? "folder-v1" : "external-reference-v1",
    title: content.title,
    createdAt: content.createdAt.toISOString(),
    updatedAt: (
      content.externalPayload?.updatedAt ??
      content.folderPayload?.updatedAt ??
      content.updatedAt
    ).toISOString(),
    deletedAt: asIsoString(content.deletedAt),
    folder:
      content.contentType === "folder"
        ? { childCount: content.children.length }
        : undefined,
    external:
      content.contentType === "external"
        ? externalPayloadToResponse(content.externalPayload, noteText, tags)
        : undefined,
  };
}

function getNodeUpdatedAt(content: ContentWithSyncPayload) {
  return (
    content.externalPayload?.updatedAt ??
    content.folderPayload?.updatedAt ??
    content.updatedAt
  );
}

export async function listBrowserExtensionTokens(userId: string) {
  const tokens = await prisma.browserExtensionToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return tokens.map(formatTokenRecord);
}

export async function createBrowserExtensionTokenRecord(
  userId: string,
  input: { name: string; expiresAt?: string | null; scopes?: string[] }
): Promise<BrowserExtensionTokenCreateResponse> {
  const tokenValue = createBrowserExtensionTokenValue();
  const token = await prisma.browserExtensionToken.create({
    data: {
      userId,
      name: input.name.trim() || "Browser Bookmarks",
      tokenHash: hashBrowserExtensionToken(tokenValue),
      tokenPrefix: createBrowserExtensionTokenPrefix(tokenValue),
      scopes:
        input.scopes && input.scopes.length > 0
          ? input.scopes
          : [BROWSER_BOOKMARKS_SCOPE],
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });

  return {
    token: tokenValue,
    record: formatTokenRecord(token),
  };
}

export async function revokeBrowserExtensionToken(userId: string, tokenId: string) {
  const token = await prisma.browserExtensionToken.findFirst({
    where: { id: tokenId, userId },
  });
  if (!token) {
    throw new Error("Browser extension token not found");
  }

  const updated = await prisma.browserExtensionToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  });

  return formatTokenRecord(updated);
}

export async function listBrowserExtensionInstalls(userId: string) {
  const installs = await prisma.browserExtensionInstall.findMany({
    where: { userId, revokedAt: null },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
  });

  return installs.map(formatInstallRecord);
}

export async function trustBrowserExtensionInstall(
  userId: string,
  input: {
    installInstanceId: string;
    extensionId: string;
    extensionName: string;
    extensionVersion: string;
    browserName: string;
    browserVersion?: string | null;
    osName: string;
    osVersion?: string | null;
  }
): Promise<BrowserExtensionInstallTrustResponse> {
  const existing = await prisma.browserExtensionInstall.findFirst({
    where: {
      userId,
      installInstanceId: input.installInstanceId,
      revokedAt: null,
    },
    include: { token: true },
  });

  const tokenValue = createBrowserExtensionTokenValue();

  if (existing) {
    const token = await prisma.browserExtensionToken.update({
      where: { id: existing.tokenId },
      data: {
        tokenHash: hashBrowserExtensionToken(tokenValue),
        tokenPrefix: createBrowserExtensionTokenPrefix(tokenValue),
        revokedAt: null,
        expiresAt: null,
      },
    });

    const install = await prisma.browserExtensionInstall.update({
      where: { id: existing.id },
      data: {
        extensionId: input.extensionId,
        extensionName: input.extensionName,
        extensionVersion: input.extensionVersion,
        browserName: input.browserName,
        browserVersion: input.browserVersion ?? null,
        osName: input.osName,
        osVersion: input.osVersion ?? null,
        trustedAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
      },
    });

    return {
      token: tokenValue,
      install: formatInstallRecord({ ...install, tokenId: token.id }),
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const token = await tx.browserExtensionToken.create({
      data: {
        userId,
        name: `${input.browserName} Browser Bookmarks`,
        tokenHash: hashBrowserExtensionToken(tokenValue),
        tokenPrefix: createBrowserExtensionTokenPrefix(tokenValue),
        scopes: [BROWSER_BOOKMARKS_SCOPE],
      },
    });

    const install = await tx.browserExtensionInstall.create({
      data: {
        userId,
        tokenId: token.id,
        installInstanceId: input.installInstanceId,
        extensionId: input.extensionId,
        extensionName: input.extensionName,
        extensionVersion: input.extensionVersion,
        browserName: input.browserName,
        browserVersion: input.browserVersion ?? null,
        osName: input.osName,
        osVersion: input.osVersion ?? null,
        trustedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    return { token, install };
  });

  return {
    token: tokenValue,
    install: formatInstallRecord({ ...created.install, tokenId: created.token.id }),
  };
}

export async function refreshBrowserExtensionInstall(userId: string, installId: string) {
  const install = await prisma.browserExtensionInstall.findFirst({
    where: { id: installId, userId, revokedAt: null },
    include: { token: true },
  });
  if (!install) {
    throw new Error("Trusted browser install not found");
  }

  const tokenValue = createBrowserExtensionTokenValue();
  await prisma.browserExtensionToken.update({
    where: { id: install.tokenId },
    data: {
      tokenHash: hashBrowserExtensionToken(tokenValue),
      tokenPrefix: createBrowserExtensionTokenPrefix(tokenValue),
      revokedAt: null,
      expiresAt: null,
    },
  });

  const updatedInstall = await prisma.browserExtensionInstall.update({
    where: { id: install.id },
    data: { lastSeenAt: new Date(), trustedAt: new Date() },
  });

  return {
    token: tokenValue,
    install: formatInstallRecord({ ...updatedInstall, tokenId: install.tokenId }),
  } satisfies BrowserExtensionInstallTrustResponse;
}

export async function revokeBrowserExtensionInstall(userId: string, installId: string) {
  const install = await prisma.browserExtensionInstall.findFirst({
    where: { id: installId, userId, revokedAt: null },
  });
  if (!install) {
    throw new Error("Trusted browser install not found");
  }

  await prisma.$transaction([
    prisma.browserExtensionInstall.update({
      where: { id: install.id },
      data: { revokedAt: new Date() },
    }),
    prisma.browserExtensionToken.update({
      where: { id: install.tokenId },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { id: install.id };
}

export async function listBookmarkSyncConnections(userId: string) {
  const connections = await prisma.bookmarkSyncConnection.findMany({
    where: { userId },
    include: {
      installLinks: {
        select: {
          installId: true,
          chromeRootId: true,
          chromeRootTitle: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return connections.map(formatConnectionRecord);
}

export async function listAuthorizedBookmarkSyncConnections(
  userId: string,
  installId: string | null
) {
  if (!installId) {
    return listBookmarkSyncConnections(userId);
  }

  const connections = await prisma.bookmarkSyncConnection.findMany({
    where: {
      userId,
      OR: [
        { installLinks: { some: { installId } } },
        { token: { is: { install: { is: { id: installId, revokedAt: null } } } } },
      ],
    },
    include: {
      installLinks: {
        where: { installId },
        select: {
          installId: true,
          chromeRootId: true,
          chromeRootTitle: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return connections.map((connection) =>
    formatConnectionRecord({
      ...connection,
      chromeRootId: getEffectiveChromeRootId(connection),
      chromeRootTitle: getEffectiveChromeRootTitle(connection),
    })
  );
}

export async function createBookmarkSyncConnection(
  userId: string,
  input: {
    name: string;
    tokenId?: string | null;
    appRootId: string;
    chromeRootId: string;
    chromeRootTitle: string;
    installIds?: string[];
    currentInstallId?: string | null;
  }
) {
  const uniqueInstallIds = Array.from(new Set(input.installIds ?? []));

  const appRoot = await prisma.contentNode.findFirst({
    where: {
      id: input.appRootId,
      ownerId: userId,
      contentType: "folder",
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!appRoot) {
    throw new Error("App root folder not found");
  }

  if (input.tokenId) {
    const token = await prisma.browserExtensionToken.findFirst({
      where: { id: input.tokenId, userId, revokedAt: null },
      select: { id: true },
    });
    if (!token) {
      throw new Error("Browser extension token not found");
    }
  }

  const trustedInstalls =
    uniqueInstallIds.length > 0
      ? await prisma.browserExtensionInstall.findMany({
          where: {
            id: { in: uniqueInstallIds },
            userId,
            revokedAt: null,
          },
          select: { id: true },
        })
      : [];

  if (!input.tokenId && trustedInstalls.length === 0) {
    throw new Error("At least one trusted browser install is required");
  }

  const created = await prisma.bookmarkSyncConnection.create({
    data: {
      userId,
      tokenId: input.tokenId ?? null,
      name: input.name.trim() || input.chromeRootTitle.trim() || "Bookmarks",
      appRootId: input.appRootId,
      chromeRootId: input.chromeRootId.trim(),
      chromeRootTitle: input.chromeRootTitle.trim() || "Bookmarks",
      installLinks:
        trustedInstalls.length > 0
          ? {
              create: trustedInstalls.map((install) => ({
                installId: install.id,
                chromeRootId:
                  input.currentInstallId && install.id === input.currentInstallId
                    ? input.chromeRootId.trim()
                    : null,
                chromeRootTitle: input.chromeRootTitle.trim() || "Bookmarks",
              })),
            }
          : undefined,
    },
    include: {
      installLinks: {
        select: {
          installId: true,
          chromeRootId: true,
          chromeRootTitle: true,
        },
      },
    },
  });

  return formatConnectionRecord(created);
}

export async function updateBookmarkSyncConnection(
  userId: string,
  connectionId: string,
  input: {
    name?: string;
    tokenId?: string | null;
    chromeRootTitle?: string;
    appRootId?: string;
  }
) {
  const existing = await getOwnedConnection(userId, connectionId);

  if (input.appRootId) {
    const appRoot = await prisma.contentNode.findFirst({
      where: {
        id: input.appRootId,
        ownerId: userId,
        contentType: "folder",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!appRoot) {
      throw new Error("App root folder not found");
    }
  }

  const updated = await prisma.bookmarkSyncConnection.update({
    where: { id: existing.id },
    data: {
      name: input.name?.trim() || undefined,
      tokenId: input.tokenId === undefined ? undefined : input.tokenId,
      chromeRootTitle: input.chromeRootTitle?.trim() || undefined,
      appRootId: input.appRootId ?? undefined,
    },
  });

  return formatConnectionRecord(updated);
}

export async function deleteBookmarkSyncConnection(userId: string, connectionId: string) {
  const existing = await getOwnedConnection(userId, connectionId);
  await prisma.bookmarkSyncConnection.delete({ where: { id: existing.id } });
  return { id: existing.id };
}

export async function getBookmarkSyncBootstrap(
  userId: string,
  connectionId: string,
  installId?: string | null
): Promise<BookmarkSyncBootstrapResponse> {
  const connection = installId
    ? await getAuthorizedConnectionForInstall(userId, connectionId, installId)
    : await getOwnedConnection(userId, connectionId);
  const subtree = await loadSubtreeContent(userId, connection.appRootId);
  const parentChromeIdByContentId = new Map<string, string>();
  for (const item of subtree) {
    const mapping = item.bookmarkSyncLinks.find((link) => link.connectionId === connection.id);
    if (mapping?.chromeNodeId) {
      parentChromeIdByContentId.set(item.id, mapping.chromeNodeId);
    }
  }
  const nodes = subtree
    .filter((item) => item.id !== connection.appRootId)
    .map((item) => serializeNodeForSync(connection, item, parentChromeIdByContentId));

  const cursor =
    subtree
      .map(getNodeUpdatedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?.toISOString() ?? new Date(0).toISOString();

  await prisma.bookmarkSyncConnection.update({
    where: { id: connection.id },
    data: {
      lastPulledAt: new Date(),
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
  });

  return {
    connection: formatConnectionRecord(connection),
    cursor,
    nodes,
  };
}

export async function applyBrowserSyncMutations(
  userId: string,
  connectionId: string,
  mutations: BrowserSyncMutation[],
  installId?: string | null
): Promise<BrowserSyncPushResponse> {
  const connection = installId
    ? await getAuthorizedConnectionForInstall(userId, connectionId, installId)
    : await getOwnedConnection(userId, connectionId);
  const results: BrowserSyncPushResponse["results"] = [];

  for (const mutation of mutations) {
    try {
      if (mutation.nodeKind === "folder") {
        if (mutation.mutationType === "create") {
          const parentId = await getMappedParentContentId(
            connection,
            mutation.parentChromeNodeId
          );
          const displayOrder = await nextDisplayOrder(parentId);
          const title = (mutation.title?.trim() || "Untitled Folder").slice(0, 255);
          const created = await prisma.contentNode.create({
            data: {
              ownerId: userId,
              title,
              slug: await generateUniqueSlug(title, userId),
              contentType: "folder",
              parentId,
              displayOrder,
              folderPayload: {
                create: {
                  viewMode: "list",
                  sortMode: null,
                  viewPrefs: {},
                  includeReferencedContent: false,
                },
              },
            },
          });
          if (mutation.chromeNodeId) {
            await prisma.bookmarkSyncLink.create({
              data: {
                connectionId: connection.id,
                contentId: created.id,
                chromeNodeId: mutation.chromeNodeId,
                chromeParentId: mutation.parentChromeNodeId ?? getEffectiveChromeRootId(connection),
                nodeType: "folder",
                lastKnownTitle: title,
              },
            });
          }
          results.push({
            mutationType: mutation.mutationType,
            chromeNodeId: mutation.chromeNodeId ?? null,
            contentId: created.id,
            status: "applied",
          });
          continue;
        }

        const mapping = mutation.chromeNodeId
          ? await prisma.bookmarkSyncLink.findFirst({
              where: {
                connectionId: connection.id,
                chromeNodeId: mutation.chromeNodeId,
              },
              include: {
                content: {
                  include: {
                    children: {
                      where: { deletedAt: null },
                      select: { id: true },
                    },
                  },
                },
              },
            })
          : null;

        if (!mapping) {
          results.push({
            mutationType: mutation.mutationType,
            chromeNodeId: mutation.chromeNodeId ?? null,
            contentId: null,
            status: "skipped",
            message: "Folder mapping not found",
          });
          continue;
        }

        if (mutation.mutationType === "delete") {
          if (mapping.content.children.length > 0) {
            results.push({
              mutationType: mutation.mutationType,
              chromeNodeId: mutation.chromeNodeId ?? null,
              contentId: mapping.contentId,
              status: "skipped",
              message: "Only empty synced folders can be deleted in v1",
            });
            continue;
          }

          await softDeleteContentNode(mapping.contentId, userId);
          results.push({
            mutationType: mutation.mutationType,
            chromeNodeId: mutation.chromeNodeId ?? null,
            contentId: mapping.contentId,
            status: "applied",
          });
          continue;
        }

        const updateData: Prisma.ContentNodeUpdateInput = {};
        if (mutation.title?.trim()) {
          updateData.title = mutation.title.trim().slice(0, 255);
          updateData.slug = await generateUniqueSlug(updateData.title, userId, mapping.contentId);
        }
        if (mutation.parentChromeNodeId) {
          updateData.parent = {
            connect: {
              id: await getMappedParentContentId(connection, mutation.parentChromeNodeId),
            },
          };
        }

        await prisma.contentNode.update({
          where: { id: mapping.contentId },
          data: updateData,
        });
        await prisma.bookmarkSyncLink.update({
          where: { id: mapping.id },
          data: {
            chromeParentId: mutation.parentChromeNodeId ?? mapping.chromeParentId,
            lastKnownTitle: mutation.title?.trim() || mapping.lastKnownTitle,
            lastSeenAt: new Date(mutation.observedAt),
          },
        });
        results.push({
          mutationType: mutation.mutationType,
          chromeNodeId: mutation.chromeNodeId ?? null,
          contentId: mapping.contentId,
          status: "applied",
        });
        continue;
      }

      const normalized = normalizeExternalFields({
        url: mutation.url ?? null,
        canonicalUrl: mutation.canonicalUrl ?? null,
        faviconUrl: mutation.faviconUrl ?? null,
        readingStatus: mutation.readingStatus ?? null,
        preserveHtml: mutation.preserveHtml,
        preservedHtmlSnapshot: mutation.preservedHtmlSnapshot ?? null,
        captureMetadata: mutation.captureMetadata,
        matchMetadata: mutation.matchMetadata,
      });

      if (mutation.mutationType === "create") {
        const existingMapping = mutation.chromeNodeId
          ? await prisma.bookmarkSyncLink.findFirst({
              where: {
                connectionId: connection.id,
                chromeNodeId: mutation.chromeNodeId,
              },
              include: {
                content: {
                  include: {
                    externalPayload: true,
                  },
                },
              },
            })
          : null;

        if (existingMapping) {
          await applyExternalBookmarkUpdate({
            connection,
            userId,
            contentId: existingMapping.contentId,
            mappingId: existingMapping.id,
            currentChromeParentId: existingMapping.chromeParentId,
            currentNormalizedUrl: existingMapping.normalizedUrl,
            currentLastKnownTitle: existingMapping.lastKnownTitle,
            mutation,
            normalized,
            existingPreview: existingMapping.content.externalPayload?.preview ?? null,
          });

          results.push({
            mutationType: mutation.mutationType,
            chromeNodeId: mutation.chromeNodeId ?? null,
            contentId: existingMapping.contentId,
            status: "applied",
            message: "Existing bookmark mapping updated",
          });
          continue;
        }

        const parentId = await getMappedParentContentId(
          connection,
          mutation.parentChromeNodeId
        );
        const displayOrder = await nextDisplayOrder(parentId);
        const title = (mutation.title?.trim() || mutation.url?.trim() || "Untitled Bookmark").slice(
          0,
          255
        );
        const dedupeTarget =
          mutation.dedupeEnabled && normalized.normalizedUrl
            ? await findExistingExternalForDedupe(
                userId,
                normalized.normalizedUrl,
                normalized.canonicalUrl
              )
            : null;

        const contentId = dedupeTarget?.id
          ? dedupeTarget.id
          : (
              await prisma.contentNode.create({
                data: {
                  ownerId: userId,
                  title,
                  slug: await generateUniqueSlug(title, userId),
                  contentType: "external",
                  parentId,
                  displayOrder,
                  externalPayload: {
                    create: {
                      url: mutation.url?.trim() || "https://example.com",
                      subtype: mutation.preserveHtml ? "preserved-html" : "website",
                      description: normalizeOptionalBookmarkText(mutation.description),
                      resourceType: normalizeOptionalBookmarkTagValue(mutation.resourceType),
                      resourceRelationship: normalizeOptionalBookmarkTagValue(
                        mutation.resourceRelationship
                      ),
                      userIntent: normalizeOptionalBookmarkTagValue(mutation.userIntent),
                      preview: buildExternalPreviewFromMutation(mutation, normalized),
                      ...normalized,
                    },
                  },
                },
              })
            ).id;

        if (dedupeTarget) {
          await prisma.contentNode.update({
            where: { id: contentId },
            data: {
              title,
              slug: await generateUniqueSlug(title, userId, contentId),
              parentId,
            },
          });
          await prisma.externalPayload.update({
            where: { contentId },
            data: {
              url: mutation.url?.trim() || dedupeTarget.externalPayload?.url || "https://example.com",
              subtype: mutation.preserveHtml ? "preserved-html" : "website",
              description: normalizeOptionalBookmarkText(mutation.description),
              resourceType: normalizeOptionalBookmarkTagValue(mutation.resourceType),
              resourceRelationship: normalizeOptionalBookmarkTagValue(
                mutation.resourceRelationship
              ),
              userIntent: normalizeOptionalBookmarkTagValue(mutation.userIntent),
              ...normalized,
              preview: buildExternalPreviewFromMutation(
                mutation,
                normalized,
                dedupeTarget.externalPayload?.preview ?? null
              ),
            },
          });
        }

        await ensureWebResourceForExternalContent(userId, {
          contentId,
          url: mutation.url?.trim() || dedupeTarget?.externalPayload?.url || "https://example.com",
          canonicalUrl: normalized.canonicalUrl,
          title,
          faviconUrl: normalized.faviconUrl,
        });

        if (mutation.chromeNodeId) {
          await prisma.bookmarkSyncLink.upsert({
            where: {
              connectionId_chromeNodeId: {
                connectionId: connection.id,
                chromeNodeId: mutation.chromeNodeId,
              },
            },
            update: {
              contentId,
              chromeParentId: mutation.parentChromeNodeId ?? getEffectiveChromeRootId(connection),
              nodeType: "bookmark",
              normalizedUrl: normalized.normalizedUrl,
              lastKnownTitle: title,
              lastSeenAt: new Date(mutation.observedAt),
            },
            create: {
              connectionId: connection.id,
              contentId,
              chromeNodeId: mutation.chromeNodeId,
              chromeParentId: mutation.parentChromeNodeId ?? getEffectiveChromeRootId(connection),
              nodeType: "bookmark",
              normalizedUrl: normalized.normalizedUrl,
              lastKnownTitle: title,
              lastSeenAt: new Date(mutation.observedAt),
            },
          });
        }
        results.push({
          mutationType: mutation.mutationType,
          chromeNodeId: mutation.chromeNodeId ?? null,
          contentId,
          status: "applied",
        });
        continue;
      }

      const mapping = mutation.chromeNodeId
        ? await prisma.bookmarkSyncLink.findFirst({
            where: {
              connectionId: connection.id,
              chromeNodeId: mutation.chromeNodeId,
            },
            include: {
              content: {
                include: {
                  externalPayload: true,
                },
              },
            },
          })
        : null;

      if (!mapping) {
        results.push({
          mutationType: mutation.mutationType,
          chromeNodeId: mutation.chromeNodeId ?? null,
          contentId: null,
          status: "skipped",
          message: "Bookmark mapping not found",
        });
        continue;
      }

      if (mutation.mutationType === "delete") {
        await softDeleteContentNode(mapping.contentId, userId);
        results.push({
          mutationType: mutation.mutationType,
          chromeNodeId: mutation.chromeNodeId ?? null,
          contentId: mapping.contentId,
          status: "applied",
        });
        continue;
      }

      await applyExternalBookmarkUpdate({
        connection,
        userId,
        contentId: mapping.contentId,
        mappingId: mapping.id,
        currentChromeParentId: mapping.chromeParentId,
        currentNormalizedUrl: mapping.normalizedUrl,
        currentLastKnownTitle: mapping.lastKnownTitle,
        mutation,
        normalized,
        existingPreview: mapping.content.externalPayload?.preview ?? null,
      });

      results.push({
        mutationType: mutation.mutationType,
        chromeNodeId: mutation.chromeNodeId ?? null,
        contentId: mapping.contentId,
        status: "applied",
      });
    } catch (error) {
      results.push({
        mutationType: mutation.mutationType,
        chromeNodeId: mutation.chromeNodeId ?? null,
        contentId: null,
        status: "errored",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const now = new Date();
  const updatedConnection = await prisma.bookmarkSyncConnection.update({
    where: { id: connection.id },
    data: {
      lastPushedAt: now,
      lastSyncedAt: now,
      lastSyncError: results.some((result) => result.status === "errored")
        ? "One or more bookmark mutations failed"
        : null,
    },
  });

  return {
    connection: formatConnectionRecord(updatedConnection),
    cursor: now.toISOString(),
    results,
  };
}

export async function getAppSyncDeltas(
  userId: string,
  connectionId: string,
  since?: string | null,
  installId?: string | null
): Promise<BrowserSyncPullResponse> {
  const connection = installId
    ? await getAuthorizedConnectionForInstall(userId, connectionId, installId)
    : await getOwnedConnection(userId, connectionId);
  const subtree = await loadSubtreeContent(userId, connection.appRootId);
  const parentChromeIdByContentId = new Map<string, string>();
  for (const item of subtree) {
    const mapping = item.bookmarkSyncLinks.find((link) => link.connectionId === connection.id);
    if (mapping?.chromeNodeId) {
      parentChromeIdByContentId.set(item.id, mapping.chromeNodeId);
    }
  }
  const sinceDate = since ? new Date(since) : new Date(0);

  const deltas = subtree
    .filter((content) => content.id !== connection.appRootId)
    .filter((content) => getNodeUpdatedAt(content).getTime() >= sinceDate.getTime())
    .map((content) => {
      const mapping = content.bookmarkSyncLinks.find((link) => link.connectionId === connection.id);
      const isDelete = Boolean(content.deletedAt && content.deletedAt.getTime() >= sinceDate.getTime());
      return {
        mutationType: isDelete ? "delete" : mapping ? "update" : "create",
        node: serializeNodeForSync(connection, content, parentChromeIdByContentId),
      } as BrowserSyncPullResponse["deltas"][number];
    });

  const cursor =
    subtree
      .map(getNodeUpdatedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?.toISOString() ?? new Date().toISOString();

  const updatedConnection = await prisma.bookmarkSyncConnection.update({
    where: { id: connection.id },
    data: {
      lastPulledAt: new Date(),
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
  });

  return {
    connection: formatConnectionRecord(updatedConnection),
    cursor,
    deltas,
  };
}

export async function getBrowserReadingQueue(
  userId: string,
  input: {
    connectionId?: string | null;
    statuses?: ExternalReadingStatus[];
    installId?: string | null;
  }
) {
  const where: Prisma.ContentNodeWhereInput = {
    ownerId: userId,
    deletedAt: null,
    contentType: "external",
    externalPayload: {
      is: {
        readingStatus:
          input.statuses && input.statuses.length > 0
            ? { in: input.statuses }
            : undefined,
      },
    },
  };

  if (input.connectionId) {
    if (input.installId) {
      await getAuthorizedConnectionForInstall(userId, input.connectionId, input.installId);
    }
    where.bookmarkSyncLinks = {
      some: {
        connectionId: input.connectionId,
      },
    };
  }

  const items = await prisma.contentNode.findMany({
    where,
    include: {
      externalPayload: true,
      notePayload: true,
      contentTags: {
        include: {
          tag: { select: { slug: true } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return items.map((item) => {
    const noteText = extractNoteText(item.notePayload);
    return {
      contentId: item.id,
      title: item.title,
      parentId: item.parentId,
      updatedAt: item.updatedAt.toISOString(),
      external: externalPayloadToResponse(
        item.externalPayload,
        noteText,
        item.contentTags.map((tag) => tag.tag.slug)
      )!,
    } satisfies BrowserReadingQueueItem;
  });
}

export {
  getBrowserBookmarksCapability,
  formatConnectionRecord,
  formatTokenRecord,
};
