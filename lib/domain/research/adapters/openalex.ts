/**
 * OpenAlex adapter — the discovery backbone (RESEARCH-READER-PLAN.md §5.1).
 *
 * API: https://docs.openalex.org. Works endpoint with `search`, `filter`,
 * cursor paging and `select` to keep payloads small. The key (`api_key`) is
 * the app's unless the user connected their own (§9.5); `mailto` is the
 * project contact address.
 */

import {
  copyVersion,
  EMPTY_PAGE,
  isStorableLicense,
  normalizeLicense,
  plainText,
  query,
  type AdapterContext,
  type ResearchAdapter,
} from "../adapter";
import { addIdentifier, normalizeOpenAlex } from "../identifiers";
import { researchSource } from "../sources";
import type { CandidatePage, ResearchQuery, Work, WorkCandidate, WorkCopy, WorkType } from "../types";

const BASE = "https://api.openalex.org";

const SELECT = [
  "id",
  "doi",
  "ids",
  "display_name",
  "publication_year",
  "publication_date",
  "type",
  "primary_location",
  "locations",
  "authorships",
  "cited_by_count",
  "referenced_works_count",
  "abstract_inverted_index",
  "is_retracted",
  "biblio",
  "primary_topic",
].join(",");

interface OpenAlexSource {
  display_name?: string | null;
  issn?: string[] | null;
  host_organization_name?: string | null;
  type?: string | null;
}

interface OpenAlexLocation {
  is_oa?: boolean;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  license?: string | null;
  version?: string | null;
  source?: OpenAlexSource | null;
}

export interface OpenAlexWork {
  id: string;
  doi?: string | null;
  ids?: Record<string, string | null | undefined>;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  type?: string | null;
  primary_location?: OpenAlexLocation | null;
  locations?: OpenAlexLocation[] | null;
  authorships?: Array<{ author?: { display_name?: string | null; orcid?: string | null } | null }> | null;
  cited_by_count?: number | null;
  referenced_works_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  is_retracted?: boolean | null;
  biblio?: { volume?: string | null; issue?: string | null; first_page?: string | null; last_page?: string | null } | null;
  primary_topic?: { display_name?: string | null; field?: { display_name?: string | null } | null } | null;
}

interface OpenAlexList {
  meta?: { count?: number; next_cursor?: string | null };
  results?: OpenAlexWork[];
}

const TYPE_MAP: Record<string, WorkType> = {
  article: "article",
  review: "article", // a review ARTICLE; our "review" is a peer review
  letter: "article",
  editorial: "article",
  preprint: "preprint",
  "peer-review": "review",
  book: "book",
  "book-chapter": "chapter",
  dissertation: "thesis",
  report: "report",
  dataset: "dataset",
  standard: "report",
};

const TYPE_FILTER: Partial<Record<WorkType, string[]>> = {
  article: ["article", "review", "letter"],
  preprint: ["preprint"],
  review: ["peer-review"],
  book: ["book"],
  chapter: ["book-chapter"],
  thesis: ["dissertation"],
  report: ["report"],
  dataset: ["dataset"],
};

/** OpenAlex stores abstracts as word → positions; rebuild the text. */
export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  const text = words.filter(Boolean).join(" ").trim();
  return text || null;
}

export function candidateFromOpenAlex(work: OpenAlexWork, rank?: number): WorkCandidate {
  const identifiers = {};
  addIdentifier(identifiers, "openalex", work.id);
  addIdentifier(identifiers, "doi", work.doi ?? work.ids?.doi);
  addIdentifier(identifiers, "pmid", work.ids?.pmid?.replace(/^.*\//, ""));
  addIdentifier(identifiers, "pmcid", work.ids?.pmcid?.match(/PMC\d+/i)?.[0] ?? work.ids?.pmcid?.replace(/^.*\//, ""));

  const type = TYPE_MAP[work.type ?? ""] ?? "other";
  const primary = work.primary_location ?? null;
  const copies: WorkCopy[] = [];
  for (const location of work.locations ?? []) {
    if (!location.is_oa || !location.pdf_url) continue;
    const license = normalizeLicense(location.license);
    copies.push({
      url: location.pdf_url,
      format: "pdf",
      version: copyVersion(location.version),
      license,
      host: location.source?.display_name ?? location.source?.host_organization_name ?? "Open access",
      source: "openalex",
      storable: isStorableLicense(license),
    });
  }

  const biblio = work.biblio ?? {};
  const pages = biblio.first_page
    ? biblio.last_page && biblio.last_page !== biblio.first_page
      ? `${biblio.first_page}–${biblio.last_page}`
      : biblio.first_page
    : undefined;

  return {
    source: "openalex",
    rank,
    identifiers,
    type,
    title: plainText(work.display_name) ?? undefined,
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author)
      .filter((author): author is { display_name: string; orcid?: string | null } => Boolean(author?.display_name))
      .map((author) => ({
        name: author.display_name,
        ...(author.orcid ? { orcid: author.orcid.replace(/^https?:\/\/orcid\.org\//, "") } : {}),
      })),
    year: work.publication_year ?? null,
    venue: primary?.source?.display_name ?? null,
    abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
    copies,
    license: normalizeLicense(primary?.license),
    citedByCount: work.cited_by_count ?? null,
    referenceCount: work.referenced_works_count ?? null,
    retraction: work.is_retracted ? { status: "retracted" } : null,
    landingUrl: primary?.landing_page_url ?? null,
    face: {
      volume: biblio.volume,
      issue: biblio.issue,
      pages,
      publisher: primary?.source?.host_organization_name,
      issn: primary?.source?.issn ?? undefined,
      published: work.publication_date,
      fields: [work.primary_topic?.field?.display_name, work.primary_topic?.display_name].filter(Boolean),
      genre: work.type,
      ...(type === "preprint" ? { server: primary?.source?.display_name } : {}),
    },
  };
}

function credentials(ctx: AdapterContext): Record<string, string | null> {
  return {
    api_key: ctx.credential("openalex"),
    mailto: ctx.credential("contact-email"),
  };
}

export function openAlexFilter(input: ResearchQuery): string | null {
  const parts: string[] = [];
  if (input.yearFrom || input.yearTo) {
    parts.push(`publication_year:${input.yearFrom ?? ""}-${input.yearTo ?? ""}`);
  }
  if (input.openAccess) parts.push("is_oa:true");
  const types = (input.types ?? []).flatMap((type) => TYPE_FILTER[type] ?? []);
  if (types.length) parts.push(`type:${[...new Set(types)].join("|")}`);
  // Domains: 1 Life Sciences, 4 Health Sciences. Field 17: Computer Science.
  if (input.field === "biomedicine") parts.push("primary_topic.domain.id:1|4");
  if (input.field === "computer-science") parts.push("primary_topic.field.id:17");
  if (input.author) parts.push(`raw_author_name.search:${input.author.replace(/[,|]/g, " ")}`);
  return parts.length ? parts.join(",") : null;
}

const SORT: Record<string, string | null> = {
  relevance: null,
  recent: "publication_date:desc",
  cited: "cited_by_count:desc",
};

async function list(ctx: AdapterContext, params: Record<string, string | number | null | undefined>, cursor?: string | null): Promise<CandidatePage> {
  const perPage = 25;
  const result = await ctx.fetchJson<OpenAlexList>(
    `${BASE}/works${query({ ...params, select: SELECT, "per-page": perPage, cursor: cursor ?? "*", ...credentials(ctx) })}`
  );
  return {
    candidates: (result.results ?? []).map((work, index) => candidateFromOpenAlex(work, index)),
    total: result.meta?.count ?? null,
    next: result.meta?.next_cursor ?? null,
  };
}

function openAlexId(work: Work): string | null {
  return work.identifiers.openalex?.[0] ?? null;
}

export const openAlexAdapter: ResearchAdapter = {
  info: researchSource("openalex")!,

  search(input, ctx, cursor) {
    return list(
      ctx,
      {
        search: input.text,
        filter: openAlexFilter(input),
        sort: SORT[input.sort ?? "relevance"],
      },
      cursor
    );
  },

  async resolve(identifier, ctx) {
    let path: string | null = null;
    if (identifier.scheme === "openalex") path = normalizeOpenAlex(identifier.value);
    else if (identifier.scheme === "doi") path = `doi:${identifier.value}`;
    else if (identifier.scheme === "pmid") path = `pmid:${identifier.value}`;
    else if (identifier.scheme === "pmcid") path = `pmcid:${identifier.value}`;
    if (!path) return null;
    const work = await ctx.fetchJson<OpenAlexWork | null>(
      // DOIs keep their "/" (OpenAlex wants the raw DOI); everything else is escaped.
      `${BASE}/works/${path.split("/").map(encodeURIComponent).join("/").replace(/%3A/g, ":")}${query({ select: SELECT, ...credentials(ctx) })}`
    );
    return work?.id ? candidateFromOpenAlex(work) : null;
  },

  async references(work, ctx, cursor) {
    const id = openAlexId(work);
    return id ? list(ctx, { filter: `cited_by:${id}` }, cursor) : EMPTY_PAGE;
  },

  async citedBy(work, ctx, cursor) {
    const id = openAlexId(work);
    return id ? list(ctx, { filter: `cites:${id}`, sort: "cited_by_count:desc" }, cursor) : EMPTY_PAGE;
  },

  async related(work, ctx) {
    const id = openAlexId(work);
    return id ? list(ctx, { filter: `related_to:${id}` }) : EMPTY_PAGE;
  },
};
