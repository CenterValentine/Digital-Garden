/**
 * Research actions shared by the Find tab and the sidebar Work view:
 * search (streamed), the identifier jump, "More results", and Add.
 *
 * Only the newest request may write results — a slow earlier search resolving
 * late must not overwrite a newer one (the Library's rule) — so each run
 * aborts the previous stream and checks a sequence number.
 */

"use client";

import { toast } from "sonner";
import { parseIdentifierQuery, identifierKey } from "@/lib/domain/research/identifiers";
import { toResearchQuery } from "@/lib/domain/research/query-syntax";
import { RESEARCH_SOURCES } from "@/lib/domain/research/sources";
import type { Work, WorkIdentifier } from "@/lib/domain/research/types";
import { useContentStore } from "@/state/content-store";
import { useResearchStore } from "../state/research-store";
import { researchApi, streamResearchSearch } from "./research-api";

let sequence = 0;
let inflight: AbortController | null = null;

function identifierList(work: Work): WorkIdentifier[] {
  return Object.entries(work.identifiers).flatMap(([scheme, values]) =>
    (values ?? []).filter(() => scheme !== "url").map((value) => ({ scheme, value }))
  );
}

export async function runResearchSearch(options: { append?: boolean } = {}): Promise<void> {
  const store = useResearchStore.getState();
  const raw = store.text.trim();
  if (!raw) return;
  const append = Boolean(options.append);
  const seq = ++sequence;
  inflight?.abort();
  const controller = new AbortController();
  inflight = controller;

  // A whole-query identifier jumps straight to the Work (§2.2.3).
  if (!append) {
    const identifiers = parseIdentifierQuery(raw);
    if (identifiers) {
      store.startSearch(false);
      try {
        const result = await researchApi.resolve(raw);
        if (seq !== sequence) return;
        if (result.kind === "link" && result.link) {
          store.showSingle(null, { key: identifierKey(result.identifier), ...result.link });
        } else if (result.kind === "work") {
          store.showSingle(result.work, null);
        } else {
          store.showSingle(null, null);
          store.finish("No source knows that identifier yet");
        }
      } catch (error) {
        if (seq === sequence) store.finish(error instanceof Error ? error.message : "Lookup failed");
      }
      return;
    }
  }

  const query = toResearchQuery(raw);
  if (!query.text) {
    // Only tokens — a filter alone isn't a search; keep the box's hint visible.
    store.finish("Add a few words to search for, beside the filters");
    return;
  }
  const previous = append ? store.works : [];
  const cursors = append ? store.cursors : undefined;
  store.startSearch(append);
  try {
    await streamResearchSearch(
      { scope: store.scope, query, include: store.include, exclude: store.exclude, cursors },
      (event) => {
        if (seq !== sequence) return;
        const current = useResearchStore.getState();
        if (event.type === "source") current.receiveReport(event.report);
        else if (event.type === "works") current.receiveWorks(event.works, append, previous);
        else if (event.type === "error") current.finish(event.message);
        else if (event.type === "done") current.finish();
      },
      controller.signal
    );
  } catch (error) {
    if (controller.signal.aborted || seq !== sequence) return;
    useResearchStore.getState().finish(error instanceof Error ? error.message : "Search failed");
  }
}

export function hasMoreResults(): boolean {
  return Object.values(useResearchStore.getState().cursors).some(Boolean);
}

function openSaved(contentId: string, title: string, policy: string) {
  useContentStore.getState().setSelectedContentId(contentId, {
    title,
    contentType: policy === "stored" ? "file" : "external",
    pin: true,
  });
}

/** "Research / Goats" for the folder a saved node landed in; "the top of your tree" at the root. */
async function folderPathOf(contentId: string): Promise<string> {
  try {
    const response = await fetch(`/api/content/content/${contentId}/path`, { credentials: "include" });
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    const data = body.data as { ancestors?: Array<{ title: string }> } | Array<{ title: string }> | undefined;
    const ancestors = Array.isArray(data) ? data : data?.ancestors ?? [];
    const titles = ancestors.map((ancestor) => ancestor.title).filter(Boolean);
    return titles.length ? titles.join(" / ") : "the top of your tree";
  } catch {
    return "your library";
  }
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Add a Work (or the Law stub's link) to the folder the tab was opened for. */
export async function addWorkToFolder(work: Work | { key: string; title: string }, options: { open?: boolean } = {}) {
  const store = useResearchStore.getState();
  const existing = store.saved[work.key];
  if (existing) {
    if (options.open) openSaved(existing.contentId, work.title, existing.copyPolicy);
    return;
  }
  try {
    const isWork = "identifiers" in work;
    const result = await researchApi.save({
      key: work.key,
      identifiers: isWork ? identifierList(work) : undefined,
      parentId: store.targetParentId,
      fallback: isWork ? work : undefined,
    });
    useResearchStore.getState().markSaved(work.key, result.contentId, result.copyPolicy);
    const path = await folderPathOf(result.contentId);
    const how =
      result.copyPolicy === "stored"
        ? `Added to ${path} with its PDF`
        : result.copyPolicy === "on-demand"
          ? `Added to ${path} as a link — its free copy opens on demand`
          : `Added to ${path} as a link`;
    toast.success(result.duplicate ? `“${truncate(work.title)}” is already in ${path}` : how, {
      description: result.duplicate ? undefined : truncate(work.title, 80),
    });
    if (options.open) openSaved(result.contentId, result.title, result.copyPolicy);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not add it");
  }
}

export const PAID_SOURCES = RESEARCH_SOURCES.filter((source) => !source.defaultOn);
