/**
 * Semantic Scholar adapter — search, TLDRs, references / citations and
 * recommendations (RESEARCH-READER-PLAN.md §5.1, §5.4).
 *
 * API: https://api.semanticscholar.org/api-docs. Graph API for papers, the
 * Recommendations API for "related". The key goes in `x-api-key`; without
 * one the API still answers at a shared, lower limit.
 */

import {
  EMPTY_PAGE,
  isStorableLicense,
  normalizeLicense,
  plainText,
  query,
  type AdapterContext,
  type ResearchAdapter,
} from "../adapter";
import { addIdentifier } from "../identifiers";
import { researchSource } from "../sources";
import type { CandidatePage, ResearchQuery, Work, WorkCandidate, WorkIdentifier, WorkType } from "../types";

const GRAPH = "https://api.semanticscholar.org/graph/v1";
const RECOMMEND = "https://api.semanticscholar.org/recommendations/v1";

const FIELDS = [
  "paperId",
  "externalIds",
  "url",
  "title",
  "abstract",
  "venue",
  "year",
  "publicationDate",
  "publicationTypes",
  "journal",
  "authors",
  "citationCount",
  "referenceCount",
  "openAccessPdf",
  "tldr",
  "fieldsOfStudy",
].join(",");

/** Nested papers (references, citations) can't request `tldr`. */
const NESTED_FIELDS = FIELDS.replace(",tldr", "");

export interface S2Paper {
  paperId?: string | null;
  externalIds?: Record<string, string | number | null | undefined> | null;
  url?: string | null;
  title?: string | null;
  abstract?: string | null;
  venue?: string | null;
  year?: number | null;
  publicationDate?: string | null;
  publicationTypes?: string[] | null;
  journal?: { name?: string | null; volume?: string | null; pages?: string | null } | null;
  authors?: Array<{ name?: string | null }> | null;
  citationCount?: number | null;
  referenceCount?: number | null;
  openAccessPdf?: { url?: string | null; status?: string | null; license?: string | null } | null;
  tldr?: { text?: string | null } | null;
  fieldsOfStudy?: string[] | null;
}

function typeOf(paper: S2Paper): WorkType {
  const types = (paper.publicationTypes ?? []).map((type) => type.toLowerCase());
  if (types.includes("book")) return "book";
  if (types.includes("booksection")) return "chapter";
  if (types.includes("dataset")) return "dataset";
  const ids = paper.externalIds ?? {};
  // An arXiv paper with no journal and no publisher DOI is still a preprint.
  if (ids.ArXiv && !paper.journal?.name && !ids.DOI) return "preprint";
  return types.length ? "article" : "other";
}

export function candidateFromS2(paper: S2Paper, rank?: number): WorkCandidate {
  const ids = paper.externalIds ?? {};
  const identifiers = {};
  addIdentifier(identifiers, "s2", paper.paperId);
  addIdentifier(identifiers, "doi", ids.DOI as string | undefined);
  addIdentifier(identifiers, "arxiv", ids.ArXiv as string | undefined);
  addIdentifier(identifiers, "pmid", ids.PubMed);
  const pmc = ids.PubMedCentral;
  addIdentifier(identifiers, "pmcid", pmc ? (/^pmc/i.test(String(pmc)) ? String(pmc) : `PMC${pmc}`) : null);

  const type = typeOf(paper);
  const pdf = paper.openAccessPdf?.url ?? null;
  const license = normalizeLicense(paper.openAccessPdf?.license);

  return {
    source: "semantic-scholar",
    rank,
    identifiers,
    type,
    title: plainText(paper.title) ?? undefined,
    authors: (paper.authors ?? [])
      .map((author) => author.name?.trim())
      .filter((name): name is string => Boolean(name))
      .map((name) => ({ name })),
    year: paper.year ?? null,
    venue: paper.journal?.name || paper.venue || null,
    abstract: plainText(paper.abstract),
    tldr: plainText(paper.tldr?.text),
    copies: pdf
      ? [
          {
            url: pdf,
            format: "pdf",
            license,
            host: ids.ArXiv && /arxiv\.org/i.test(pdf) ? "arXiv" : "Open access",
            source: "semantic-scholar",
            storable: isStorableLicense(license),
          },
        ]
      : [],
    citedByCount: paper.citationCount ?? null,
    referenceCount: paper.referenceCount ?? null,
    landingUrl: paper.url ?? null,
    face: {
      volume: paper.journal?.volume,
      pages: paper.journal?.pages,
      published: paper.publicationDate,
      fields: paper.fieldsOfStudy ?? undefined,
      genre: paper.publicationTypes?.[0],
      ...(type === "preprint" ? { server: "arXiv" } : {}),
    },
  };
}

function headers(ctx: AdapterContext): Record<string, string> {
  const key = ctx.credential("semantic-scholar");
  return key ? { "x-api-key": key } : {};
}

/** S2's paper-id prefixes for external identifiers. */
function s2PaperId(identifier: WorkIdentifier): string | null {
  switch (identifier.scheme) {
    case "s2":
      return identifier.value;
    case "doi":
      return `DOI:${identifier.value}`;
    case "arxiv":
      return `ARXIV:${identifier.value}`;
    case "pmid":
      return `PMID:${identifier.value}`;
    case "pmcid":
      return `PMCID:${identifier.value.replace(/^PMC/i, "")}`;
    default:
      return null;
  }
}

/** The best S2 handle for a merged Work. */
function paperIdOf(work: Work): string | null {
  for (const scheme of ["s2", "doi", "arxiv", "pmid", "pmcid"] as const) {
    const value = work.identifiers[scheme]?.[0];
    if (value) return s2PaperId({ scheme, value });
  }
  return null;
}

const FIELD_OF_STUDY: Record<string, string> = {
  biomedicine: "Medicine,Biology",
  "computer-science": "Computer Science",
};

export function s2SearchParams(input: ResearchQuery): Record<string, string | null> {
  const year =
    input.yearFrom || input.yearTo ? `${input.yearFrom ?? ""}-${input.yearTo ?? ""}` : null;
  return {
    query: input.text,
    year,
    openAccessPdf: input.openAccess ? "" : null,
    fieldsOfStudy: input.field ? FIELD_OF_STUDY[input.field] ?? null : null,
    venue: input.venue ?? null,
  };
}

const PAGE_SIZE = 25;

interface S2SearchResult {
  total?: number;
  offset?: number;
  next?: number;
  data?: S2Paper[];
}

interface S2EdgeResult {
  offset?: number;
  next?: number;
  data?: Array<{ citedPaper?: S2Paper; citingPaper?: S2Paper }>;
}

async function edges(
  ctx: AdapterContext,
  work: Work,
  kind: "references" | "citations",
  cursor?: string | null
): Promise<CandidatePage> {
  const id = paperIdOf(work);
  if (!id) return EMPTY_PAGE;
  const offset = Number(cursor ?? 0) || 0;
  const result = await ctx.fetchJson<S2EdgeResult>(
    `${GRAPH}/paper/${encodeURIComponent(id)}/${kind}${query({ fields: NESTED_FIELDS, offset, limit: PAGE_SIZE })}`,
    { headers: headers(ctx) }
  );
  const papers = (result.data ?? [])
    .map((edge) => (kind === "references" ? edge.citedPaper : edge.citingPaper))
    .filter((paper): paper is S2Paper => Boolean(paper?.paperId && paper.title));
  return {
    candidates: papers.map((paper, index) => candidateFromS2(paper, index)),
    total: null,
    next: result.next !== undefined && result.next !== null ? String(result.next) : null,
  };
}

export const semanticScholarAdapter: ResearchAdapter = {
  info: researchSource("semantic-scholar")!,

  async search(input, ctx, cursor) {
    const offset = Number(cursor ?? 0) || 0;
    // `openAccessPdf` is a presence flag: send it with an empty value.
    const params = s2SearchParams(input);
    const url = `${GRAPH}/paper/search${query({ ...params, fields: FIELDS, offset, limit: PAGE_SIZE })}${
      params.openAccessPdf === "" ? "&openAccessPdf" : ""
    }`;
    const result = await ctx.fetchJson<S2SearchResult>(url, { headers: headers(ctx) });
    return {
      candidates: (result.data ?? []).map((paper, index) => candidateFromS2(paper, index)),
      total: result.total ?? null,
      next: result.next !== undefined && result.next !== null ? String(result.next) : null,
    };
  },

  async resolve(identifier, ctx) {
    const id = s2PaperId(identifier);
    if (!id) return null;
    const paper = await ctx.fetchJson<S2Paper | null>(
      `${GRAPH}/paper/${encodeURIComponent(id)}${query({ fields: FIELDS })}`,
      { headers: headers(ctx) }
    );
    return paper?.paperId ? candidateFromS2(paper) : null;
  },

  references(work, ctx, cursor) {
    return edges(ctx, work, "references", cursor);
  },

  citedBy(work, ctx, cursor) {
    return edges(ctx, work, "citations", cursor);
  },

  async related(work, ctx) {
    const id = work.identifiers.s2?.[0];
    if (!id) return EMPTY_PAGE;
    const result = await ctx.fetchJson<{ recommendedPapers?: S2Paper[] }>(
      `${RECOMMEND}/papers/forpaper/${id}${query({ fields: NESTED_FIELDS, limit: PAGE_SIZE })}`,
      { headers: headers(ctx) }
    );
    return {
      candidates: (result.recommendedPapers ?? []).map((paper, index) => candidateFromS2(paper, index)),
      total: null,
      next: null,
    };
  },
};
