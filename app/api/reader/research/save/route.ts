/**
 * POST /api/reader/research/save — add a Work to the user's tree
 * (RESEARCH-READER-PLAN.md §7.2): a stored PDF when its licence allows,
 * otherwise a link node read on demand or linked out. Legal citations
 * (the V1.0 Law stub) save as typed link nodes.
 *
 * The client sends identifiers, not a trusted Work: the server re-resolves
 * them (shared cache first) so copy URLs and licences are the sources' own.
 */

import { z } from "zod";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { isLegalScheme } from "@/lib/domain/research/legal";
import { saveLegalLink, saveWork } from "@/lib/domain/research/server/save";
import type { Work } from "@/lib/domain/research/types";

const identifier = z.object({ scheme: z.string().min(1).max(40), value: z.string().min(1).max(500) });

const body = z.object({
  key: z.string().min(3).max(600),
  identifiers: z.array(identifier).max(40).optional(),
  parentId: z.string().uuid().nullable().optional(),
  /** The client's view of the Work — used only as a link when no source answers. */
  fallback: z
    .object({
      key: z.string().max(600),
      type: z.string().max(40),
      title: z.string().min(1).max(1000),
      authors: z.array(z.object({ name: z.string().max(300), orcid: z.string().max(40).optional() })).max(200),
      year: z.number().int().nullable(),
      venue: z.string().max(500).nullable(),
      abstract: z.string().max(20_000).nullable(),
      identifiers: z.record(z.string(), z.array(z.string().max(600)).max(20)),
      landingUrl: z.string().url().max(2000).nullable(),
    })
    .optional(),
  sourceAdapter: z.string().max(80).optional(),
});

export const POST = readerRoute("/api/reader/research/save", async ({ ownerId, request }) => {
  const input = body.parse(await request.json());
  const index = input.key.indexOf(":");
  const scheme = input.key.slice(0, index);
  if (isLegalScheme(scheme)) {
    return saveLegalLink({ ownerId, identifier: { scheme, value: input.key.slice(index + 1) }, parentId: input.parentId });
  }
  const given = input.fallback;
  const fallback: Work | undefined = given
    ? {
        key: given.key,
        type: given.type,
        title: given.title,
        authors: given.authors,
        year: given.year ?? null,
        venue: given.venue ?? null,
        abstract: given.abstract ?? null,
        identifiers: given.identifiers,
        landingUrl: given.landingUrl ?? null,
        tldr: null,
        copies: [],
        license: null,
        citedByCount: null,
        referenceCount: null,
        retraction: null,
        face: {},
        provenance: [],
      }
    : undefined;
  return saveWork({
    ownerId,
    key: input.key,
    identifiers: input.identifiers,
    parentId: input.parentId,
    fallback,
    sourceAdapter: input.sourceAdapter,
  });
});
