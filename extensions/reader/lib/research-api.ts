/**
 * Client for /api/reader/research/*. Search streams NDJSON events (one per
 * line) so results appear as each source answers.
 */

import type { FederationEvent } from "@/lib/domain/research/federate";
import type { SourceReport } from "@/lib/domain/research/federate";
import type { ResearchQuery, Work, WorkIdentifier } from "@/lib/domain/research/types";
import { ReaderApiError, readerCall } from "./api";

export type SearchStreamEvent = FederationEvent | { type: "done" } | { type: "error"; message: string };

export interface SearchBody {
  scope: string;
  query: ResearchQuery;
  include?: string[];
  exclude?: string[];
  cursors?: Record<string, string | null>;
}

export async function streamResearchSearch(
  body: SearchBody,
  onEvent: (event: SearchStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("/api/reader/research/search", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const error = (await response.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ReaderApiError(
      error?.error?.message ?? `Search failed (${response.status})`,
      error?.error?.code ?? "HTTP_ERROR",
      response.status
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let newline = buffered.indexOf("\n");
    while (newline >= 0) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as SearchStreamEvent);
      newline = buffered.indexOf("\n");
    }
  }
  if (buffered.trim()) onEvent(JSON.parse(buffered) as SearchStreamEvent);
}

export type ResolveResult =
  | { kind: "work"; identifier: WorkIdentifier; work: Work; reports: SourceReport[]; cached: boolean }
  | { kind: "none"; identifier: WorkIdentifier; work: null; reports: SourceReport[]; cached: boolean }
  | { kind: "link"; identifier: WorkIdentifier; link: { title: string; url: string; type: string } | null; work: null; reports: [] };

export interface SaveResult {
  contentId: string;
  title: string;
  parentId: string | null;
  duplicate: boolean;
  copyPolicy: "stored" | "on-demand" | "link";
}

export const researchApi = {
  resolve: (q: string) => readerCall<ResolveResult>(`/api/reader/research/resolve?q=${encodeURIComponent(q)}`),
  save: (body: {
    key: string;
    identifiers?: WorkIdentifier[];
    parentId?: string | null;
    fallback?: Work;
    sourceAdapter?: string;
  }) =>
    readerCall<SaveResult>("/api/reader/research/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
