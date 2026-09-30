/**
 * Scripture sessions (server-only): a collection placed in the file tree.
 *
 * Follows the link-book convention (lib/domain/reader/server/library.ts
 * addLinkBook): an `external` content node — so rename, move, icon, delete,
 * search and trash all work like any other item — whose payload says
 * `resourceType: "scripture"` and names the collection in `captureMetadata`.
 * The URL is the collection's public home page, so the node still means
 * something outside the reader.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { normalizeUrl } from "@/lib/domain/content/external-validation";
import { resolveFolderTarget } from "@/lib/domain/reader/server/library";
import { catalogEntry } from "../catalog";
import {
  SCRIPTURE_RESOURCE_TYPE,
  SCRIPTURE_SESSION_ICON,
  SCRIPTURE_SESSION_ICON_COLOR,
  type ScriptureSessionDto,
} from "../types";
import { installCorpus, ScriptureError, setCorpusEnabled } from "./corpus";

interface SessionMetadata {
  scriptureCorpusId?: unknown;
}

export async function createScriptureSession(input: {
  ownerId: string;
  corpusId: string;
  parentId?: string | null;
  title?: string | null;
}): Promise<ScriptureSessionDto & { parentId: string | null }> {
  const entry = catalogEntry(input.corpusId);
  if (!entry || entry.status !== "available") throw new ScriptureError("That collection can't be opened here yet.", 409);
  // Adding a session adds the collection (loads it the first time, anyone).
  await installCorpus(entry.id);
  await setCorpusEnabled(input.ownerId, entry.id, true);

  const parentId = await resolveFolderTarget(input.ownerId, input.parentId);
  const title = (input.title?.trim() || entry.title).slice(0, 255);
  const url = entry.homepage ?? entry.sourceUrl;
  const parsed = new URL(url);
  const created = await prisma.contentNode.create({
    data: {
      ownerId: input.ownerId,
      title,
      slug: await generateUniqueSlug(title, input.ownerId),
      contentType: "external",
      parentId,
      displayOrder: 0,
      customIcon: SCRIPTURE_SESSION_ICON,
      iconColor: SCRIPTURE_SESSION_ICON_COLOR,
      externalPayload: {
        create: {
          url,
          normalizedUrl: normalizeUrl(url),
          canonicalUrl: normalizeUrl(url),
          subtype: "website",
          description: entry.description,
          resourceType: SCRIPTURE_RESOURCE_TYPE,
          sourceDomain: parsed.hostname.replace(/^www\./, ""),
          sourceHostname: parsed.hostname,
          preview: {},
          captureMetadata: { scriptureCorpusId: entry.id } as unknown as Prisma.InputJsonValue,
        },
      },
    },
    select: { id: true },
  });
  return { contentId: created.id, corpusId: entry.id, title, parentId };
}

export async function getScriptureSession(ownerId: string, contentId: string): Promise<ScriptureSessionDto> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, deletedAt: null, contentType: "external" },
    select: { id: true, title: true, externalPayload: { select: { resourceType: true, captureMetadata: true } } },
  });
  const corpusId = (node?.externalPayload?.captureMetadata as SessionMetadata | null)?.scriptureCorpusId;
  if (!node || node.externalPayload?.resourceType !== SCRIPTURE_RESOURCE_TYPE || typeof corpusId !== "string") {
    throw new ScriptureError("That isn't a scripture session.", 404);
  }
  return { contentId: node.id, corpusId, title: node.title };
}
