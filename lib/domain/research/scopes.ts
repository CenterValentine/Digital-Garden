/**
 * Search scopes (client-safe).
 *
 * Users pick a scope, not a source (RESEARCH-READER-PLAN.md §2.2.2). A scope is
 * a named bundle of sources with default types and, for subject scopes, a
 * field (`fields.ts`) each adapter maps to its own classification. Installing
 * a domain pack refines a subject scope with its own sources (Biomedicine
 * gains PubMed and trials; CS & ML gains arXiv and OpenReview); until then the
 * subject scopes run on the core sources, which classify every work anyway.
 *
 * `status: "coming"` scopes show in the picker but don't search yet — Law
 * (US) is stubbed in V1.0 (plan §7.1): its identifiers still resolve to link
 * nodes through the identifier box.
 */

import { FIELD_GROUPS, RESEARCH_FIELDS, type ResearchFieldInfo } from "./fields";
import type { WorkType } from "./types";

export type { ResearchFieldInfo };
export type ResearchField = string;

export interface ResearchScope {
  id: string;
  label: string;
  description: string;
  /** Picker group. */
  group: "Everything" | (typeof FIELD_GROUPS)[number] | "Packs" | "Yours";
  /** null = core (always installed); otherwise the domain pack that adds it. */
  pack: string | null;
  status: "available" | "coming";
  /** Source ids searched in this scope (subject to each source's `defaultOn`). */
  sources: string[];
  /** Types the scope filters to by default; empty = all. */
  types: WorkType[];
  /** Subject field id (`fields.ts`) each adapter maps to its own vocabulary. */
  field?: ResearchField;
  /** Scopes over the user's own nodes instead of remote sources. */
  local?: boolean;
}

const CORE_SOURCES = ["openalex", "semantic-scholar", "crossref"];

const subjectScopes: ResearchScope[] = RESEARCH_FIELDS.filter((field) => field.id !== "law").map((field) => ({
  id: field.id,
  label: field.label,
  description: `Works the indexes classify under ${field.label.toLowerCase()}.`,
  group: field.group,
  pack: field.id === "biomedicine" ? "biomedicine" : field.id === "computer-science" ? "cs-ml" : null,
  status: "available",
  sources: CORE_SOURCES,
  types: [],
  field: field.id,
}));

export const RESEARCH_SCOPES: ResearchScope[] = [
  {
    id: "scholarly",
    label: "Everything scholarly",
    description: "Articles, preprints, books and data across the open scholarly indexes.",
    group: "Everything",
    pack: null,
    status: "available",
    sources: CORE_SOURCES,
    types: [],
  },
  {
    id: "preprints",
    label: "Preprints",
    description: "Recent work before (or without) peer review.",
    group: "Everything",
    pack: null,
    status: "available",
    sources: ["openalex", "semantic-scholar"],
    types: ["preprint"],
  },
  ...subjectScopes,
  {
    id: "law-us",
    label: "Law (US)",
    description: "Case law, the US Code and federal regulations. Coming in V1.1 — citations already open as links.",
    group: "Packs",
    pack: "law-us",
    status: "coming",
    sources: [],
    types: ["case", "statute", "regulation"],
    field: "law",
  },
  {
    id: "library",
    label: "My library",
    description: "Everything you've saved.",
    group: "Yours",
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
    group: "Yours",
    pack: null,
    status: "available",
    sources: [],
    types: [],
    local: true,
  },
];

export const SCOPE_GROUPS: ResearchScope["group"][] = ["Everything", ...FIELD_GROUPS, "Packs", "Yours"];

export function researchScope(id: string): ResearchScope | undefined {
  return RESEARCH_SCOPES.find((scope) => scope.id === id);
}
