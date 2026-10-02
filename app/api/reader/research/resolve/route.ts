/**
 * GET /api/reader/research/resolve?q=<identifier text>[&fresh=1]
 *
 * The identifier jump (RESEARCH-READER-PLAN.md §2.2.3): a DOI, arXiv id,
 * PMID/PMCID, NCT number, case citation, CFR/USC section, patent number or
 * URL resolves to one Work through the shared cache, then the sources.
 * Legal citations are a V1.0 stub — they come back as `link` (no remote
 * resolver yet) so the client can save them as link nodes.
 */

import { z } from "zod";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { parseIdentifierQuery } from "@/lib/domain/research/identifiers";
import { isLegalScheme, legalLink } from "@/lib/domain/research/legal";
import { ResearchError, resolveIdentifiers } from "@/lib/domain/research/server/service";

const params = z.object({
  q: z.string().trim().min(1).max(2000),
  fresh: z.enum(["0", "1"]).optional(),
});

export const GET = readerRoute("/api/reader/research/resolve", async ({ ownerId, request }) => {
  const input = params.parse(Object.fromEntries(request.nextUrl.searchParams));
  const identifiers = parseIdentifierQuery(input.q);
  if (!identifiers) throw new ResearchError("That isn't an identifier this search recognizes");

  const legal = identifiers.find((identifier) => isLegalScheme(identifier.scheme));
  if (legal) {
    return { kind: "link" as const, identifier: legal, link: legalLink(legal.scheme, legal.value), work: null, reports: [] };
  }

  const result = await resolveIdentifiers(ownerId, identifiers, { fresh: input.fresh === "1" });
  return { kind: result.work ? ("work" as const) : ("none" as const), identifier: identifiers[0], ...result };
});
