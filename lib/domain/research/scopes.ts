/**
 * Search scopes (client-safe).
 *
 * Users pick a scope, not a source (RESEARCH-READER-PLAN.md §2.2.2). A scope is
 * a named bundle of sources with default types; installing a domain pack
 * installs its scope. Sources inside a scope are a power-user disclosure.
 *
 * `status: "coming"` scopes show in the pack catalog but don't search yet —
 * Law (US) is stubbed in V1.0 (plan §7.1): its identifiers still resolve to
 * link nodes through the identifier box.
 */

import type { WorkType } from "./types";

export type ResearchScopeId =
  | "scholarly"
  | "preprints"
  | "biomedicine"
  | "cs-ml"
  | "law-us"
  | "library"
  | "folder";

export interface ResearchScope {
  id: ResearchScopeId;
  label: string;
  description: string;
  /** null = core (always installed); otherwise the domain pack that adds it. */
  pack: string | null;
  status: "available" | "coming";
  /** Source ids searched in this scope (subject to each source's `defaultOn`). */
  sources: string[];
  /** Types the scope filters to by default; empty = all. */
  types: WorkType[];
  /**
   * Normalized field the scope narrows to; each adapter maps it to its own
   * vocabulary (OpenAlex domains, S2 fieldsOfStudy) — `RESEARCH_FIELDS`.
   */
  field?: ResearchField;
  /** Scopes over the user's own nodes instead of remote sources. */
  local?: boolean;
}

export const RESEARCH_FIELDS = ["biomedicine", "computer-science"] as const;
export type ResearchField = (typeof RESEARCH_FIELDS)[number];

export const RESEARCH_SCOPES: ResearchScope[] = [
  {
    id: "scholarly",
    label: "Everything scholarly",
    description: "Articles, preprints, books and data across the open scholarly indexes.",
    pack: null,
    status: "available",
    sources: ["openalex", "semantic-scholar", "crossref"],
    types: [],
  },
  {
    id: "preprints",
    label: "Preprints",
    description: "Recent work before (or without) peer review.",
    pack: null,
    status: "available",
    sources: ["openalex", "semantic-scholar"],
    types: ["preprint"],
  },
  {
    id: "biomedicine",
    label: "Biomedicine",
    description: "PubMed, Europe PMC, clinical trials and bio/medRxiv preprints.",
    pack: "biomedicine",
    status: "available",
    sources: ["openalex", "semantic-scholar"],
    types: [],
    field: "biomedicine",
  },
  {
    id: "cs-ml",
    label: "CS & ML",
    description: "arXiv, OpenReview (with reviews), DBLP and Hugging Face Papers.",
    pack: "cs-ml",
    status: "available",
    sources: ["openalex", "semantic-scholar"],
    types: [],
    field: "computer-science",
  },
  {
    id: "law-us",
    label: "Law (US)",
    description: "Case law, the US Code and federal regulations. Coming in V1.1 — citations already open as links.",
    pack: "law-us",
    status: "coming",
    sources: [],
    types: ["case", "statute", "regulation"],
  },
  {
    id: "library",
    label: "My library",
    description: "Everything you've saved.",
    pack: null,
    status: "available",
    sources: [],
    types: [],
    local: true,
  },
  {
    id: "folder",
    label: "This folder",
    description: "Works saved in the folder you opened Research from.",
    pack: null,
    status: "available",
    sources: [],
    types: [],
    local: true,
  },
];

export function researchScope(id: string): ResearchScope | undefined {
  return RESEARCH_SCOPES.find((scope) => scope.id === id);
}
