/**
 * Merging candidates from several sources into Works (client-safe, pure).
 *
 * Candidates that share a strong identifier (`sharesIdentifier` — any scheme
 * but url/zotero) are the same Work, transitively: OpenAlex knows a paper by
 * DOI + PMID, Semantic Scholar by PMID + arXiv — all three are one card.
 *
 * Each field takes the first non-empty value in a per-field source order:
 * Crossref is authoritative for bibliographic facts, Semantic Scholar for
 * abstracts and TLDRs, Unpaywall for licences and copies. Ordering of merged
 * results is reciprocal-rank fusion over each source's own ranking, so a
 * paper several sources rank highly floats up without any source's scores
 * having to be comparable.
 */

import { cleanFace } from "./faces";
import { mergeIdentifiers, sharesIdentifier, workKeyOf } from "./identifiers";
import type { Work, WorkCandidate, WorkCopy, WorkType } from "./types";

type Field = keyof Omit<WorkCandidate, "identifiers" | "source" | "rank">;

const DEFAULT_ORDER = ["crossref", "openalex", "semantic-scholar", "unpaywall"];

const FIELD_ORDER: Partial<Record<Field, string[]>> = {
  abstract: ["semantic-scholar", "openalex", "crossref"],
  tldr: ["semantic-scholar"],
  venue: ["crossref", "openalex", "semantic-scholar"],
  license: ["unpaywall", "crossref", "openalex", "semantic-scholar"],
  citedByCount: ["openalex", "semantic-scholar", "crossref"],
  referenceCount: ["semantic-scholar", "openalex", "crossref"],
  retraction: ["crossref", "openalex"],
  landingUrl: ["crossref", "openalex", "semantic-scholar"],
};

/** RRF constant; 60 is the value from the original paper and works without tuning. */
const RRF_K = 60;

function orderFor(field: Field, sources: string[]): string[] {
  const preferred = FIELD_ORDER[field] ?? DEFAULT_ORDER;
  const rest = sources.filter((source) => !preferred.includes(source)).sort();
  return [...preferred, ...rest];
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0)
  );
}

function pick<T>(group: WorkCandidate[], field: Field): T | undefined {
  const sources = group.map((candidate) => candidate.source);
  for (const source of orderFor(field, sources)) {
    for (const candidate of group) {
      if (candidate.source !== source) continue;
      const value = candidate[field];
      if (!isEmpty(value)) return value as T;
    }
  }
  return undefined;
}

/** A specific type beats "other"; among specific types the source order decides. */
function pickType(group: WorkCandidate[]): WorkType {
  const sources = group.map((candidate) => candidate.source);
  let fallback: WorkType | undefined;
  for (const source of orderFor("type", sources)) {
    for (const candidate of group) {
      if (candidate.source !== source || !candidate.type) continue;
      if (candidate.type !== "other") return candidate.type;
      fallback ??= candidate.type;
    }
  }
  return fallback ?? "other";
}

function mergeCopies(group: WorkCandidate[]): WorkCopy[] {
  const byUrl = new Map<string, WorkCopy>();
  for (const candidate of group) {
    for (const copy of candidate.copies ?? []) {
      const existing = byUrl.get(copy.url);
      // Keep the copy with the most licence information.
      if (!existing || (!existing.license && copy.license)) byUrl.set(copy.url, copy);
    }
  }
  // Published > accepted > submitted; storable first within a version.
  const versionRank = { published: 0, accepted: 1, submitted: 2 } as const;
  return [...byUrl.values()].sort(
    (a, b) =>
      (versionRank[a.version ?? "submitted"] ?? 3) - (versionRank[b.version ?? "submitted"] ?? 3) ||
      Number(b.storable) - Number(a.storable)
  );
}

function mergeFace(group: WorkCandidate[], type: WorkType): Record<string, unknown> {
  const sources = group.map((candidate) => candidate.source);
  const face: Record<string, unknown> = {};
  // Later writes lose: iterate in priority order and keep the first value per key.
  for (const source of orderFor("face", sources)) {
    for (const candidate of group) {
      if (candidate.source !== source) continue;
      for (const [key, value] of Object.entries(candidate.face ?? {})) {
        if (!(key in face) && !isEmpty(value)) face[key] = value;
      }
    }
  }
  return cleanFace(type, face);
}

/** Merge one group of candidates already known to be the same Work. */
export function mergeGroup(group: WorkCandidate[]): Work | null {
  const identifiers = group.reduce((acc, candidate) => mergeIdentifiers(acc, candidate.identifiers), {});
  const key = workKeyOf(identifiers);
  const title = pick<string>(group, "title");
  if (!key || !title) return null;
  const type = pickType(group);
  return {
    key,
    type,
    title,
    authors: pick(group, "authors") ?? [],
    year: pick(group, "year") ?? null,
    venue: pick(group, "venue") ?? null,
    abstract: pick(group, "abstract") ?? null,
    tldr: pick(group, "tldr") ?? null,
    identifiers,
    copies: mergeCopies(group),
    license: pick(group, "license") ?? null,
    citedByCount: pick(group, "citedByCount") ?? null,
    referenceCount: pick(group, "referenceCount") ?? null,
    retraction: pick(group, "retraction") ?? null,
    face: mergeFace(group, type),
    provenance: [...new Set(group.map((candidate) => candidate.source))],
    landingUrl: pick(group, "landingUrl") ?? null,
  };
}

/**
 * Group candidates by shared identifiers (union-find, so A~B and B~C put A, B
 * and C together even when A and C share nothing directly) and merge each
 * group. Results are ordered by reciprocal-rank fusion.
 */
export function mergeCandidates(candidates: WorkCandidate[]): Work[] {
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (find(i) === find(j)) continue;
      if (sharesIdentifier(candidates[i].identifiers, candidates[j].identifiers)) {
        parent[find(j)] = find(i);
      }
    }
  }

  const groups = new Map<number, WorkCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), candidate]);
  });

  const scored: Array<{ work: Work; score: number; first: number }> = [];
  for (const [root, group] of groups) {
    const work = mergeGroup(group);
    if (!work) continue;
    const score = group.reduce((sum, candidate) => sum + 1 / (RRF_K + (candidate.rank ?? 0)), 0);
    scored.push({ work, score, first: root });
  }
  scored.sort((a, b) => b.score - a.score || a.first - b.first);
  return scored.map((entry) => entry.work);
}
