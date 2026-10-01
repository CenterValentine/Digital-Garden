/**
 * Research source catalog (client-safe).
 *
 * Every adapter declares what it can do here, as data, so the UI can grey a
 * facet a source ignores, show a cost gate for paid sources, and so
 * `pnpm research:matrix` can generate RESEARCH-SOURCE-MATRIX.md from the same
 * truth (`research:matrix:check` keeps the doc and code in step — the pattern
 * of `ai:matrix`). The server registry (`server/registry.ts`) must have exactly
 * one adapter per entry; the check fails on drift either way.
 *
 * Only BUILT sources are listed. The plan's §5 registry is the roadmap.
 */

import type { IdentifierScheme, ResearchFacet, WorkType } from "./types";

/** RESEARCH-READER-PLAN.md §3 — the five adapter roles. */
export type ResearchRole = "discover" | "resolve" | "fetch" | "enrich" | "import";

export type SourceAccess = "free" | "key" | "email" | "paid";

/**
 * Whose key a call uses (§9.5). `app` — the deployment's key or contact email;
 * `app-or-user` — the app's, unless the user connected their own (which then
 * carries their own quota); `user` — only the user's (paid sources).
 */
export type KeyPolicy = "none" | "app" | "app-or-user" | "user";

export type EnrichmentKind = "references" | "citedBy" | "related" | "tldr" | "retraction" | "copies";

export interface ResearchSourceInfo {
  id: string;
  label: string;
  description: string;
  homepage: string;
  roles: ResearchRole[];
  access: SourceAccess;
  keyPolicy: KeyPolicy;
  /** Environment variable holding the app-level key or contact address, if any. */
  appKeyEnv?: string;
  /** Shown in the source strip for paid sources ("~$0.01 / search"). */
  costNote?: string;
  /** The source's own published limit, which the federation layer respects. */
  rateLimit: { requests: number; perSeconds: number };
  /** Facets honoured by `search`. */
  facets: ResearchFacet[];
  /** Identifier schemes `resolve` accepts. */
  resolves: IdentifierScheme[];
  /** Work types it returns. */
  types: WorkType[];
  enriches: EnrichmentKind[];
  /** Searched by default in its scopes (paid sources never are). */
  defaultOn: boolean;
  /** Terms the user or operator should know (attribution, non-commercial…). */
  terms: string;
}

export const RESEARCH_SOURCES: ResearchSourceInfo[] = [
  {
    id: "openalex",
    label: "OpenAlex",
    description: "Open index of ~250M scholarly works, authors, venues and citations (CC0).",
    homepage: "https://openalex.org",
    roles: ["discover", "resolve", "enrich"],
    access: "key",
    keyPolicy: "app-or-user",
    appKeyEnv: "OPENALEX_API_KEY",
    rateLimit: { requests: 10, perSeconds: 1 },
    facets: ["yearFrom", "yearTo", "openAccess", "type", "field", "author"],
    resolves: ["openalex", "doi", "pmid", "pmcid"],
    types: ["article", "preprint", "book", "chapter", "dataset", "thesis", "report", "review", "other"],
    enriches: ["references", "citedBy", "related", "copies", "retraction"],
    defaultOn: true,
    terms: "Data CC0. Free daily allowance per key; verify current quota (plan §5.1).",
  },
  {
    id: "semantic-scholar",
    label: "Semantic Scholar",
    description: "Ai2's paper index: one-line TLDRs, recommendations and how papers cite each other.",
    homepage: "https://www.semanticscholar.org",
    roles: ["discover", "resolve", "enrich"],
    access: "key",
    keyPolicy: "app-or-user",
    appKeyEnv: "SEMANTIC_SCHOLAR_API_KEY",
    rateLimit: { requests: 1, perSeconds: 1 },
    facets: ["yearFrom", "yearTo", "openAccess", "field", "venue"],
    resolves: ["s2", "doi", "arxiv", "pmid", "pmcid"],
    types: ["article", "preprint", "review", "book", "chapter", "dataset", "other"],
    enriches: ["references", "citedBy", "related", "tldr", "copies"],
    defaultOn: true,
    terms: "API licence requires attribution; works without a key at a shared, lower limit.",
  },
  {
    id: "crossref",
    label: "Crossref",
    description: "Authoritative DOI metadata, licences, funders and retraction / correction notices.",
    homepage: "https://www.crossref.org",
    roles: ["discover", "resolve", "enrich"],
    access: "email",
    keyPolicy: "app",
    appKeyEnv: "RESEARCH_CONTACT_EMAIL",
    rateLimit: { requests: 10, perSeconds: 1 },
    facets: ["yearFrom", "yearTo", "type", "author", "venue"],
    resolves: ["doi"],
    types: ["article", "book", "chapter", "dataset", "report", "thesis", "preprint", "other"],
    enriches: ["retraction"],
    defaultOn: true,
    terms: "Metadata is open; the contact email joins the polite pool (a project address, never the user's).",
  },
  {
    id: "unpaywall",
    label: "Unpaywall",
    description: "Finds the legal open-access copy of a DOI, with its licence and version.",
    homepage: "https://unpaywall.org",
    roles: ["resolve"],
    access: "email",
    keyPolicy: "app",
    appKeyEnv: "RESEARCH_CONTACT_EMAIL",
    rateLimit: { requests: 10, perSeconds: 1 },
    facets: [],
    resolves: ["doi"],
    types: ["article", "preprint", "book", "chapter", "dataset", "other"],
    enriches: ["copies"],
    defaultOn: true,
    terms: "Free with a contact email; ~100k calls/day.",
  },
];

export function researchSource(id: string): ResearchSourceInfo | undefined {
  return RESEARCH_SOURCES.find((source) => source.id === id);
}
