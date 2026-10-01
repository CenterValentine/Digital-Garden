/**
 * Federation: one query, many sources (RESEARCH-READER-PLAN.md §3).
 *
 * Pure orchestration over adapters — the server supplies the context (guarded
 * fetch, credentials, quotas) and streams the events; `research:check` runs
 * the same code against fixtures.
 *
 * - search: every source runs in parallel with its own timeout; after each one
 *   answers, the merged list so far is emitted, so results stream in and a
 *   slow source never holds back a fast one.
 * - resolve: an identifier goes to every source that resolves its scheme, then
 *   a second round asks sources about identifiers learned in the first (an
 *   arXiv id → S2 reveals the DOI → Crossref and Unpaywall can now answer).
 */

import type { AdapterContext, ResearchAdapter } from "./adapter";
import { identifierKey, identifiersFrom, sharesIdentifier } from "./identifiers";
import { mergeCandidates } from "./merge";
import type { ResearchQuery, Work, WorkCandidate, WorkIdentifier } from "./types";

export type SourceStatus = "ok" | "error" | "timeout" | "skipped";

export interface SourceReport {
  source: string;
  status: SourceStatus;
  count: number;
  total: number | null;
  next: string | null;
  ms: number;
  error?: string;
}

export type FederationEvent =
  | { type: "source"; report: SourceReport }
  | { type: "works"; works: Work[] };

export const DEFAULT_SOURCE_TIMEOUT_MS = 12_000;

class SourceTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new SourceTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface FederatedSearchInput {
  query: ResearchQuery;
  adapters: ResearchAdapter[];
  ctx: AdapterContext;
  /** Per-source paging cursor from a previous page's SourceReport.next. */
  cursors?: Record<string, string | null | undefined>;
  timeoutMs?: number;
  /**
   * Called before a source is queried; returning a string skips it with that
   * reason (quota exhausted, paid source not opted in).
   */
  gate?: (source: string) => Promise<string | null> | string | null;
  onEvent?: (event: FederationEvent) => void;
}

export async function federatedSearch(input: FederatedSearchInput): Promise<{ works: Work[]; reports: SourceReport[] }> {
  const candidates: WorkCandidate[] = [];
  const reports: SourceReport[] = [];
  const emit = input.onEvent ?? (() => undefined);
  const searchable = input.adapters.filter((adapter) => adapter.search);
  const timeoutMs = input.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;

  await Promise.all(
    searchable.map(async (adapter) => {
      const source = adapter.info.id;
      const started = Date.now();
      const report = (partial: Omit<SourceReport, "source" | "ms">) => {
        const full = { source, ms: Date.now() - started, ...partial };
        reports.push(full);
        emit({ type: "source", report: full });
      };
      if (input.cursors && source in input.cursors && !input.cursors[source]) {
        // This source has no further pages.
        report({ status: "skipped", count: 0, total: null, next: null, error: "no more results" });
        return;
      }
      const blocked = (await input.gate?.(source)) ?? null;
      if (blocked) {
        report({ status: "skipped", count: 0, total: null, next: null, error: blocked });
        return;
      }
      try {
        const page = await withTimeout(adapter.search!(input.query, input.ctx, input.cursors?.[source]), timeoutMs);
        candidates.push(...page.candidates);
        report({ status: "ok", count: page.candidates.length, total: page.total, next: page.next });
        emit({ type: "works", works: mergeCandidates(candidates) });
      } catch (error) {
        report({
          status: error instanceof SourceTimeout ? "timeout" : "error",
          count: 0,
          total: null,
          next: null,
          error: error instanceof SourceTimeout ? `No answer within ${Math.round(timeoutMs / 1000)}s` : errorText(error),
        });
      }
    })
  );

  return { works: mergeCandidates(candidates), reports };
}

export interface ResolveInput {
  identifiers: WorkIdentifier[];
  adapters: ResearchAdapter[];
  ctx: AdapterContext;
  timeoutMs?: number;
  gate?: FederatedSearchInput["gate"];
}

/**
 * Resolve identifiers to one Work, or null when no source knows them. Two
 * rounds at most: the first over the given identifiers, the second over the
 * ones the first round learned.
 */
export async function resolveWork(input: ResolveInput): Promise<{ work: Work | null; reports: SourceReport[] }> {
  const candidates: WorkCandidate[] = [];
  const reports: SourceReport[] = [];
  const asked = new Set<string>(); // `${source}|${scheme:value}`
  const timeoutMs = input.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;

  async function round(identifiers: WorkIdentifier[]): Promise<void> {
    const jobs: Array<Promise<void>> = [];
    for (const adapter of input.adapters) {
      if (!adapter.resolve) continue;
      // One call per source per round: its best identifier among those it accepts.
      const usable = identifiers.find(
        (identifier) =>
          adapter.info.resolves.includes(identifier.scheme) &&
          !asked.has(`${adapter.info.id}|${identifierKey(identifier)}`)
      );
      if (!usable) continue;
      // A source that already answered for this Work has nothing to add.
      if (candidates.some((candidate) => candidate.source === adapter.info.id)) continue;
      asked.add(`${adapter.info.id}|${identifierKey(usable)}`);
      jobs.push(
        (async () => {
          const started = Date.now();
          const blocked = (await input.gate?.(adapter.info.id)) ?? null;
          if (blocked) {
            reports.push({ source: adapter.info.id, status: "skipped", count: 0, total: null, next: null, ms: 0, error: blocked });
            return;
          }
          try {
            const candidate = await withTimeout(adapter.resolve!(usable, input.ctx), timeoutMs);
            if (candidate) candidates.push(candidate);
            reports.push({
              source: adapter.info.id,
              status: "ok",
              count: candidate ? 1 : 0,
              total: null,
              next: null,
              ms: Date.now() - started,
            });
          } catch (error) {
            reports.push({
              source: adapter.info.id,
              status: error instanceof SourceTimeout ? "timeout" : "error",
              count: 0,
              total: null,
              next: null,
              ms: Date.now() - started,
              error: errorText(error),
            });
          }
        })()
      );
    }
    await Promise.all(jobs);
  }

  await round(input.identifiers);
  const learned = candidates
    .flatMap((candidate) =>
      Object.entries(candidate.identifiers).flatMap(([scheme, values]) =>
        (values ?? []).map((value) => ({ scheme, value }))
      )
    )
    .filter((identifier) => identifier.scheme !== "url");
  if (learned.length) await round(learned);

  // Merging is transitive (arXiv → S2 → DOI → Crossref), so merge everything
  // and keep the Work that answers to what was asked; a source can return an
  // unrelated record for an ambiguous identifier, which then stays out.
  const requested = identifiersFrom(input.identifiers);
  const works = mergeCandidates(candidates);
  const work = works.find((candidate) => sharesIdentifier(candidate.identifiers, requested)) ?? (works.length === 1 ? works[0] : null);
  return { work, reports };
}
