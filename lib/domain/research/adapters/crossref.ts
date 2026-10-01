/**
 * Crossref adapter — authoritative DOI metadata, licences and update notices
 * (retractions, corrections; Retraction Watch data is open via Crossref since
 * 2023) (RESEARCH-READER-PLAN.md §5.1, §5.4).
 *
 * API: https://api.crossref.org/swagger-ui. `mailto` joins the polite pool;
 * it is the project's contact address, never the user's (plan §7.5).
 */

import {
  copyVersion,
  isStorableLicense,
  licenseFromUrl,
  plainText,
  query,
  yearOf,
  type AdapterContext,
  type ResearchAdapter,
} from "../adapter";
import { addIdentifier } from "../identifiers";
import { researchSource } from "../sources";
import type { ResearchQuery, WorkCandidate, WorkCopy, WorkRetraction, WorkType } from "../types";

const BASE = "https://api.crossref.org";

type DateParts = { "date-parts"?: Array<Array<number | null>> | null } | null | undefined;

interface CrossrefUpdate {
  type?: string | null;
  DOI?: string | null;
  updated?: DateParts;
  label?: string | null;
}

export interface CrossrefWork {
  DOI: string;
  title?: string[] | null;
  subtitle?: string[] | null;
  author?: Array<{ given?: string | null; family?: string | null; name?: string | null; ORCID?: string | null }> | null;
  issued?: DateParts;
  published?: DateParts;
  "container-title"?: string[] | null;
  publisher?: string | null;
  type?: string | null;
  subtype?: string | null;
  volume?: string | null;
  issue?: string | null;
  page?: string | null;
  ISSN?: string[] | null;
  ISBN?: string[] | null;
  license?: Array<{ URL?: string | null; "content-version"?: string | null }> | null;
  link?: Array<{ URL?: string | null; "content-type"?: string | null; "content-version"?: string | null }> | null;
  abstract?: string | null;
  "is-referenced-by-count"?: number | null;
  "references-count"?: number | null;
  URL?: string | null;
  subject?: string[] | null;
  /** Notices that update THIS work (retraction, correction…). */
  "updated-by"?: CrossrefUpdate[] | null;
  /** On a notice: the work(s) it updates. */
  "update-to"?: CrossrefUpdate[] | null;
  relation?: Record<string, Array<{ "id-type"?: string; id?: string }>> | null;
}

const TYPE_MAP: Record<string, WorkType> = {
  "journal-article": "article",
  "proceedings-article": "article",
  "posted-content": "preprint",
  "book-chapter": "chapter",
  "book-section": "chapter",
  "book-part": "chapter",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  dissertation: "thesis",
  report: "report",
  "report-component": "report",
  dataset: "dataset",
  component: "dataset",
  "peer-review": "review",
  standard: "report",
};

const TYPE_FILTER: Partial<Record<WorkType, string[]>> = {
  article: ["journal-article", "proceedings-article"],
  preprint: ["posted-content"],
  book: ["book", "monograph", "edited-book"],
  chapter: ["book-chapter"],
  thesis: ["dissertation"],
  report: ["report"],
  dataset: ["dataset"],
  review: ["peer-review"],
};

function dateOf(parts: DateParts): string | undefined {
  const values = parts?.["date-parts"]?.[0]?.filter((value): value is number => typeof value === "number");
  if (!values?.length) return undefined;
  return values
    .slice(0, 3)
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, "0")))
    .join("-");
}

const RETRACTION_TYPES: Record<string, WorkRetraction["status"]> = {
  retraction: "retracted",
  removal: "withdrawn",
  withdrawal: "withdrawn",
  correction: "corrected",
  erratum: "corrected",
  corrigendum: "corrected",
  "expression_of_concern": "concern",
  "expression-of-concern": "concern",
};

/** The most serious notice wins: retracted > withdrawn > concern > corrected. */
export function retractionOf(updates: CrossrefUpdate[] | null | undefined): WorkRetraction | null {
  const severity: WorkRetraction["status"][] = ["retracted", "withdrawn", "concern", "corrected"];
  let best: WorkRetraction | null = null;
  for (const update of updates ?? []) {
    const status = RETRACTION_TYPES[(update.type ?? "").toLowerCase()];
    if (!status) continue;
    if (!best || severity.indexOf(status) < severity.indexOf(best.status)) {
      best = {
        status,
        ...(update.DOI ? { notice: `https://doi.org/${update.DOI}` } : {}),
        ...(dateOf(update.updated) ? { date: dateOf(update.updated) } : {}),
      };
    }
  }
  return best;
}

export function candidateFromCrossref(work: CrossrefWork, rank?: number): WorkCandidate {
  const identifiers = {};
  addIdentifier(identifiers, "doi", work.DOI);
  for (const isbn of work.ISBN ?? []) addIdentifier(identifiers, "isbn", isbn);

  const type =
    work.type === "posted-content" && work.subtype && work.subtype !== "preprint"
      ? "other"
      : TYPE_MAP[work.type ?? ""] ?? "other";

  // The published version's licence: content-version "vor" (or unspecified).
  const vor =
    (work.license ?? []).find((entry) => entry["content-version"] === "vor") ??
    (work.license ?? []).find((entry) => !entry["content-version"] || entry["content-version"] === "unspecified");
  const license = licenseFromUrl(vor?.URL);

  const copies: WorkCopy[] = [];
  for (const link of work.link ?? []) {
    if (!link.URL || link["content-type"] !== "application/pdf") continue;
    const version = copyVersion(link["content-version"]);
    // Publisher PDF links are often paywalled; only an open licence makes one a copy.
    if (!isStorableLicense(license) || version !== "published") continue;
    copies.push({
      url: link.URL,
      format: "pdf",
      version,
      license,
      host: work.publisher ?? "Publisher",
      source: "crossref",
      storable: true,
    });
  }

  const title = [work.title?.[0], work.subtitle?.[0]].filter(Boolean).join(": ");
  const published = dateOf(work.published) ?? dateOf(work.issued);
  const preprintOf = work.relation?.["is-preprint-of"]?.find((entry) => entry["id-type"] === "doi")?.id;

  return {
    source: "crossref",
    rank,
    identifiers,
    type,
    title: plainText(title) ?? undefined,
    authors: (work.author ?? [])
      .map((author) => ({
        name: (author.name ?? [author.given, author.family].filter(Boolean).join(" ")).trim(),
        ...(author.ORCID ? { orcid: author.ORCID.replace(/^https?:\/\/orcid\.org\//, "") } : {}),
      }))
      .filter((author) => author.name),
    year: yearOf(published),
    venue: work["container-title"]?.[0] ?? null,
    abstract: plainText(work.abstract),
    copies,
    license,
    citedByCount: work["is-referenced-by-count"] ?? null,
    referenceCount: work["references-count"] ?? null,
    retraction: retractionOf(work["updated-by"]),
    landingUrl: `https://doi.org/${work.DOI}`,
    face: {
      volume: work.volume,
      issue: work.issue,
      pages: work.page,
      publisher: work.publisher,
      issn: work.ISSN ?? undefined,
      published,
      fields: work.subject ?? undefined,
      genre: work.type,
      ...(type === "preprint" ? { server: work.publisher, publishedAs: preprintOf } : {}),
    },
  };
}

function polite(ctx: AdapterContext): Record<string, string | null> {
  return { mailto: ctx.credential("contact-email") };
}

export function crossrefFilter(input: ResearchQuery): string | null {
  const parts: string[] = [];
  if (input.yearFrom) parts.push(`from-pub-date:${input.yearFrom}`);
  if (input.yearTo) parts.push(`until-pub-date:${input.yearTo}`);
  for (const type of new Set((input.types ?? []).flatMap((type) => TYPE_FILTER[type] ?? []))) {
    parts.push(`type:${type}`);
  }
  return parts.length ? parts.join(",") : null;
}

const SORT: Record<string, { sort: string; order: string } | null> = {
  relevance: null,
  recent: { sort: "published", order: "desc" },
  cited: { sort: "is-referenced-by-count", order: "desc" },
};

interface CrossrefList {
  message?: { "total-results"?: number; "next-cursor"?: string | null; items?: CrossrefWork[] };
}

export const crossrefAdapter: ResearchAdapter = {
  info: researchSource("crossref")!,

  async search(input, ctx, cursor) {
    const rows = 25;
    const result = await ctx.fetchJson<CrossrefList>(
      `${BASE}/works${query({
        "query.bibliographic": input.text,
        "query.author": input.author,
        "query.container-title": input.venue,
        filter: crossrefFilter(input),
        rows,
        cursor: cursor ?? "*",
        ...SORT[input.sort ?? "relevance"],
        ...polite(ctx),
      })}`
    );
    const message = result.message ?? {};
    const items = message.items ?? [];
    return {
      candidates: items.map((item, index) => candidateFromCrossref(item, index)),
      total: message["total-results"] ?? null,
      // Crossref repeats the cursor on the last page; stop when a page comes back short.
      next: items.length === rows ? message["next-cursor"] ?? null : null,
    };
  },

  async resolve(identifier, ctx) {
    if (identifier.scheme !== "doi") return null;
    const result = await ctx.fetchJson<{ message?: CrossrefWork } | null>(
      `${BASE}/works/${identifier.value.split("/").map(encodeURIComponent).join("/")}${query(polite(ctx))}`
    );
    return result?.message?.DOI ? candidateFromCrossref(result.message) : null;
  },
};
