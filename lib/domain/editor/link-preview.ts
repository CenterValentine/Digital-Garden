/**
 * Link preview — what a chip, a card and the hover popover know about a
 * link's target: its type, its current title, and a short excerpt.
 *
 * One cache for every link to the same target: a note that mentions a
 * target four times fetches it once. Entries expire after a minute and are
 * dropped the moment the app broadcasts `content-updated` for that id, so a
 * rename or an edit shows on the next paint rather than the next minute.
 *
 * Resolution follows the link rule (lib/domain/editor/wiki-link-resolve.ts):
 * stable id first, exact title second — a hand-typed link previews too.
 */

import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { tracedFetch } from "@/lib/core/logger/client-fetch";
import { resolveWikiLinkTarget, type WikiLinkTargetRef } from "./wiki-link-resolve";

export interface LinkPreview {
  id: string;
  title: string;
  contentType: string;
  /** First ~200 characters of the note's visible text ("" for non-notes). */
  excerpt: string;
}

const TTL_MS = 60_000;
const EXCERPT_CHARS = 200;

interface CacheEntry {
  at: number;
  value: Promise<LinkPreview | null>;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(ref: WikiLinkTargetRef): string {
  return ref.targetId ? `id:${ref.targetId}` : `title:${ref.targetTitle.trim().toLowerCase()}`;
}

/** Clip to a word boundary so the excerpt never ends mid-word. */
export function excerptOf(text: string, max = EXCERPT_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

async function fetchById(id: string): Promise<LinkPreview | null> {
  try {
    const res = await tracedFetch(`/api/content/content/${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const result = (await res.json()) as {
      success?: boolean;
      data?: {
        id: string;
        title: string;
        contentType: string;
        deletedAt?: string | null;
        note?: { tiptapJson?: unknown } | null;
      };
    };
    const item = result?.data;
    if (!result?.success || !item || item.deletedAt) return null;
    const json = item.note?.tiptapJson;
    const excerpt =
      json && typeof json === "object"
        ? excerptOf(extractSearchTextFromTipTap(json as Parameters<typeof extractSearchTextFromTipTap>[0]))
        : "";
    return { id: item.id, title: item.title, contentType: item.contentType, excerpt };
  } catch {
    return null;
  }
}

async function load(ref: WikiLinkTargetRef): Promise<LinkPreview | null> {
  if (ref.targetId) {
    const byId = await fetchById(ref.targetId);
    if (byId) return byId;
  }
  if (!ref.targetTitle?.trim()) return null;
  const resolved = await resolveWikiLinkTarget({ targetId: null, targetTitle: ref.targetTitle });
  return resolved ? fetchById(resolved.id) : null;
}

/** Preview for a link's target; null when it cannot be resolved. Cached. */
export function fetchLinkPreview(ref: WikiLinkTargetRef): Promise<LinkPreview | null> {
  const key = cacheKey(ref);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = load(ref).then((preview) => {
    // A miss is not cached for the full TTL — the note may be about to be
    // created (the send-to-new-note flow links before the tree refreshes).
    if (!preview) cache.delete(key);
    return preview;
  });
  cache.set(key, { at: now, value });
  return value;
}

export function invalidateLinkPreview(contentId: string): void {
  cache.delete(`id:${contentId}`);
  // Title-keyed entries may point at the same node; cheapest is to drop them.
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith("title:")) cache.delete(key);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("content-updated", (event) => {
    const detail = (event as CustomEvent<{ contentId?: string }>).detail;
    if (detail?.contentId) invalidateLinkPreview(detail.contentId);
  });
}
