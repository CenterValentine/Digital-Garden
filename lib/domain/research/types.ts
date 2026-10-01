/**
 * Research domain — the Work model (client-safe).
 *
 * RESEARCH-READER-PLAN.md §2.2: every source maps its results into one `Work`,
 * keyed by normalized identifiers, so the same paper from OpenAlex, Semantic
 * Scholar and Crossref is one card with three provenance entries. A Work has a
 * TYPE, and each type has a FACE — the type-specific fields its card, details
 * and reader show (`faces.ts`). Domain packs add types and faces, never screens.
 *
 * Nothing here assumes a paper: identifiers are multi-valued per scheme, the
 * type list is open, and type-specific data lives in `face`, validated per type.
 */

// ── Identifiers ──────────────────────────────────────────────────────────

/**
 * Identifier schemes, in precedence order for choosing a Work's key
 * (`workKeyOf`). Open-ended: a pack may add schemes without touching this list
 * — unknown schemes sort last.
 */
export const IDENTIFIER_SCHEMES = [
  "doi",
  "arxiv",
  "pmid",
  "pmcid",
  "nct",
  "isbn",
  "case", // a legal reporter citation, normalized ("410 us 113")
  "cfr", // "12 cfr 1026.19"
  "usc", // "26 usc 501(c)(3)"
  "patent",
  "openalex",
  "s2",
  "courtlistener",
  "zotero",
  "url",
] as const;

export type KnownIdentifierScheme = (typeof IDENTIFIER_SCHEMES)[number];
// `string & {}` keeps autocomplete for known schemes while staying open.
export type IdentifierScheme = KnownIdentifierScheme | (string & {});

/** One identifier, already normalized (see `identifiers.ts`). */
export interface WorkIdentifier {
  scheme: IdentifierScheme;
  value: string;
}

/** Every identifier a Work is known by, per scheme (a Work can have several URLs). */
export type WorkIdentifiers = Partial<Record<IdentifierScheme, string[]>>;

// ── Types and access ─────────────────────────────────────────────────────

export const KNOWN_WORK_TYPES = [
  "article",
  "preprint",
  "review", // a peer review (OpenReview), not a review article
  "book",
  "chapter",
  "thesis",
  "report",
  "dataset",
  "trial",
  "case",
  "statute",
  "regulation",
  "patent",
  "archival",
  "webpage",
  "other",
] as const;

export type KnownWorkType = (typeof KNOWN_WORK_TYPES)[number];
export type WorkType = KnownWorkType | (string & {});

/**
 * The access ladder (§2.2.4), best first. A Work shows the best rung it has;
 * the badge on a card is that rung.
 */
export const ACCESS_RUNGS = ["here", "preprint", "library", "request", "abstract", "link"] as const;
export type AccessRung = (typeof ACCESS_RUNGS)[number];

export type CopyFormat = "jats" | "html" | "pdf" | "epub" | "text";
export type CopyVersion = "published" | "accepted" | "submitted";

/**
 * Where a readable copy lives. `storable` says whether the licence lets us
 * keep a copy in the user's storage (§7.2); otherwise it's fetched on demand.
 */
export interface WorkCopy {
  url: string;
  format: CopyFormat;
  version?: CopyVersion;
  /** SPDX-ish licence id as the source reports it ("cc-by", "public-domain", …). */
  license?: string | null;
  /** Host or repository name for display ("arXiv", "Europe PMC"). */
  host: string;
  /** Adapter id that reported this copy. */
  source: string;
  storable: boolean;
}

export interface WorkAuthor {
  name: string;
  orcid?: string;
}

export interface WorkRetraction {
  status: "retracted" | "corrected" | "concern" | "withdrawn";
  /** DOI or URL of the notice. */
  notice?: string;
  date?: string;
}

/**
 * A resolved Work. `face` holds the type-specific fields (validated by
 * `faces.ts`); everything above it is common to every type.
 */
export interface Work {
  /** Canonical key — `<scheme>:<value>` of the highest-precedence identifier. */
  key: string;
  type: WorkType;
  title: string;
  authors: WorkAuthor[];
  year: number | null;
  /** Journal, conference, court, repository — whatever "where" means for the type. */
  venue: string | null;
  abstract: string | null;
  /** One-sentence summary from the source (Semantic Scholar), never AI-made here. */
  tldr: string | null;
  identifiers: WorkIdentifiers;
  copies: WorkCopy[];
  /** Best licence known for the published version. */
  license: string | null;
  citedByCount: number | null;
  referenceCount: number | null;
  retraction: WorkRetraction | null;
  face: Record<string, unknown>;
  /** Adapter ids that contributed — shown as provenance chips. */
  provenance: string[];
  /** Landing page to send the user to when nothing is readable here. */
  landingUrl: string | null;
}

/** What one adapter knows about a Work before merging. Same shape, partial. */
export type WorkCandidate = Partial<Omit<Work, "key" | "provenance">> & {
  identifiers: WorkIdentifiers;
  /** The adapter that produced this candidate. */
  source: string;
  /** 0-based position in that source's results — used for rank fusion. */
  rank?: number;
};

// ── Queries ──────────────────────────────────────────────────────────────

/**
 * Normalized facets. An adapter declares which it honours (`sources.ts`); the
 * UI greys a facet per source that ignores it rather than silently dropping it.
 */
export const RESEARCH_FACETS = [
  "yearFrom",
  "yearTo",
  "openAccess",
  "type",
  "field",
  "venue",
  "author",
] as const;
export type ResearchFacet = (typeof RESEARCH_FACETS)[number];

export interface ResearchQuery {
  text: string;
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
  types?: WorkType[];
  field?: string;
  venue?: string;
  author?: string;
  sort?: "relevance" | "recent" | "cited";
}

export interface CandidatePage {
  candidates: WorkCandidate[];
  /** Total the source reports, when it does. */
  total: number | null;
  /** Opaque cursor for the next page, adapter-specific. */
  next: string | null;
}
