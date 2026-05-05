import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content";
import { normalizeUrl } from "@/lib/domain/content/external-validation";
import { markdownToTiptap } from "@/lib/domain/content/markdown";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { syncContentTags } from "@/lib/domain/content/tag-sync";
import { syncImageReferences } from "@/lib/domain/content/image-refs";
import { syncPersonMentions } from "@/lib/domain/content/person-mention-sync";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import type { JSONContent } from "@tiptap/core";

function asIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function trimNullable(value: string | null | undefined, maxLength = 2048) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function extractDomainParts(url: string | null | undefined) {
  if (!url) return { hostname: null, domain: null };
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const parts = hostname.split(".").filter(Boolean);
    const domain =
      parts.length >= 2
        ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
        : hostname;
    return { hostname, domain };
  } catch {
    return { hostname: null, domain: null };
  }
}

function getIdentityUrl(url: string, canonicalUrl?: string | null) {
  return normalizeUrl(canonicalUrl || url);
}

type ResourceInput = {
  url: string;
  canonicalUrl?: string | null;
  title?: string | null;
  faviconUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function resolveOrCreateWebResource(userId: string, input: ResourceInput) {
  const normalizedUrl = normalizeUrl(input.url);
  const canonicalUrl = input.canonicalUrl ? normalizeUrl(input.canonicalUrl) : null;
  const identityUrl = getIdentityUrl(normalizedUrl, canonicalUrl);
  const domains = extractDomainParts(canonicalUrl || normalizedUrl);

  const existing = await prisma.webResource.findUnique({
    where: {
      userId_identityUrl: {
        userId,
        identityUrl,
      },
    },
  });

  if (existing) {
    return prisma.webResource.update({
      where: { id: existing.id },
      data: {
        normalizedUrl,
        canonicalUrl,
        title: trimNullable(input.title, 255) ?? existing.title,
        faviconUrl: trimNullable(input.faviconUrl),
        sourceHostname: domains.hostname,
        sourceDomain: domains.domain,
        metadata: (input.metadata ?? existing.metadata ?? {}) as Prisma.JsonObject,
      },
    });
  }

  return prisma.webResource.create({
    data: {
      userId,
      identityUrl,
      normalizedUrl,
      canonicalUrl,
      title: trimNullable(input.title, 255),
      faviconUrl: trimNullable(input.faviconUrl),
      sourceHostname: domains.hostname,
      sourceDomain: domains.domain,
      metadata: (input.metadata ?? {}) as Prisma.JsonObject,
    },
  });
}

export async function ensureWebResourceForExternalContent(
  userId: string,
  external: {
    contentId: string;
    url: string;
    canonicalUrl?: string | null;
    title?: string | null;
    faviconUrl?: string | null;
  }
) {
  const resource = await resolveOrCreateWebResource(userId, {
    url: external.url,
    canonicalUrl: external.canonicalUrl,
    title: external.title,
    faviconUrl: external.faviconUrl,
  });

  await prisma.externalPayload.update({
    where: { contentId: external.contentId },
    data: {
      webResourceId: resource.id,
    },
  });

  return resource;
}

async function ensureResourceForExternalNode(
  userId: string,
  content: {
    id: string;
    title: string;
    externalPayload: {
      webResourceId: string | null;
      url: string;
      canonicalUrl: string | null;
      faviconUrl: string | null;
    } | null;
  }
) {
  if (!content.externalPayload) return null;
  if (content.externalPayload.webResourceId) {
    return prisma.webResource.findUnique({
      where: { id: content.externalPayload.webResourceId },
    });
  }
  return ensureWebResourceForExternalContent(userId, {
    contentId: content.id,
    url: content.externalPayload.url,
    canonicalUrl: content.externalPayload.canonicalUrl,
    title: content.title,
    faviconUrl: content.externalPayload.faviconUrl,
  });
}

function formatAssociation(link: {
  id: string;
  metadata: Prisma.JsonValue;
  content: {
    id: string;
    title: string;
    slug: string;
    contentType: string;
    customIcon: string | null;
    iconColor: string | null;
  };
}) {
  return {
    id: link.id,
    metadata: (link.metadata ?? {}) as Record<string, unknown>,
    content: {
      id: link.content.id,
      title: link.content.title,
      slug: link.content.slug,
      contentType: link.content.contentType,
      customIcon: link.content.customIcon,
      iconColor: link.content.iconColor,
    },
  };
}

function formatViewState(state: {
  id: string;
  contentId: string;
  state: string;
  layoutMode: string;
  dockSide: string | null;
  positionX: number | null;
  positionY: number | null;
  width: number | null;
  height: number | null;
  opacity: number | null;
  embeddedSelector: string | null;
  embeddedPlacement: string | null;
  metadata: Prisma.JsonValue;
  lastActiveAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: state.id,
    contentId: state.contentId,
    state: state.state,
    layoutMode: state.layoutMode,
    dockSide: state.dockSide,
    positionX: state.positionX,
    positionY: state.positionY,
    width: state.width,
    height: state.height,
    opacity: state.opacity,
    embeddedSelector: state.embeddedSelector,
    embeddedPlacement: state.embeddedPlacement,
    metadata: (state.metadata ?? {}) as Record<string, unknown>,
    lastActiveAt: asIsoString(state.lastActiveAt),
    updatedAt: state.updatedAt.toISOString(),
  };
}

export async function getWebResourceContext(
  userId: string,
  installId: string,
  input: ResourceInput
) {
  const resource = await resolveOrCreateWebResource(userId, input);

  const [associations, externalContents, viewStates] = await Promise.all([
    prisma.webResourceContentLink.findMany({
      where: { userId, webResourceId: resource.id },
      include: {
        content: {
          select: {
            id: true,
            title: true,
            slug: true,
            contentType: true,
            customIcon: true,
            iconColor: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contentNode.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
        externalPayload: {
          webResourceId: resource.id,
        },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        contentType: true,
        customIcon: true,
        iconColor: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.webResourceViewState.findMany({
      where: {
        userId,
        installId,
        webResourceId: resource.id,
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    resource: {
      id: resource.id,
      identityUrl: resource.identityUrl,
      normalizedUrl: resource.normalizedUrl,
      canonicalUrl: resource.canonicalUrl,
      title: resource.title,
      faviconUrl: resource.faviconUrl,
      sourceHostname: resource.sourceHostname,
      sourceDomain: resource.sourceDomain,
      metadata: (resource.metadata ?? {}) as Record<string, unknown>,
      createdAt: resource.createdAt.toISOString(),
      updatedAt: resource.updatedAt.toISOString(),
    },
    associations: associations.map(formatAssociation),
    externalContents,
    viewStates: viewStates.map(formatViewState),
  };
}

export async function getWebResourceContextById(
  userId: string,
  installId: string,
  resourceId: string
) {
  const resource = await prisma.webResource.findFirst({
    where: { id: resourceId, userId },
  });
  if (!resource) {
    throw new Error("Web resource not found");
  }
  return getWebResourceContext(userId, installId, {
    url: resource.normalizedUrl,
    canonicalUrl: resource.canonicalUrl,
    title: resource.title,
    faviconUrl: resource.faviconUrl,
    metadata: (resource.metadata ?? {}) as Record<string, unknown>,
  });
}

export async function createWebResourceAssociation(
  userId: string,
  input: {
    webResourceId: string;
    contentId: string;
    metadata?: Record<string, unknown>;
  }
) {
  const content = await prisma.contentNode.findFirst({
    where: {
      id: input.contentId,
      ownerId: userId,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      contentType: true,
      customIcon: true,
      iconColor: true,
    },
  });

  if (!content) {
    throw new Error("Content not found");
  }
  if (content.contentType === "folder") {
    throw new Error("Folders cannot be associated");
  }

  const link = await prisma.webResourceContentLink.upsert({
    where: {
      webResourceId_contentId: {
        webResourceId: input.webResourceId,
        contentId: input.contentId,
      },
    },
    update: {
      metadata: (input.metadata ?? {}) as Prisma.JsonObject,
    },
    create: {
      userId,
      webResourceId: input.webResourceId,
      contentId: input.contentId,
      metadata: (input.metadata ?? {}) as Prisma.JsonObject,
    },
    include: {
      content: {
        select: {
          id: true,
          title: true,
          slug: true,
          contentType: true,
          customIcon: true,
          iconColor: true,
        },
      },
    },
  });

  return formatAssociation(link);
}

export async function deleteWebResourceAssociation(
  userId: string,
  input: {
    webResourceId: string;
    contentId: string;
  }
) {
  const existing = await prisma.webResourceContentLink.findFirst({
    where: {
      userId,
      webResourceId: input.webResourceId,
      contentId: input.contentId,
    },
  });
  if (!existing) {
    return { removed: false };
  }
  await prisma.webResourceContentLink.delete({
    where: { id: existing.id },
  });
  return { removed: true };
}

type TreeNode = {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  customIcon: string | null;
  iconColor: string | null;
  selectable: boolean;
  children: TreeNode[];
};

export async function getExtensionContentPickerTree(userId: string) {
  const nodes = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      deletedAt: null,
    },
    orderBy: [{ parentId: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      parentId: true,
      title: true,
      slug: true,
      contentType: true,
      customIcon: true,
      iconColor: true,
    },
  });

  const byParent = new Map<string | null, typeof nodes>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }

  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? []).map((node) => ({
      id: node.id,
      title: node.title,
      slug: node.slug,
      contentType: node.contentType,
      customIcon: node.customIcon,
      iconColor: node.iconColor,
      selectable: node.contentType !== "folder",
      children: build(node.id),
    }));

  return build(null);
}

async function nextSiblingDisplayOrder(userId: string, parentId: string | null) {
  const lastSibling = await prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      parentId,
      deletedAt: null,
    },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });

  return (lastSibling?.displayOrder ?? -1) + 1;
}

export async function createExtensionContentPickerItem(
  userId: string,
  input: {
    parentId?: string | null;
    type: "folder" | "note" | "external";
    title?: string | null;
    url?: string | null;
    description?: string | null;
    webResourceId?: string | null;
  }
) {
  const parentId = input.parentId ?? null;

  if (parentId) {
    const parent = await prisma.contentNode.findFirst({
      where: {
        id: parentId,
        ownerId: userId,
        deletedAt: null,
        contentType: "folder",
      },
      select: { id: true },
    });
    if (!parent) {
      throw new Error("Parent folder not found");
    }
  }

  const displayOrder = await nextSiblingDisplayOrder(userId, parentId);

  if (input.type === "folder") {
    const title = trimNullable(input.title, 255) || "Untitled Folder";
    const created = await prisma.contentNode.create({
      data: {
        ownerId: userId,
        parentId,
        title,
        slug: await generateUniqueSlug(title, userId),
        contentType: "folder",
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
      select: {
        id: true,
        title: true,
        slug: true,
        contentType: true,
      },
    });

    return created;
  }

  if (input.type === "note") {
    const title = trimNullable(input.title, 255) || "Untitled Note";
    const doc = { type: "doc", content: [{ type: "paragraph" }] } as Prisma.JsonObject;
    const created = await prisma.contentNode.create({
      data: {
        ownerId: userId,
        parentId,
        title,
        slug: await generateUniqueSlug(title, userId),
        contentType: "note",
        displayOrder,
        notePayload: {
          create: {
            tiptapJson: doc,
            searchText: "",
            metadata: {
              wordCount: 0,
              characterCount: 0,
              readingTime: 0,
            },
          },
        },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        contentType: true,
      },
    });

    if (input.webResourceId) {
      await prisma.webResourceContentLink.upsert({
        where: {
          webResourceId_contentId: {
            webResourceId: input.webResourceId,
            contentId: created.id,
          },
        },
        update: {
          metadata: {} as Prisma.JsonObject,
        },
        create: {
          userId,
          webResourceId: input.webResourceId,
          contentId: created.id,
          metadata: {} as Prisma.JsonObject,
        },
      });
    }

    return created;
  }

  const rawUrl = trimNullable(input.url) || "https://example.com";
  const normalizedUrl = normalizeUrl(rawUrl);
  const title = trimNullable(input.title, 255) || normalizedUrl;
  const resource =
    input.webResourceId
      ? await prisma.webResource.findFirst({
          where: { id: input.webResourceId, userId },
        })
      : null;
  const resolvedResource =
    resource ||
    (await resolveOrCreateWebResource(userId, {
      url: normalizedUrl,
      title,
    }));
  const domains = extractDomainParts(
    resolvedResource.canonicalUrl || resolvedResource.normalizedUrl
  );

  const created = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      parentId,
      title,
      slug: await generateUniqueSlug(title, userId),
      contentType: "external",
      displayOrder,
      externalPayload: {
        create: {
          webResourceId: resolvedResource.id,
          url: normalizedUrl,
          normalizedUrl,
          canonicalUrl: resolvedResource.canonicalUrl,
          description: trimNullable(input.description, 2000) ?? null,
          resourceType: null,
          resourceRelationship: null,
          userIntent: null,
          sourceDomain: domains.domain,
          sourceHostname: domains.hostname,
          faviconUrl: resolvedResource.faviconUrl,
          preserveHtml: false,
          preview: {
            title,
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      contentType: true,
    },
  });

  return created;
}

export async function listLinksPanelData(userId: string, contentId: string) {
  const content = await prisma.contentNode.findFirst({
    where: {
      id: contentId,
      ownerId: userId,
      deletedAt: null,
    },
    include: {
      notePayload: {
        select: {
          tiptapJson: true,
        },
      },
      externalPayload: {
        select: {
          webResourceId: true,
          url: true,
          canonicalUrl: true,
          faviconUrl: true,
        },
      },
    },
  });

  if (!content) {
    throw new Error("Content not found");
  }

  const webResource =
    content.contentType === "external" && content.externalPayload
      ? await ensureResourceForExternalNode(userId, {
          id: content.id,
          title: content.title,
          externalPayload: content.externalPayload,
        })
      : null;

  const webResourceLinks = webResource
    ? await prisma.webResourceContentLink.findMany({
        where: {
          userId,
          webResourceId: webResource.id,
        },
        include: {
          content: {
            select: {
              id: true,
              title: true,
              slug: true,
              contentType: true,
              customIcon: true,
              iconColor: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  const associationsForContent = await prisma.webResourceContentLink.findMany({
    where: {
      userId,
      contentId,
    },
    include: {
      webResource: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const backlinks =
    content.contentType === "note" && content.notePayload
      ? await listNoteBacklinks(userId, {
          id: content.id,
          title: content.title,
          slug: content.slug,
        })
      : [];

  return {
    content: {
      id: content.id,
      title: content.title,
      contentType: content.contentType,
    },
    backlinks,
    associatedWebResources: associationsForContent.map((entry) => ({
      id: entry.webResource.id,
      title: entry.webResource.title,
      normalizedUrl: entry.webResource.normalizedUrl,
      canonicalUrl: entry.webResource.canonicalUrl,
      faviconUrl: entry.webResource.faviconUrl,
      sourceDomain: entry.webResource.sourceDomain,
      sourceHostname: entry.webResource.sourceHostname,
      metadata: (entry.metadata ?? {}) as Record<string, unknown>,
    })),
    associatedContent:
      webResourceLinks
        .filter((entry) => entry.content.id !== contentId)
        .map(formatAssociation),
  };
}

async function listNoteBacklinks(
  userId: string,
  target: { id: string; title: string; slug: string }
) {
  const allNotes = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      deletedAt: null,
      notePayload: { isNot: null },
    },
    include: {
      notePayload: {
        select: {
          tiptapJson: true,
        },
      },
    },
  });

  const backlinks: Array<{
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    linkText: string;
    updatedAt: string;
  }> = [];

  for (const note of allNotes) {
    if (note.id === target.id) continue;
    const matches = findLinksInTipTap(
      note.notePayload?.tiptapJson as JSONContent,
      target.slug,
      target.title
    );
    if (matches.length === 0) continue;
    backlinks.push({
      id: note.id,
      title: note.title,
      slug: note.slug,
      excerpt: matches[0].context,
      linkText: matches[0].linkText,
      updatedAt: note.updatedAt.toISOString(),
    });
  }

  backlinks.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return backlinks;
}

function findLinksInTipTap(
  node: JSONContent | null | undefined,
  targetSlug: string,
  targetTitle: string
) {
  if (!node) return [];
  const matches: Array<{ linkText: string; context: string }> = [];

  function extractText(n: JSONContent): string {
    if (n.type === "text") return n.text || "";
    return (n.content ?? []).map(extractText).join("");
  }

  function walk(n: JSONContent, parentContext = ""): void {
    if (n.type === "wikiLink" && n.attrs?.targetTitle) {
      const linkTarget = String(n.attrs.targetTitle).toLowerCase();
      if (
        linkTarget === targetTitle.toLowerCase() ||
        linkTarget === targetSlug.toLowerCase()
      ) {
        const display = n.attrs.displayText
          ? `[[${n.attrs.targetTitle}|${n.attrs.displayText}]]`
          : `[[${n.attrs.targetTitle}]]`;
        matches.push({
          linkText: display,
          context: parentContext.trim() || display,
        });
      }
    }

    if (n.type === "text" && Array.isArray(n.marks)) {
      for (const mark of n.marks) {
        if (
          mark.type === "link" &&
          typeof mark.attrs?.href === "string" &&
          (mark.attrs.href === targetSlug ||
            mark.attrs.href.endsWith(`/${targetSlug}`))
        ) {
          matches.push({
            linkText: n.text || targetTitle,
            context: parentContext.trim() || n.text || targetTitle,
          });
        }
      }
    }

    const text = extractText(n);
    for (const child of n.content ?? []) {
      walk(child, text || parentContext);
    }
  }

  walk(node);
  return matches;
}

export async function getExtensionNoteContent(userId: string, contentId: string) {
  const content = await prisma.contentNode.findFirst({
    where: {
      id: contentId,
      ownerId: userId,
      deletedAt: null,
      contentType: "note",
    },
    include: {
      notePayload: true,
    },
  });
  if (!content) {
    throw new Error("Note not found");
  }
  return {
    id: content.id,
    title: content.title,
    contentType: content.contentType,
    note: {
      tiptapJson: (content.notePayload?.tiptapJson ?? { type: "doc", content: [{ type: "paragraph" }] }) as JSONContent,
      searchText: content.notePayload?.searchText ?? "",
      metadata: (content.notePayload?.metadata ?? {}) as Record<string, unknown>,
    },
  };
}

export async function updateExtensionNoteContent(
  userId: string,
  contentId: string,
  input: {
    tiptapJson?: JSONContent;
    markdown?: string;
  }
) {
  const content = await prisma.contentNode.findFirst({
    where: {
      id: contentId,
      ownerId: userId,
      deletedAt: null,
      contentType: "note",
    },
    select: {
      id: true,
    },
  });
  if (!content) {
    throw new Error("Note not found");
  }

  const parsedJson: JSONContent = input.markdown
    ? markdownToTiptap(input.markdown)
    : (input.tiptapJson as JSONContent);
  const json = sanitizeTipTapJsonWithExtensions(parsedJson, getServerExtensions()).json;
  const searchText = extractSearchTextFromTipTap(json);
  const wordCount = searchText.split(/\s+/).filter(Boolean).length;

  await prisma.notePayload.upsert({
    where: { contentId },
    update: {
      tiptapJson: json,
      searchText,
      metadata: {
        wordCount,
        characterCount: searchText.length,
        readingTime: Math.ceil(wordCount / 200),
      },
    },
    create: {
      contentId,
      tiptapJson: json,
      searchText,
      metadata: {
        wordCount,
        characterCount: searchText.length,
        readingTime: Math.ceil(wordCount / 200),
      },
    },
  });

  await syncContentTags(contentId, json, userId);
  await syncImageReferences(contentId, json, userId);
  await syncPersonMentions(contentId, json, userId);

  return getExtensionNoteContent(userId, contentId);
}

export async function getExtensionExternalContent(userId: string, contentId: string) {
  const content = await prisma.contentNode.findFirst({
    where: {
      id: contentId,
      ownerId: userId,
      deletedAt: null,
      contentType: "external",
    },
    include: {
      externalPayload: true,
    },
  });
  if (!content?.externalPayload) {
    throw new Error("External link not found");
  }

  const resource = await ensureResourceForExternalNode(userId, {
    id: content.id,
    title: content.title,
    externalPayload: {
      webResourceId: content.externalPayload.webResourceId,
      url: content.externalPayload.url,
      canonicalUrl: content.externalPayload.canonicalUrl,
      faviconUrl: content.externalPayload.faviconUrl,
    },
  });

  return {
    id: content.id,
    title: content.title,
    contentType: content.contentType,
    external: {
      url: content.externalPayload.url,
      normalizedUrl: content.externalPayload.normalizedUrl,
      canonicalUrl: content.externalPayload.canonicalUrl,
      description: content.externalPayload.description,
      resourceType: content.externalPayload.resourceType,
      resourceRelationship: content.externalPayload.resourceRelationship,
      userIntent: content.externalPayload.userIntent,
      sourceDomain: content.externalPayload.sourceDomain,
      sourceHostname: content.externalPayload.sourceHostname,
      faviconUrl: content.externalPayload.faviconUrl,
      preview: (content.externalPayload.preview ?? {}) as Record<string, unknown>,
      captureMetadata: (content.externalPayload.captureMetadata ?? {}) as Record<string, unknown>,
      matchMetadata: (content.externalPayload.matchMetadata ?? {}) as Record<string, unknown>,
      preserveHtml: content.externalPayload.preserveHtml,
      preservedHtmlSnapshot: (content.externalPayload.preservedHtmlSnapshot ?? null) as
        | Record<string, unknown>
        | null,
      preservedHtmlCapturedAt: asIsoString(content.externalPayload.preservedHtmlCapturedAt),
      webResourceId: resource?.id ?? content.externalPayload.webResourceId ?? null,
    },
  };
}

export async function updateExtensionExternalContent(
  userId: string,
  contentId: string,
  input: {
    title?: string;
    url?: string;
    canonicalUrl?: string | null;
    description?: string | null;
    resourceType?: string | null;
    resourceRelationship?: string | null;
    userIntent?: string | null;
    faviconUrl?: string | null;
    preview?: Record<string, unknown>;
    captureMetadata?: Record<string, unknown>;
    matchMetadata?: Record<string, unknown>;
    preserveHtml?: boolean;
  }
) {
  const content = await prisma.contentNode.findFirst({
    where: {
      id: contentId,
      ownerId: userId,
      deletedAt: null,
      contentType: "external",
    },
    include: {
      externalPayload: true,
    },
  });
  if (!content?.externalPayload) {
    throw new Error("External link not found");
  }

  const title = trimNullable(input.title, 255);
  if (title && title !== content.title) {
    await prisma.contentNode.update({
      where: { id: contentId },
      data: { title },
    });
  }

  const resolvedUrl = input.url ? normalizeUrl(input.url) : content.externalPayload.url;
  const resolvedCanonicalUrl =
    input.canonicalUrl !== undefined
      ? input.canonicalUrl
        ? normalizeUrl(input.canonicalUrl)
        : null
      : content.externalPayload.canonicalUrl;
  const resource = await resolveOrCreateWebResource(userId, {
    url: resolvedUrl,
    canonicalUrl: resolvedCanonicalUrl,
    title: title ?? content.title,
    faviconUrl: input.faviconUrl ?? content.externalPayload.faviconUrl,
    metadata: {
      ...(content.externalPayload.captureMetadata as Record<string, unknown>),
      editor: "extension-overlay",
    },
  });
  const domains = extractDomainParts(resolvedCanonicalUrl || resolvedUrl);

  await prisma.externalPayload.update({
    where: { contentId },
    data: {
      webResourceId: resource.id,
      url: resolvedUrl,
      normalizedUrl: normalizeUrl(resolvedUrl),
      canonicalUrl: resolvedCanonicalUrl,
      description:
        input.description !== undefined
          ? trimNullable(input.description, 2000)
          : undefined,
      resourceType:
        input.resourceType !== undefined
          ? trimNullable(input.resourceType, 120)
          : undefined,
      resourceRelationship:
        input.resourceRelationship !== undefined
          ? trimNullable(input.resourceRelationship, 120)
          : undefined,
      userIntent:
        input.userIntent !== undefined ? trimNullable(input.userIntent, 120) : undefined,
      faviconUrl:
        input.faviconUrl !== undefined ? trimNullable(input.faviconUrl) : undefined,
      sourceDomain: domains.domain,
      sourceHostname: domains.hostname,
      preview:
        input.preview !== undefined ? (input.preview as Prisma.JsonObject) : undefined,
      captureMetadata:
        input.captureMetadata !== undefined
          ? (input.captureMetadata as Prisma.JsonObject)
          : undefined,
      matchMetadata:
        input.matchMetadata !== undefined
          ? (input.matchMetadata as Prisma.JsonObject)
          : undefined,
      preserveHtml:
        input.preserveHtml !== undefined ? input.preserveHtml : undefined,
    },
  });

  return getExtensionExternalContent(userId, contentId);
}

export async function getExtensionViewState(
  userId: string,
  installId: string,
  webResourceId: string
) {
  const states = await prisma.webResourceViewState.findMany({
    where: {
      userId,
      installId,
      webResourceId,
    },
    orderBy: { updatedAt: "desc" },
  });

  return states.map(formatViewState);
}

export async function upsertExtensionViewState(
  userId: string,
  installId: string,
  input: {
    webResourceId: string;
    contentId: string;
    state?: string;
    layoutMode?: string;
    dockSide?: string | null;
    positionX?: number | null;
    positionY?: number | null;
    width?: number | null;
    height?: number | null;
    opacity?: number | null;
    embeddedSelector?: string | null;
    embeddedPlacement?: string | null;
    metadata?: Record<string, unknown>;
    lastActiveAt?: string | null;
  }
) {
  const saved = await prisma.webResourceViewState.upsert({
    where: {
      installId_webResourceId_contentId: {
        installId,
        webResourceId: input.webResourceId,
        contentId: input.contentId,
      },
    },
    update: {
      state: input.state ?? undefined,
      layoutMode: input.layoutMode ?? undefined,
      dockSide: input.dockSide ?? undefined,
      positionX: input.positionX ?? undefined,
      positionY: input.positionY ?? undefined,
      width: input.width ?? undefined,
      height: input.height ?? undefined,
      opacity: input.opacity ?? undefined,
      embeddedSelector:
        input.embeddedSelector !== undefined ? input.embeddedSelector : undefined,
      embeddedPlacement:
        input.embeddedPlacement !== undefined ? input.embeddedPlacement : undefined,
      metadata:
        input.metadata !== undefined ? (input.metadata as Prisma.JsonObject) : undefined,
      lastActiveAt:
        input.lastActiveAt !== undefined
          ? input.lastActiveAt
            ? new Date(input.lastActiveAt)
            : null
          : undefined,
    },
    create: {
      userId,
      installId,
      webResourceId: input.webResourceId,
      contentId: input.contentId,
      state: input.state ?? "open",
      layoutMode: input.layoutMode ?? "floating",
      dockSide: input.dockSide ?? null,
      positionX: input.positionX ?? null,
      positionY: input.positionY ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      opacity: input.opacity ?? null,
      embeddedSelector: input.embeddedSelector ?? null,
      embeddedPlacement: input.embeddedPlacement ?? null,
      metadata: (input.metadata ?? {}) as Prisma.JsonObject,
      lastActiveAt: input.lastActiveAt ? new Date(input.lastActiveAt) : null,
    },
  });

  return formatViewState(saved);
}
