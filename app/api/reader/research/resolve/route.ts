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
import { formatCaseCitation, parseIdentifierQuery } from "@/lib/domain/research/identifiers";
import { ResearchError, resolveIdentifiers } from "@/lib/domain/research/server/service";

const params = z.object({
  q: z.string().trim().min(1).max(2000),
  fresh: z.enum(["0", "1"]).optional(),
});

/** Where a legal citation can be read until the Law pack resolves it (V1.1). */
function legalLink(scheme: string, value: string): { title: string; url: string } | null {
  if (scheme === "case") {
    const display = formatCaseCitation(value);
    return { title: display, url: `https://www.courtlistener.com/?q=${encodeURIComponent(`"${display}"`)}` };
  }
  if (scheme === "cfr") {
    const [title, , section] = value.split(" ");
    return { title: `${title} C.F.R. § ${section}`, url: `https://www.ecfr.gov/current/title-${title}/section-${section}` };
  }
  if (scheme === "usc") {
    const [title, , section] = value.split(" ");
    const base = section.replace(/\(.*$/, "");
    return {
      title: `${title} U.S.C. § ${section}`,
      url: `https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title${title}-section${base}&num=0&edition=prelim`,
    };
  }
  return null;
}

export const GET = readerRoute("/api/reader/research/resolve", async ({ ownerId, request }) => {
  const input = params.parse(Object.fromEntries(request.nextUrl.searchParams));
  const identifiers = parseIdentifierQuery(input.q);
  if (!identifiers) throw new ResearchError("That isn't an identifier this search recognizes");

  const legal = identifiers.find((identifier) => ["case", "cfr", "usc"].includes(identifier.scheme));
  if (legal) {
    return { kind: "link" as const, identifier: legal, link: legalLink(legal.scheme, legal.value), work: null, reports: [] };
  }

  const result = await resolveIdentifiers(ownerId, identifiers, { fresh: input.fresh === "1" });
  return { kind: result.work ? ("work" as const) : ("none" as const), identifier: identifiers[0], ...result };
});
