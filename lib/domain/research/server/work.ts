/**
 * A saved Work as the reader opens it: the WorkMeta row rebuilt into a `Work`
 * (so the Find tab's sidebar view and the node's viewer share one shape) plus
 * what the node is — a stored PDF, an open copy read on demand, or a link.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { ResearchError } from "./service";
import type { ResearchWorkNodeDto, Work, WorkCopyPolicy, WorkIdentifiers, WorkRetraction } from "../types";

export async function getResearchWorkNode(ownerId: string, contentId: string): Promise<ResearchWorkNodeDto> {
  const meta = await prisma.workMeta.findFirst({
    where: { contentId, ownerId, content: { deletedAt: null } },
    include: { content: { select: { externalPayload: { select: { url: true } } } } },
  });
  if (!meta) throw new ResearchError("This item isn't a saved research work", 404);

  const copyPolicy = meta.copyPolicy as WorkCopyPolicy;
  const work: Work = {
    key: meta.workKey,
    type: meta.type,
    title: meta.title,
    authors: meta.authors.map((name) => ({ name })),
    year: meta.year,
    venue: meta.venue,
    abstract: meta.abstract,
    tldr: null,
    identifiers: (meta.identifiers ?? {}) as WorkIdentifiers,
    copies:
      meta.copyUrl && copyPolicy !== "link"
        ? [
            {
              url: meta.copyUrl,
              format: "pdf",
              license: meta.license,
              host: hostOf(meta.copyUrl),
              source: meta.provenance[0] ?? "saved",
              storable: copyPolicy === "stored",
            },
          ]
        : [],
    license: meta.license,
    citedByCount: null,
    referenceCount: null,
    retraction: (meta.retraction as unknown as WorkRetraction | null) ?? null,
    face: (meta.face ?? {}) as Record<string, unknown>,
    provenance: meta.provenance,
    landingUrl: meta.content.externalPayload?.url ?? null,
  };
  return {
    contentId,
    work,
    copyPolicy,
    copyUrl: meta.copyUrl,
    url: meta.content.externalPayload?.url ?? null,
    readingStatus: meta.readingStatus,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
