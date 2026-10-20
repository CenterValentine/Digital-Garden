/**
 * Research service — what the routes and (later) the AI tools call. One layer,
 * two consumers (RESEARCH-READER-PLAN.md §8): the AI never gets a second,
 * weaker integration.
 */

import "server-only";
import { RESEARCH_ADAPTERS } from "../adapters";
import { federatedSearch, resolveWork, type FederationEvent, type SourceReport } from "../federate";
import { researchScope } from "../scopes";
import type { ResearchQuery, Work, WorkIdentifier } from "../types";
import { readCachedWork, writeCachedWork } from "./cache";
import { researchContext } from "./context";

export class ResearchError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export interface SearchRequest {
  ownerId: string;
  scopeId: string;
  query: ResearchQuery;
  /** Sources the user turned off or (for paid ones) on in the source strip. */
  include?: string[];
  exclude?: string[];
  cursors?: Record<string, string | null>;
  onEvent?: (event: FederationEvent) => void;
}

export async function searchWorks(request: SearchRequest): Promise<{ works: Work[]; reports: SourceReport[] }> {
  const scope = researchScope(request.scopeId);
  if (!scope) throw new ResearchError(`Unknown scope "${request.scopeId}"`);
  if (scope.status !== "available") throw new ResearchError(`${scope.label} is coming soon`, 409);
  if (scope.local) throw new ResearchError("Library scopes search your own items, not remote sources");

  const wanted = new Set(scope.sources);
  for (const id of request.include ?? []) wanted.add(id);
  for (const id of request.exclude ?? []) wanted.delete(id);
  const adapters = RESEARCH_ADAPTERS.filter(
    (adapter) =>
      wanted.has(adapter.info.id) &&
      // Paid sources run only when the user turned them on for this search.
      (adapter.info.defaultOn || request.include?.includes(adapter.info.id))
  );

  const ctx = await researchContext(request.ownerId);
  const query: ResearchQuery = {
    ...request.query,
    types: request.query.types?.length ? request.query.types : scope.types,
    field: request.query.field ?? scope.field,
  };
  return federatedSearch({
    query,
    adapters,
    ctx,
    cursors: request.cursors,
    gate: (source) => ctx.gate(source),
    onEvent: request.onEvent,
  });
}

/** Resolve identifiers to a Work through the shared cache, then the sources. */
export async function resolveIdentifiers(
  ownerId: string,
  identifiers: WorkIdentifier[],
  options: { fresh?: boolean } = {}
): Promise<{ work: Work | null; reports: SourceReport[]; cached: boolean }> {
  if (!identifiers.length) throw new ResearchError("Nothing to resolve");
  if (!options.fresh) {
    const cached = await readCachedWork(identifiers);
    if (cached) return { work: cached, reports: [], cached: true };
  }
  const ctx = await researchContext(ownerId);
  const { work, reports } = await resolveWork({
    identifiers,
    adapters: RESEARCH_ADAPTERS,
    ctx,
    gate: (source) => ctx.gate(source),
  });
  if (work) await writeCachedWork(work);
  return { work, reports, cached: false };
}
