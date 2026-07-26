/**
 * Wiki-link target resolution (client-safe).
 *
 * Single source of truth for "what note does this [[link]] point at?", shared
 * by every surface that opens one (editor click, context-menu Open, Open in
 * Pane) so they can't drift apart.
 *
 * ORDER MATTERS — id first, title second:
 *
 *   1. `targetId` — the stable ContentNode id captured when the link was
 *      authored via autocomplete. Survives renames, which is the whole point.
 *   2. `targetTitle` — exact (case-insensitive) title search. Covers links with
 *      no id: hand-typed `[[…]]`, AI-authored playbook links, imported
 *      markdown. Also covers an id whose target was hard-deleted but whose
 *      title was since reused.
 *
 * The title fallback is permanent, not transitional — ID-less links keep being
 * created by design. Exact match only: a fuzzy "first search hit" fallback
 * would silently navigate to the wrong note, which is worse than not
 * navigating at all.
 */

import { tracedFetch } from "@/lib/core/logger/client-fetch";

export interface WikiLinkTargetRef {
  targetId?: string | null;
  targetTitle: string;
}

export interface ResolvedWikiLinkTarget {
  id: string;
  title: string;
  contentType: string;
  /**
   * True when the id was missing or stale and the title search found the
   * target. The caller should write `id` back into the node (self-heal).
   */
  needsHeal: boolean;
}

interface ContentSummary {
  id: string;
  title: string;
  contentType: string;
}

/** Resolve by stable id. Returns null on 404/403/deleted so the title fallback runs. */
async function resolveById(targetId: string): Promise<ContentSummary | null> {
  try {
    const response = await tracedFetch(
      `/api/content/content/${encodeURIComponent(targetId)}`,
      { credentials: "include" },
    );
    if (!response.ok) return null;

    const result = (await response.json()) as {
      success?: boolean;
      data?: { id: string; title: string; contentType: string; deletedAt: string | null };
    };
    const item = result?.data;
    if (!result?.success || !item || item.deletedAt) return null;

    return { id: item.id, title: item.title, contentType: item.contentType };
  } catch {
    return null;
  }
}

/** Resolve by exact title. Null unless a search hit matches case-insensitively. */
async function resolveByTitle(targetTitle: string): Promise<ContentSummary | null> {
  try {
    const response = await tracedFetch(
      `/api/content/content?search=${encodeURIComponent(targetTitle)}`,
      { credentials: "include" },
    );
    if (!response.ok) return null;

    const result = (await response.json()) as {
      success?: boolean;
      data?: { items?: ContentSummary[] };
    };
    if (!result?.success) return null;

    return (
      result.data?.items?.find(
        (item) => item.title.toLowerCase() === targetTitle.toLowerCase(),
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Resolve a wiki-link to its target, or null if it's genuinely broken.
 * Never throws — callers treat null as "not found".
 */
export async function resolveWikiLinkTarget(
  ref: WikiLinkTargetRef,
): Promise<ResolvedWikiLinkTarget | null> {
  if (ref.targetId) {
    const byId = await resolveById(ref.targetId);
    if (byId) return { ...byId, needsHeal: false };
  }

  const byTitle = await resolveByTitle(ref.targetTitle);
  if (byTitle) return { ...byTitle, needsHeal: true };

  return null;
}
